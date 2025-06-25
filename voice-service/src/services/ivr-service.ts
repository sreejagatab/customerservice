/**
 * Interactive Voice Response (IVR) Service
 * Handles automated voice menus, call routing, and customer self-service
 */

import { config } from '@/config';
import { logger } from '@/utils/logger';
import { redis } from '@/services/redis';
import { textToSpeechService } from '@/services/text-to-speech-service';
import { speechToTextService } from '@/services/speech-to-text-service';

export interface IVRFlow {
  id: string;
  name: string;
  organizationId: string;
  isActive: boolean;
  entryPoint: string;
  nodes: IVRNode[];
  settings: {
    defaultLanguage: string;
    maxRetries: number;
    timeout: number;
    enableSpeechRecognition: boolean;
    fallbackToAgent: boolean;
    recordCalls: boolean;
  };
  analytics: {
    totalCalls: number;
    completionRate: number;
    averageDuration: number;
    dropOffPoints: Record<string, number>;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface IVRNode {
  id: string;
  type: 'menu' | 'prompt' | 'action' | 'condition' | 'transfer' | 'hangup';
  name: string;
  config: {
    // Menu configuration
    menuOptions?: Array<{
      key: string;
      label: string;
      nextNodeId: string;
      speechKeywords?: string[];
    }>;
    
    // Prompt configuration
    promptText?: string;
    promptAudio?: string;
    inputType?: 'dtmf' | 'speech' | 'both';
    inputValidation?: {
      pattern?: string;
      minLength?: number;
      maxLength?: number;
      allowedValues?: string[];
    };
    
    // Action configuration
    actionType?: 'collect_info' | 'play_message' | 'send_sms' | 'send_email' | 'api_call';
    actionParams?: Record<string, any>;
    
    // Condition configuration
    conditionType?: 'time_based' | 'caller_data' | 'queue_status' | 'custom';
    conditionRules?: Array<{
      field: string;
      operator: 'equals' | 'contains' | 'greater_than' | 'less_than';
      value: any;
      nextNodeId: string;
    }>;
    
    // Transfer configuration
    transferType?: 'agent' | 'queue' | 'external' | 'voicemail';
    transferTarget?: string;
    
    // Common settings
    retryLimit?: number;
    timeoutSeconds?: number;
    errorNodeId?: string;
    successNodeId?: string;
  };
  position: { x: number; y: number };
  createdAt: Date;
  updatedAt: Date;
}

export interface IVRSession {
  id: string;
  callId: string;
  organizationId: string;
  flowId: string;
  currentNodeId: string;
  sessionData: Record<string, any>;
  callHistory: Array<{
    nodeId: string;
    timestamp: Date;
    input?: string;
    duration: number;
  }>;
  startTime: Date;
  lastActivity: Date;
  isActive: boolean;
  language: string;
  retryCount: number;
}

export interface IVRAnalytics {
  flowId: string;
  organizationId: string;
  timeRange: { start: Date; end: Date };
  metrics: {
    totalSessions: number;
    completedSessions: number;
    abandonedSessions: number;
    averageSessionDuration: number;
    mostUsedPaths: Array<{
      path: string[];
      count: number;
      percentage: number;
    }>;
    dropOffPoints: Array<{
      nodeId: string;
      nodeName: string;
      dropOffCount: number;
      dropOffRate: number;
    }>;
    inputAccuracy: {
      dtmfAccuracy: number;
      speechAccuracy: number;
      retryRate: number;
    };
    transferRates: {
      toAgent: number;
      toVoicemail: number;
      external: number;
    };
  };
}

export class IVRService {
  private static instance: IVRService;
  private activeSessions: Map<string, IVRSession> = new Map();
  private ivrFlows: Map<string, IVRFlow> = new Map();

  private constructor() {
    this.loadIVRFlows();
    this.startSessionCleanup();
  }

  public static getInstance(): IVRService {
    if (!IVRService.instance) {
      IVRService.instance = new IVRService();
    }
    return IVRService.instance;
  }

  /**
   * Start IVR session for a call
   */
  public async startIVRSession(
    callId: string,
    organizationId: string,
    flowId?: string,
    language?: string
  ): Promise<IVRSession> {
    try {
      // Find appropriate IVR flow
      const flow = flowId ? 
        this.ivrFlows.get(flowId) : 
        await this.findDefaultFlow(organizationId);

      if (!flow) {
        throw new Error('No IVR flow found');
      }

      const session: IVRSession = {
        id: this.generateSessionId(),
        callId,
        organizationId,
        flowId: flow.id,
        currentNodeId: flow.entryPoint,
        sessionData: {},
        callHistory: [],
        startTime: new Date(),
        lastActivity: new Date(),
        isActive: true,
        language: language || flow.settings.defaultLanguage,
        retryCount: 0,
      };

      this.activeSessions.set(session.id, session);

      // Start processing the first node
      await this.processNode(session, flow.entryPoint);

      logger.info('IVR session started', {
        sessionId: session.id,
        callId,
        organizationId,
        flowId: flow.id,
      });

      return session;
    } catch (error) {
      logger.error('Error starting IVR session', {
        callId,
        organizationId,
        flowId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Process user input in IVR session
   */
  public async processInput(
    sessionId: string,
    input: string,
    inputType: 'dtmf' | 'speech'
  ): Promise<{ success: boolean; nextAction?: string; message?: string }> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session || !session.isActive) {
        throw new Error('Invalid or inactive IVR session');
      }

      const flow = this.ivrFlows.get(session.flowId);
      if (!flow) {
        throw new Error('IVR flow not found');
      }

      const currentNode = flow.nodes.find(node => node.id === session.currentNodeId);
      if (!currentNode) {
        throw new Error('Current IVR node not found');
      }

      session.lastActivity = new Date();

      // Validate input
      const validationResult = await this.validateInput(currentNode, input, inputType);
      if (!validationResult.valid) {
        session.retryCount++;
        
        if (session.retryCount >= (currentNode.config.retryLimit || flow.settings.maxRetries)) {
          // Max retries reached, handle error
          return await this.handleMaxRetries(session, flow);
        }

        return {
          success: false,
          message: validationResult.errorMessage,
        };
      }

      // Reset retry count on successful input
      session.retryCount = 0;

      // Store input in session data
      if (currentNode.config.actionType === 'collect_info') {
        const fieldName = currentNode.config.actionParams?.fieldName || currentNode.id;
        session.sessionData[fieldName] = input;
      }

      // Record in call history
      session.callHistory.push({
        nodeId: session.currentNodeId,
        timestamp: new Date(),
        input,
        duration: Date.now() - session.lastActivity.getTime(),
      });

      // Determine next node
      const nextNodeId = await this.determineNextNode(currentNode, input, session);
      if (nextNodeId) {
        session.currentNodeId = nextNodeId;
        await this.processNode(session, nextNodeId);
      }

      return { success: true };
    } catch (error) {
      logger.error('Error processing IVR input', {
        sessionId,
        input,
        inputType,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        success: false,
        message: 'An error occurred processing your input',
      };
    }
  }

  /**
   * Process IVR node
   */
  private async processNode(session: IVRSession, nodeId: string): Promise<void> {
    try {
      const flow = this.ivrFlows.get(session.flowId);
      if (!flow) {
        throw new Error('IVR flow not found');
      }

      const node = flow.nodes.find(n => n.id === nodeId);
      if (!node) {
        throw new Error('IVR node not found');
      }

      switch (node.type) {
        case 'menu':
          await this.processMenuNode(session, node);
          break;
        case 'prompt':
          await this.processPromptNode(session, node);
          break;
        case 'action':
          await this.processActionNode(session, node);
          break;
        case 'condition':
          await this.processConditionNode(session, node);
          break;
        case 'transfer':
          await this.processTransferNode(session, node);
          break;
        case 'hangup':
          await this.processHangupNode(session, node);
          break;
      }
    } catch (error) {
      logger.error('Error processing IVR node', {
        sessionId: session.id,
        nodeId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Process menu node
   */
  private async processMenuNode(session: IVRSession, node: IVRNode): Promise<void> {
    try {
      // Generate menu prompt
      let menuText = node.config.promptText || 'Please select from the following options: ';
      
      if (node.config.menuOptions) {
        for (const option of node.config.menuOptions) {
          menuText += `Press ${option.key} for ${option.label}. `;
        }
      }

      // Generate audio
      const audioResult = await textToSpeechService.synthesizeSpeech({
        text: menuText,
        languageCode: session.language,
        metadata: { sessionId: session.id, nodeId: node.id },
      });

      // TODO: Play audio to caller via Twilio
      logger.debug('Menu audio generated', {
        sessionId: session.id,
        nodeId: node.id,
        audioSize: audioResult.audioContent.length,
      });
    } catch (error) {
      logger.error('Error processing menu node', {
        sessionId: session.id,
        nodeId: node.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Process prompt node
   */
  private async processPromptNode(session: IVRSession, node: IVRNode): Promise<void> {
    try {
      const promptText = node.config.promptText || 'Please provide your input.';

      // Generate audio
      const audioResult = await textToSpeechService.synthesizeSpeech({
        text: promptText,
        languageCode: session.language,
        metadata: { sessionId: session.id, nodeId: node.id },
      });

      // TODO: Play audio and collect input via Twilio
      logger.debug('Prompt audio generated', {
        sessionId: session.id,
        nodeId: node.id,
        inputType: node.config.inputType,
      });
    } catch (error) {
      logger.error('Error processing prompt node', {
        sessionId: session.id,
        nodeId: node.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Process action node
   */
  private async processActionNode(session: IVRSession, node: IVRNode): Promise<void> {
    try {
      switch (node.config.actionType) {
        case 'collect_info':
          // Information collection handled in processInput
          break;
        case 'play_message':
          await this.playMessage(session, node);
          break;
        case 'send_sms':
          await this.sendSMS(session, node);
          break;
        case 'send_email':
          await this.sendEmail(session, node);
          break;
        case 'api_call':
          await this.makeAPICall(session, node);
          break;
      }

      // Move to success node if configured
      if (node.config.successNodeId) {
        session.currentNodeId = node.config.successNodeId;
        await this.processNode(session, node.config.successNodeId);
      }
    } catch (error) {
      logger.error('Error processing action node', {
        sessionId: session.id,
        nodeId: node.id,
        actionType: node.config.actionType,
        error: error instanceof Error ? error.message : String(error),
      });

      // Move to error node if configured
      if (node.config.errorNodeId) {
        session.currentNodeId = node.config.errorNodeId;
        await this.processNode(session, node.config.errorNodeId);
      }
    }
  }

  /**
   * Process condition node
   */
  private async processConditionNode(session: IVRSession, node: IVRNode): Promise<void> {
    try {
      let nextNodeId: string | null = null;

      if (node.config.conditionRules) {
        for (const rule of node.config.conditionRules) {
          if (await this.evaluateCondition(rule, session)) {
            nextNodeId = rule.nextNodeId;
            break;
          }
        }
      }

      if (nextNodeId) {
        session.currentNodeId = nextNodeId;
        await this.processNode(session, nextNodeId);
      } else if (node.config.errorNodeId) {
        session.currentNodeId = node.config.errorNodeId;
        await this.processNode(session, node.config.errorNodeId);
      }
    } catch (error) {
      logger.error('Error processing condition node', {
        sessionId: session.id,
        nodeId: node.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Process transfer node
   */
  private async processTransferNode(session: IVRSession, node: IVRNode): Promise<void> {
    try {
      switch (node.config.transferType) {
        case 'agent':
          await this.transferToAgent(session, node);
          break;
        case 'queue':
          await this.transferToQueue(session, node);
          break;
        case 'external':
          await this.transferToExternal(session, node);
          break;
        case 'voicemail':
          await this.transferToVoicemail(session, node);
          break;
      }

      // End IVR session after transfer
      await this.endSession(session.id);
    } catch (error) {
      logger.error('Error processing transfer node', {
        sessionId: session.id,
        nodeId: node.id,
        transferType: node.config.transferType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Process hangup node
   */
  private async processHangupNode(session: IVRSession, node: IVRNode): Promise<void> {
    try {
      // Play goodbye message if configured
      if (node.config.promptText) {
        const audioResult = await textToSpeechService.synthesizeSpeech({
          text: node.config.promptText,
          languageCode: session.language,
          metadata: { sessionId: session.id, nodeId: node.id },
        });

        // TODO: Play audio via Twilio before hanging up
      }

      // End session
      await this.endSession(session.id);
    } catch (error) {
      logger.error('Error processing hangup node', {
        sessionId: session.id,
        nodeId: node.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Validate user input
   */
  private async validateInput(
    node: IVRNode,
    input: string,
    inputType: 'dtmf' | 'speech'
  ): Promise<{ valid: boolean; errorMessage?: string }> {
    try {
      const validation = node.config.inputValidation;
      if (!validation) {
        return { valid: true };
      }

      // Check pattern
      if (validation.pattern && !new RegExp(validation.pattern).test(input)) {
        return { valid: false, errorMessage: 'Invalid input format' };
      }

      // Check length
      if (validation.minLength && input.length < validation.minLength) {
        return { valid: false, errorMessage: 'Input too short' };
      }

      if (validation.maxLength && input.length > validation.maxLength) {
        return { valid: false, errorMessage: 'Input too long' };
      }

      // Check allowed values
      if (validation.allowedValues && !validation.allowedValues.includes(input)) {
        return { valid: false, errorMessage: 'Invalid selection' };
      }

      return { valid: true };
    } catch (error) {
      logger.error('Error validating input', {
        nodeId: node.id,
        input,
        inputType,
        error: error instanceof Error ? error.message : String(error),
      });
      return { valid: false, errorMessage: 'Validation error' };
    }
  }

  /**
   * Determine next node based on input
   */
  private async determineNextNode(
    node: IVRNode,
    input: string,
    session: IVRSession
  ): Promise<string | null> {
    try {
      if (node.type === 'menu' && node.config.menuOptions) {
        // Find matching menu option
        for (const option of node.config.menuOptions) {
          if (option.key === input) {
            return option.nextNodeId;
          }
          
          // Check speech keywords
          if (option.speechKeywords) {
            for (const keyword of option.speechKeywords) {
              if (input.toLowerCase().includes(keyword.toLowerCase())) {
                return option.nextNodeId;
              }
            }
          }
        }
      }

      // Default to success node
      return node.config.successNodeId || null;
    } catch (error) {
      logger.error('Error determining next node', {
        nodeId: node.id,
        input,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Handle max retries reached
   */
  private async handleMaxRetries(
    session: IVRSession,
    flow: IVRFlow
  ): Promise<{ success: boolean; nextAction?: string; message?: string }> {
    try {
      if (flow.settings.fallbackToAgent) {
        // Transfer to agent
        await this.transferToAgent(session, {
          id: 'fallback',
          type: 'transfer',
          name: 'Fallback Transfer',
          config: { transferType: 'agent' },
          position: { x: 0, y: 0 },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        
        return {
          success: true,
          nextAction: 'transfer_to_agent',
          message: 'Transferring you to an agent',
        };
      } else {
        // End call
        await this.endSession(session.id);
        
        return {
          success: false,
          nextAction: 'hangup',
          message: 'Thank you for calling. Goodbye.',
        };
      }
    } catch (error) {
      logger.error('Error handling max retries', {
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        success: false,
        message: 'An error occurred',
      };
    }
  }

  /**
   * End IVR session
   */
  public async endSession(sessionId: string): Promise<void> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        return;
      }

      session.isActive = false;
      
      // Store session data for analytics
      await this.storeSessionData(session);
      
      // Remove from active sessions
      this.activeSessions.delete(sessionId);

      logger.info('IVR session ended', {
        sessionId,
        duration: Date.now() - session.startTime.getTime(),
        nodesVisited: session.callHistory.length,
      });
    } catch (error) {
      logger.error('Error ending IVR session', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Helper methods for node processing
   */
  private async playMessage(session: IVRSession, node: IVRNode): Promise<void> {
    // TODO: Implement message playback
  }

  private async sendSMS(session: IVRSession, node: IVRNode): Promise<void> {
    // TODO: Implement SMS sending
  }

  private async sendEmail(session: IVRSession, node: IVRNode): Promise<void> {
    // TODO: Implement email sending
  }

  private async makeAPICall(session: IVRSession, node: IVRNode): Promise<void> {
    // TODO: Implement API call
  }

  private async evaluateCondition(rule: any, session: IVRSession): Promise<boolean> {
    // TODO: Implement condition evaluation
    return false;
  }

  private async transferToAgent(session: IVRSession, node: IVRNode): Promise<void> {
    // TODO: Implement agent transfer
  }

  private async transferToQueue(session: IVRSession, node: IVRNode): Promise<void> {
    // TODO: Implement queue transfer
  }

  private async transferToExternal(session: IVRSession, node: IVRNode): Promise<void> {
    // TODO: Implement external transfer
  }

  private async transferToVoicemail(session: IVRSession, node: IVRNode): Promise<void> {
    // TODO: Implement voicemail transfer
  }

  /**
   * Utility methods
   */
  private async findDefaultFlow(organizationId: string): Promise<IVRFlow | null> {
    // Find default IVR flow for organization
    for (const flow of this.ivrFlows.values()) {
      if (flow.organizationId === organizationId && flow.isActive) {
        return flow;
      }
    }
    return null;
  }

  private async loadIVRFlows(): Promise<void> {
    // TODO: Load IVR flows from database
    logger.debug('IVR flows loaded');
  }

  private async storeSessionData(session: IVRSession): Promise<void> {
    try {
      await redis.set(`ivr_session:${session.id}`, session, { ttl: 7 * 24 * 60 * 60 }); // 7 days
    } catch (error) {
      logger.error('Error storing session data', {
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private startSessionCleanup(): void {
    setInterval(() => {
      const now = new Date();
      const timeoutMs = 30 * 60 * 1000; // 30 minutes

      for (const [sessionId, session] of this.activeSessions.entries()) {
        if (now.getTime() - session.lastActivity.getTime() > timeoutMs) {
          this.endSession(sessionId);
        }
      }
    }, 5 * 60 * 1000); // Check every 5 minutes
  }

  private generateSessionId(): string {
    return `ivr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get IVR analytics
   */
  public async getIVRAnalytics(
    organizationId: string,
    flowId?: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<IVRAnalytics | null> {
    try {
      // TODO: Implement analytics aggregation
      return null;
    } catch (error) {
      logger.error('Error getting IVR analytics', {
        organizationId,
        flowId,
        timeRange,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Process IVR interaction from webhook
   */
  public async processInteraction(interactionData: {
    callSid: string;
    from: string;
    to: string;
    input: string;
    inputType: 'dtmf' | 'speech';
    confidence?: number;
  }): Promise<string> {
    try {
      // Find active session by call SID
      let session = this.findSessionByCallSid(interactionData.callSid);

      if (!session) {
        // Create new session if none exists
        const organizationId = await this.findOrganizationByPhoneNumber(interactionData.to);
        session = await this.startIVRSession(
          interactionData.callSid,
          organizationId
        );
      }

      // Update session with interaction
      session.callHistory.push({
        nodeId: session.currentNodeId,
        input: interactionData.input,
        inputType: interactionData.inputType,
        confidence: interactionData.confidence,
        timestamp: new Date(),
      });

      session.lastActivity = new Date();

      // Get current node
      const flow = this.ivrFlows.get(session.flowId);
      if (!flow) {
        throw new Error('IVR flow not found');
      }

      const currentNode = flow.nodes.find(node => node.id === session.currentNodeId);
      if (!currentNode) {
        throw new Error('Current IVR node not found');
      }

      // Process the interaction based on node type
      let nextNodeId: string | null = null;
      let responseText = '';

      if (currentNode.type === 'menu') {
        // Handle menu selection
        const selectedOption = currentNode.config.menuOptions?.find(
          option => option.key === interactionData.input
        );

        if (selectedOption) {
          nextNodeId = selectedOption.nextNodeId;
          responseText = selectedOption.responseText || '';
        } else {
          // Invalid selection
          session.retryCount++;
          if (session.retryCount >= 3) {
            nextNodeId = currentNode.config.fallbackNodeId || null;
            responseText = 'Too many invalid attempts. Transferring you to an agent.';
          } else {
            responseText = 'Invalid selection. Please try again.';
          }
        }
      } else if (currentNode.type === 'input') {
        // Handle input collection
        session.sessionData[currentNode.config.variableName || 'input'] = interactionData.input;
        nextNodeId = currentNode.config.nextNodeId;
        responseText = currentNode.config.confirmationText || 'Thank you for your input.';
      } else if (currentNode.type === 'condition') {
        // Handle conditional logic
        const condition = this.evaluateCondition(currentNode.config.condition, session.sessionData);
        nextNodeId = condition ? currentNode.config.trueNodeId : currentNode.config.falseNodeId;
      }

      // Update session with next node
      if (nextNodeId) {
        session.currentNodeId = nextNodeId;
        session.retryCount = 0;
      }

      // Generate TwiML response
      const twiml = await this.generateTwiMLResponse(session, responseText);

      return twiml;
    } catch (error) {
      logger.error('Error processing IVR interaction', {
        callSid: interactionData.callSid,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return fallback TwiML
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>I'm sorry, there was an error processing your request. Please hold while we connect you to an agent.</Say>
  <Dial>
    <Queue>support</Queue>
  </Dial>
</Response>`;
    }
  }

  /**
   * Find session by call SID
   */
  private findSessionByCallSid(callSid: string): IVRSession | undefined {
    for (const session of this.activeSessions.values()) {
      if (session.callId === callSid) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Find organization by phone number
   */
  private async findOrganizationByPhoneNumber(phoneNumber: string): Promise<string> {
    // This would typically query the database
    return 'default-org';
  }

  /**
   * Evaluate condition
   */
  private evaluateCondition(condition: any, sessionData: Record<string, any>): boolean {
    try {
      // Simple condition evaluation - in production, use a proper expression evaluator
      if (condition.type === 'equals') {
        return sessionData[condition.variable] === condition.value;
      } else if (condition.type === 'contains') {
        return sessionData[condition.variable]?.includes(condition.value);
      } else if (condition.type === 'greater_than') {
        return parseFloat(sessionData[condition.variable]) > parseFloat(condition.value);
      }
      return false;
    } catch (error) {
      logger.error('Error evaluating condition', { condition, sessionData, error });
      return false;
    }
  }

  /**
   * Generate TwiML response
   */
  private async generateTwiMLResponse(session: IVRSession, responseText: string): Promise<string> {
    try {
      const flow = this.ivrFlows.get(session.flowId);
      if (!flow) {
        throw new Error('IVR flow not found');
      }

      const currentNode = flow.nodes.find(node => node.id === session.currentNodeId);
      if (!currentNode) {
        throw new Error('Current IVR node not found');
      }

      let twiml = '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n';

      // Add response text if provided
      if (responseText) {
        twiml += `  <Say>${responseText}</Say>\n`;
      }

      // Add node-specific TwiML
      if (currentNode.type === 'message') {
        twiml += `  <Say>${currentNode.config.message}</Say>\n`;
        if (currentNode.config.nextNodeId) {
          twiml += `  <Redirect>${config.twilio.webhookUrl}/voice/ivr/${session.callId}</Redirect>\n`;
        } else {
          twiml += '  <Hangup/>\n';
        }
      } else if (currentNode.type === 'menu') {
        let menuText = currentNode.config.promptText || 'Please select from the following options: ';

        if (currentNode.config.menuOptions) {
          for (const option of currentNode.config.menuOptions) {
            menuText += `Press ${option.key} for ${option.label}. `;
          }
        }

        twiml += `  <Gather input="dtmf" timeout="10" numDigits="1" action="${config.twilio.webhookUrl}/voice/ivr/${session.callId}">\n`;
        twiml += `    <Say>${menuText}</Say>\n`;
        twiml += '  </Gather>\n';
        twiml += '  <Say>I didn\'t receive your selection. Please try again.</Say>\n';
        twiml += `  <Redirect>${config.twilio.webhookUrl}/voice/ivr/${session.callId}</Redirect>\n`;
      } else if (currentNode.type === 'input') {
        twiml += `  <Gather input="dtmf speech" timeout="10" action="${config.twilio.webhookUrl}/voice/ivr/${session.callId}">\n`;
        twiml += `    <Say>${currentNode.config.promptText}</Say>\n`;
        twiml += '  </Gather>\n';
      } else if (currentNode.type === 'transfer') {
        twiml += `  <Say>Transferring your call now.</Say>\n`;
        if (currentNode.config.transferType === 'agent') {
          twiml += '  <Dial>\n';
          twiml += '    <Queue>support</Queue>\n';
          twiml += '  </Dial>\n';
        } else if (currentNode.config.transferType === 'phone') {
          twiml += `  <Dial>${currentNode.config.phoneNumber}</Dial>\n`;
        }
      }

      twiml += '</Response>';

      return twiml;
    } catch (error) {
      logger.error('Error generating TwiML response', {
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>I'm sorry, there was an error. Please hold while we connect you to an agent.</Say>
  <Dial>
    <Queue>support</Queue>
  </Dial>
</Response>`;
    }
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{
    activeFlows: number;
    activeSessions: number;
    ttsHealth: boolean;
    sttHealth: boolean;
  }> {
    try {
      const ttsHealth = await textToSpeechService.healthCheck();
      const sttHealth = await speechToTextService.healthCheck();

      return {
        activeFlows: this.ivrFlows.size,
        activeSessions: this.activeSessions.size,
        ttsHealth: ttsHealth.google || ttsHealth.aws,
        sttHealth: sttHealth.google || sttHealth.aws,
      };
    } catch (error) {
      logger.error('IVR health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        activeFlows: 0,
        activeSessions: 0,
        ttsHealth: false,
        sttHealth: false,
      };
    }
  }
}

// Export singleton instance
export const ivrService = IVRService.getInstance();
