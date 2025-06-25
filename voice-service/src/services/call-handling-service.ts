/**
 * Call Handling Service
 * Manages voice calls, routing, queuing, and integration with telephony providers
 */

import twilio from 'twilio';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { redis } from '@/services/redis';
import { speechToTextService } from '@/services/speech-to-text-service';
import { textToSpeechService } from '@/services/text-to-speech-service';

export interface Call {
  id: string;
  organizationId: string;
  fromNumber: string;
  toNumber: string;
  status: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'no-answer' | 'busy';
  direction: 'inbound' | 'outbound';
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  recordingUrl?: string;
  transcriptionId?: string;
  agentId?: string;
  queueId?: string;
  metadata: {
    customerInfo?: {
      name?: string;
      email?: string;
      customerId?: string;
    };
    callReason?: string;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    tags: string[];
    notes: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CallQueue {
  id: string;
  name: string;
  organizationId: string;
  maxSize: number;
  timeoutSeconds: number;
  routingStrategy: 'round-robin' | 'longest-idle' | 'skill-based' | 'priority';
  agents: string[];
  isActive: boolean;
  currentCalls: string[];
  waitingCalls: string[];
  settings: {
    musicOnHold?: string;
    announcements: string[];
    estimatedWaitTime: boolean;
    callbackOption: boolean;
    voicemailOption: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface Agent {
  id: string;
  organizationId: string;
  userId: string;
  status: 'available' | 'busy' | 'away' | 'offline';
  skills: string[];
  maxConcurrentCalls: number;
  currentCalls: string[];
  lastActivity: Date;
  phoneNumber?: string;
  extension?: string;
}

export interface CallAnalytics {
  callId: string;
  organizationId: string;
  sentiment: {
    overall: 'positive' | 'neutral' | 'negative';
    score: number;
    confidence: number;
  };
  keywords: Array<{
    word: string;
    frequency: number;
    sentiment: number;
  }>;
  emotions: Array<{
    emotion: string;
    intensity: number;
    timestamp: number;
  }>;
  talkTime: {
    agent: number;
    customer: number;
    silence: number;
  };
  interruptionCount: number;
  escalationIndicators: string[];
  satisfactionPrediction: number;
}

export class CallHandlingService {
  private static instance: CallHandlingService;
  private twilioClient: twilio.Twilio;
  private activeCalls: Map<string, Call> = new Map();
  private callQueues: Map<string, CallQueue> = new Map();
  private agents: Map<string, Agent> = new Map();

  private constructor() {
    this.twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
    this.initializeQueues();
    this.startQueueProcessing();
  }

  public static getInstance(): CallHandlingService {
    if (!CallHandlingService.instance) {
      CallHandlingService.instance = new CallHandlingService();
    }
    return CallHandlingService.instance;
  }

  /**
   * Handle incoming call
   */
  public async handleIncomingCall(
    fromNumber: string,
    toNumber: string,
    organizationId: string,
    metadata: Partial<Call['metadata']> = {}
  ): Promise<Call> {
    try {
      const call: Call = {
        id: this.generateCallId(),
        organizationId,
        fromNumber,
        toNumber,
        status: 'queued',
        direction: 'inbound',
        metadata: {
          priority: metadata.priority || 'normal',
          tags: metadata.tags || [],
          notes: metadata.notes || [],
          ...metadata,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.activeCalls.set(call.id, call);

      // Find appropriate queue
      const queue = await this.findBestQueue(organizationId, call);
      if (queue) {
        await this.addCallToQueue(call.id, queue.id);
      }

      // Start call processing
      await this.processCall(call);

      logger.info('Incoming call handled', {
        callId: call.id,
        fromNumber,
        toNumber,
        organizationId,
        queueId: queue?.id,
      });

      return call;
    } catch (error) {
      logger.error('Error handling incoming call', {
        fromNumber,
        toNumber,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Make outbound call
   */
  public async makeOutboundCall(
    toNumber: string,
    organizationId: string,
    agentId: string,
    metadata: Partial<Call['metadata']> = {}
  ): Promise<Call> {
    try {
      const call: Call = {
        id: this.generateCallId(),
        organizationId,
        fromNumber: config.twilio.phoneNumber,
        toNumber,
        status: 'queued',
        direction: 'outbound',
        agentId,
        metadata: {
          priority: metadata.priority || 'normal',
          tags: metadata.tags || [],
          notes: metadata.notes || [],
          ...metadata,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.activeCalls.set(call.id, call);

      // Initiate Twilio call
      const twilioCall = await this.twilioClient.calls.create({
        to: toNumber,
        from: config.twilio.phoneNumber,
        url: `${config.twilio.webhookUrl}/voice/outbound/${call.id}`,
        record: config.call.recordingEnabled,
        timeout: config.call.queueTimeout,
      });

      call.status = 'ringing';
      call.startTime = new Date();
      call.updatedAt = new Date();

      logger.info('Outbound call initiated', {
        callId: call.id,
        toNumber,
        organizationId,
        agentId,
        twilioSid: twilioCall.sid,
      });

      return call;
    } catch (error) {
      logger.error('Error making outbound call', {
        toNumber,
        organizationId,
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Process call through IVR or direct routing
   */
  private async processCall(call: Call): Promise<void> {
    try {
      if (config.features.ivr && config.ivr.enabled) {
        await this.processIVR(call);
      } else {
        await this.routeCallDirectly(call);
      }
    } catch (error) {
      logger.error('Error processing call', {
        callId: call.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Process Interactive Voice Response (IVR)
   */
  private async processIVR(call: Call): Promise<void> {
    try {
      // Generate welcome message
      const welcomeText = await this.getIVRWelcomeMessage(call.organizationId);
      const welcomeAudio = await textToSpeechService.synthesizeSpeech({
        text: welcomeText,
        languageCode: config.ivr.defaultLanguage,
        metadata: { callId: call.id },
      });

      // Start IVR flow
      const ivrResponse = await this.twilioClient.calls.create({
        to: call.fromNumber,
        from: call.toNumber,
        url: `${config.twilio.webhookUrl}/voice/ivr/${call.id}`,
        record: config.call.recordingEnabled,
      });

      call.status = 'in-progress';
      call.startTime = new Date();
      call.updatedAt = new Date();

      logger.info('IVR processing started', {
        callId: call.id,
        twilioSid: ivrResponse.sid,
      });
    } catch (error) {
      logger.error('Error processing IVR', {
        callId: call.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Route call directly to available agent
   */
  private async routeCallDirectly(call: Call): Promise<void> {
    try {
      const agent = await this.findAvailableAgent(call.organizationId, call);
      
      if (agent) {
        await this.connectCallToAgent(call.id, agent.id);
      } else {
        // No agents available, add to queue
        const queue = await this.findBestQueue(call.organizationId, call);
        if (queue) {
          await this.addCallToQueue(call.id, queue.id);
        }
      }
    } catch (error) {
      logger.error('Error routing call directly', {
        callId: call.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Connect call to agent
   */
  public async connectCallToAgent(callId: string, agentId: string): Promise<boolean> {
    try {
      const call = this.activeCalls.get(callId);
      const agent = this.agents.get(agentId);

      if (!call || !agent) {
        throw new Error('Call or agent not found');
      }

      if (agent.status !== 'available') {
        throw new Error('Agent not available');
      }

      // Update call status
      call.agentId = agentId;
      call.status = 'in-progress';
      call.startTime = new Date();
      call.updatedAt = new Date();

      // Update agent status
      agent.status = 'busy';
      agent.currentCalls.push(callId);
      agent.lastActivity = new Date();

      // Start call recording and transcription
      if (config.features.callRecording) {
        await this.startCallRecording(call);
      }

      if (config.features.realTimeTranscription) {
        await this.startCallTranscription(call);
      }

      logger.info('Call connected to agent', {
        callId,
        agentId,
        organizationId: call.organizationId,
      });

      return true;
    } catch (error) {
      logger.error('Error connecting call to agent', {
        callId,
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * End call
   */
  public async endCall(callId: string, reason: string = 'completed'): Promise<boolean> {
    try {
      const call = this.activeCalls.get(callId);
      if (!call) {
        return false;
      }

      call.status = reason as any;
      call.endTime = new Date();
      call.duration = call.startTime ? call.endTime.getTime() - call.startTime.getTime() : 0;
      call.updatedAt = new Date();

      // Update agent availability
      if (call.agentId) {
        const agent = this.agents.get(call.agentId);
        if (agent) {
          agent.currentCalls = agent.currentCalls.filter(id => id !== callId);
          if (agent.currentCalls.length === 0) {
            agent.status = 'available';
          }
          agent.lastActivity = new Date();
        }
      }

      // Stop transcription
      if (call.transcriptionId) {
        await speechToTextService.endStreamingTranscription(call.transcriptionId);
      }

      // Generate call analytics
      if (config.features.sentimentAnalysis) {
        await this.generateCallAnalytics(call);
      }

      // Store call record
      await this.storeCallRecord(call);

      // Remove from active calls
      this.activeCalls.delete(callId);

      logger.info('Call ended', {
        callId,
        duration: call.duration,
        reason,
        organizationId: call.organizationId,
      });

      return true;
    } catch (error) {
      logger.error('Error ending call', {
        callId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Add call to queue
   */
  private async addCallToQueue(callId: string, queueId: string): Promise<boolean> {
    try {
      const call = this.activeCalls.get(callId);
      const queue = this.callQueues.get(queueId);

      if (!call || !queue) {
        return false;
      }

      if (queue.waitingCalls.length >= queue.maxSize) {
        // Queue is full, handle overflow
        await this.handleQueueOverflow(call, queue);
        return false;
      }

      call.queueId = queueId;
      call.status = 'queued';
      call.updatedAt = new Date();

      queue.waitingCalls.push(callId);

      logger.info('Call added to queue', {
        callId,
        queueId,
        queuePosition: queue.waitingCalls.length,
        organizationId: call.organizationId,
      });

      return true;
    } catch (error) {
      logger.error('Error adding call to queue', {
        callId,
        queueId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Find best queue for call
   */
  private async findBestQueue(organizationId: string, call: Call): Promise<CallQueue | null> {
    try {
      // Find queues for organization
      const orgQueues = Array.from(this.callQueues.values())
        .filter(queue => queue.organizationId === organizationId && queue.isActive);

      if (orgQueues.length === 0) {
        return null;
      }

      // Simple routing - find queue with shortest wait time
      let bestQueue = orgQueues[0];
      let shortestWait = bestQueue.waitingCalls.length;

      for (const queue of orgQueues) {
        if (queue.waitingCalls.length < shortestWait) {
          bestQueue = queue;
          shortestWait = queue.waitingCalls.length;
        }
      }

      return bestQueue;
    } catch (error) {
      logger.error('Error finding best queue', {
        organizationId,
        callId: call.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Find available agent
   */
  private async findAvailableAgent(organizationId: string, call: Call): Promise<Agent | null> {
    try {
      const availableAgents = Array.from(this.agents.values())
        .filter(agent => 
          agent.organizationId === organizationId &&
          agent.status === 'available' &&
          agent.currentCalls.length < agent.maxConcurrentCalls
        );

      if (availableAgents.length === 0) {
        return null;
      }

      // Simple routing - return first available agent
      // TODO: Implement skill-based routing
      return availableAgents[0];
    } catch (error) {
      logger.error('Error finding available agent', {
        organizationId,
        callId: call.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Start call recording
   */
  private async startCallRecording(call: Call): Promise<void> {
    try {
      // TODO: Implement call recording with Twilio
      logger.debug('Call recording started', { callId: call.id });
    } catch (error) {
      logger.error('Error starting call recording', {
        callId: call.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Start call transcription
   */
  private async startCallTranscription(call: Call): Promise<void> {
    try {
      const session = await speechToTextService.startStreamingTranscription(
        call.id,
        call.organizationId,
        config.voice.languageCode,
        call.id
      );

      call.transcriptionId = session.sessionId;
      call.updatedAt = new Date();

      logger.debug('Call transcription started', {
        callId: call.id,
        sessionId: session.sessionId,
      });
    } catch (error) {
      logger.error('Error starting call transcription', {
        callId: call.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Generate call analytics
   */
  private async generateCallAnalytics(call: Call): Promise<void> {
    try {
      // TODO: Implement sentiment analysis and call analytics
      logger.debug('Generating call analytics', { callId: call.id });
    } catch (error) {
      logger.error('Error generating call analytics', {
        callId: call.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Store call record
   */
  private async storeCallRecord(call: Call): Promise<void> {
    try {
      // TODO: Store call record in database
      await redis.set(`call:${call.id}`, call, { ttl: 30 * 24 * 60 * 60 }); // 30 days
      
      logger.debug('Call record stored', { callId: call.id });
    } catch (error) {
      logger.error('Error storing call record', {
        callId: call.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle queue overflow
   */
  private async handleQueueOverflow(call: Call, queue: CallQueue): Promise<void> {
    try {
      if (queue.settings.callbackOption) {
        // Offer callback option
        await this.offerCallback(call);
      } else if (queue.settings.voicemailOption) {
        // Route to voicemail
        await this.routeToVoicemail(call);
      } else {
        // Play busy message and end call
        await this.playBusyMessage(call);
      }
    } catch (error) {
      logger.error('Error handling queue overflow', {
        callId: call.id,
        queueId: queue.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get IVR welcome message
   */
  private async getIVRWelcomeMessage(organizationId: string): Promise<string> {
    // TODO: Get customized welcome message from organization settings
    return "Thank you for calling. Please hold while we connect you to the next available agent.";
  }

  /**
   * Offer callback
   */
  private async offerCallback(call: Call): Promise<void> {
    // TODO: Implement callback functionality
    logger.debug('Offering callback', { callId: call.id });
  }

  /**
   * Route to voicemail
   */
  private async routeToVoicemail(call: Call): Promise<void> {
    // TODO: Implement voicemail routing
    logger.debug('Routing to voicemail', { callId: call.id });
  }

  /**
   * Play busy message
   */
  private async playBusyMessage(call: Call): Promise<void> {
    // TODO: Implement busy message playback
    logger.debug('Playing busy message', { callId: call.id });
  }

  /**
   * Initialize default queues
   */
  private async initializeQueues(): Promise<void> {
    // TODO: Load queues from database
    logger.debug('Call queues initialized');
  }

  /**
   * Start queue processing
   */
  private startQueueProcessing(): void {
    setInterval(async () => {
      await this.processQueues();
    }, 5000); // Process every 5 seconds
  }

  /**
   * Process all queues
   */
  private async processQueues(): Promise<void> {
    for (const queue of this.callQueues.values()) {
      if (queue.waitingCalls.length > 0) {
        await this.processQueue(queue);
      }
    }
  }

  /**
   * Process individual queue
   */
  private async processQueue(queue: CallQueue): Promise<void> {
    try {
      const availableAgents = Array.from(this.agents.values())
        .filter(agent => 
          agent.organizationId === queue.organizationId &&
          agent.status === 'available' &&
          queue.agents.includes(agent.id)
        );

      if (availableAgents.length === 0) {
        return;
      }

      const callId = queue.waitingCalls.shift();
      if (callId) {
        const agent = availableAgents[0];
        await this.connectCallToAgent(callId, agent.id);
      }
    } catch (error) {
      logger.error('Error processing queue', {
        queueId: queue.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Generate unique call ID
   */
  private generateCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get call statistics
   */
  public getCallStatistics(): {
    activeCalls: number;
    queuedCalls: number;
    availableAgents: number;
    busyAgents: number;
  } {
    const activeCalls = this.activeCalls.size;
    const queuedCalls = Array.from(this.callQueues.values())
      .reduce((total, queue) => total + queue.waitingCalls.length, 0);
    const availableAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === 'available').length;
    const busyAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === 'busy').length;

    return {
      activeCalls,
      queuedCalls,
      availableAgents,
      busyAgents,
    };
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{ twilio: boolean; queues: number; agents: number }> {
    try {
      // Check Twilio connectivity
      const twilioHealth = await this.twilioClient.api.accounts(config.twilio.accountSid).fetch();
      
      return {
        twilio: !!twilioHealth,
        queues: this.callQueues.size,
        agents: this.agents.size,
      };
    } catch (error) {
      logger.error('Call handling health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        twilio: false,
        queues: this.callQueues.size,
        agents: this.agents.size,
      };
    }
  }
}

// Export singleton instance
export const callHandlingService = CallHandlingService.getInstance();
