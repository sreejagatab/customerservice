/**
 * Voice Integration Service
 * Handles voice call processing, transcription, IVR flows, and voice analytics
 */

import { Logger } from '../utils/logger';
import { DatabaseService } from './database';
import { EventEmitter } from 'events';

export interface VoiceCall {
  id: string;
  organizationId: string;
  conversationId?: string;
  callSid: string;
  phoneNumberFrom: string;
  phoneNumberTo: string;
  callDirection: 'inbound' | 'outbound';
  callStatus: 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'failed' | 'no-answer';
  callDuration: number;
  recordingUrl?: string;
  recordingDuration: number;
  transcriptionText?: string;
  transcriptionConfidence?: number;
  transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  speakerSegments: any[];
  callQualityScore?: number;
  callMetadata: any;
  ivrPath: any[];
  agentId?: string;
  queueTime: number;
  talkTime: number;
  holdTime: number;
  transferCount: number;
  cost: number;
  provider: string;
  providerData: any;
  startedAt?: Date;
  answeredAt?: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PhoneNumber {
  id: string;
  organizationId: string;
  phoneNumber: string;
  phoneNumberSid?: string;
  friendlyName?: string;
  countryCode: string;
  numberType: 'local' | 'toll_free' | 'mobile';
  capabilities: any;
  isPrimary: boolean;
  isActive: boolean;
  routingConfig: any;
  businessHours: any;
  afterHoursConfig: any;
  provider: string;
  providerData: any;
  monthlyCost: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IVRFlow {
  id: string;
  organizationId: string;
  phoneNumberId?: string;
  name: string;
  description?: string;
  flowConfig: any;
  welcomeMessage?: string;
  language: string;
  voiceSettings: any;
  businessHoursFlow: any;
  afterHoursFlow: any;
  fallbackAction: 'voicemail' | 'transfer' | 'hangup';
  maxRetries: number;
  timeoutSeconds: number;
  isActive: boolean;
  version: number;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VoiceCallAnalytics {
  id: string;
  voiceCallId: string;
  organizationId: string;
  sentimentAnalysis: any;
  emotionAnalysis: any;
  keywordsExtracted: string[];
  topicsIdentified: string[];
  intentClassification?: string;
  confidenceScores: any;
  speechAnalytics: any;
  customerSatisfactionScore?: number;
  agentPerformanceScore?: number;
  complianceFlags: any[];
  coachingOpportunities: any[];
  createdAt: Date;
}

export class VoiceIntegrationService extends EventEmitter {
  private logger: Logger;
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    super();
    this.logger = new Logger('VoiceIntegrationService');
    this.db = db;
  }

  /**
   * Handle incoming voice call webhook
   */
  async handleIncomingCall(
    organizationId: string,
    callData: {
      callSid: string;
      from: string;
      to: string;
      provider: string;
      providerData?: any;
    }
  ): Promise<VoiceCall> {
    try {
      // Create voice call record
      const result = await this.db.query(`
        INSERT INTO voice_calls (
          organization_id, call_sid, phone_number_from, phone_number_to,
          call_direction, call_status, provider, provider_data, started_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING *
      `, [
        organizationId,
        callData.callSid,
        callData.from,
        callData.to,
        'inbound',
        'initiated',
        callData.provider,
        JSON.stringify(callData.providerData || {})
      ]);

      const voiceCall = this.mapVoiceCallFromDb(result.rows[0]);

      // Get IVR flow for the phone number
      const ivrFlow = await this.getIVRFlowForPhoneNumber(callData.to, organizationId);
      
      this.emit('call.incoming', { voiceCall, ivrFlow });
      this.logger.info(`Incoming call received: ${voiceCall.id}`, {
        organizationId,
        from: callData.from,
        to: callData.to
      });

      return voiceCall;
    } catch (error) {
      this.logger.error('Error handling incoming call:', error);
      throw new Error('Failed to handle incoming call');
    }
  }

  /**
   * Update call status
   */
  async updateCallStatus(
    callSid: string,
    status: string,
    metadata?: any
  ): Promise<VoiceCall> {
    try {
      const updates: any = { call_status: status };
      
      if (status === 'in-progress' && !metadata?.answeredAt) {
        updates.answered_at = 'NOW()';
      }
      
      if (status === 'completed' && metadata) {
        updates.ended_at = 'NOW()';
        if (metadata.duration) updates.call_duration = metadata.duration;
        if (metadata.recordingUrl) updates.recording_url = metadata.recordingUrl;
        if (metadata.cost) updates.cost = metadata.cost;
      }

      const setClause = Object.keys(updates).map((key, index) => 
        `${key} = $${index + 2}`
      ).join(', ');

      const result = await this.db.query(`
        UPDATE voice_calls 
        SET ${setClause}, updated_at = NOW()
        WHERE call_sid = $1
        RETURNING *
      `, [callSid, ...Object.values(updates)]);

      if (result.rows.length === 0) {
        throw new Error('Voice call not found');
      }

      const voiceCall = this.mapVoiceCallFromDb(result.rows[0]);
      
      this.emit('call.status.updated', { voiceCall, status });
      
      // Start transcription if call completed and has recording
      if (status === 'completed' && voiceCall.recordingUrl) {
        this.startTranscription(voiceCall.id).catch(error => {
          this.logger.error('Error starting transcription:', error);
        });
      }

      return voiceCall;
    } catch (error) {
      this.logger.error('Error updating call status:', error);
      throw new Error('Failed to update call status');
    }
  }

  /**
   * Start call transcription
   */
  async startTranscription(voiceCallId: string): Promise<void> {
    try {
      const voiceCall = await this.getVoiceCall(voiceCallId);
      if (!voiceCall || !voiceCall.recordingUrl) {
        throw new Error('Voice call or recording not found');
      }

      // Create transcription job
      await this.db.query(`
        INSERT INTO voice_transcription_jobs (
          voice_call_id, organization_id, audio_url, started_at
        ) VALUES ($1, $2, $3, NOW())
      `, [voiceCallId, voiceCall.organizationId, voiceCall.recordingUrl]);

      // Update call transcription status
      await this.db.query(
        'UPDATE voice_calls SET transcription_status = $1 WHERE id = $2',
        ['processing', voiceCallId]
      );

      // Process transcription asynchronously
      this.processTranscription(voiceCallId).catch(error => {
        this.logger.error('Error processing transcription:', error);
      });

      this.emit('transcription.started', { voiceCallId });
    } catch (error) {
      this.logger.error('Error starting transcription:', error);
      throw new Error('Failed to start transcription');
    }
  }

  /**
   * Create or update phone number
   */
  async setupPhoneNumber(
    organizationId: string,
    phoneNumberData: Partial<PhoneNumber>
  ): Promise<PhoneNumber> {
    try {
      const existingNumber = await this.getPhoneNumberByNumber(phoneNumberData.phoneNumber!);
      
      if (existingNumber) {
        return await this.updatePhoneNumber(existingNumber.id, phoneNumberData);
      } else {
        return await this.createPhoneNumber(organizationId, phoneNumberData);
      }
    } catch (error) {
      this.logger.error('Error setting up phone number:', error);
      throw new Error('Failed to setup phone number');
    }
  }

  /**
   * Create IVR flow
   */
  async createIVRFlow(
    organizationId: string,
    ivrData: Partial<IVRFlow>
  ): Promise<IVRFlow> {
    try {
      const result = await this.db.query(`
        INSERT INTO ivr_flows (
          organization_id, phone_number_id, name, description, flow_config,
          welcome_message, language, voice_settings, business_hours_flow,
          after_hours_flow, fallback_action, max_retries, timeout_seconds,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `, [
        organizationId,
        ivrData.phoneNumberId,
        ivrData.name,
        ivrData.description,
        JSON.stringify(ivrData.flowConfig || {}),
        ivrData.welcomeMessage,
        ivrData.language || 'en-US',
        JSON.stringify(ivrData.voiceSettings || {}),
        JSON.stringify(ivrData.businessHoursFlow || {}),
        JSON.stringify(ivrData.afterHoursFlow || {}),
        ivrData.fallbackAction || 'voicemail',
        ivrData.maxRetries || 3,
        ivrData.timeoutSeconds || 30,
        ivrData.createdBy
      ]);

      const ivrFlow = this.mapIVRFlowFromDb(result.rows[0]);
      
      this.emit('ivr.created', ivrFlow);
      this.logger.info(`IVR flow created: ${ivrFlow.id}`, {
        organizationId,
        name: ivrFlow.name
      });

      return ivrFlow;
    } catch (error) {
      this.logger.error('Error creating IVR flow:', error);
      throw new Error('Failed to create IVR flow');
    }
  }

  /**
   * Get voice analytics for organization
   */
  async getVoiceAnalytics(
    organizationId: string,
    timeframe: 'day' | 'week' | 'month' = 'week'
  ): Promise<any> {
    try {
      const days = timeframe === 'day' ? 1 : timeframe === 'week' ? 7 : 30;
      
      // Get call metrics
      const metricsResult = await this.db.query(
        'SELECT calculate_voice_call_metrics($1, NOW() - INTERVAL \'$2 days\', NOW()) as metrics',
        [organizationId, days]
      );

      // Get analytics summary
      const analyticsResult = await this.db.query(
        'SELECT get_voice_analytics_summary($1, $2) as summary',
        [organizationId, days]
      );

      // Get call volume trends
      const trendsResult = await this.db.query(`
        SELECT 
          DATE_TRUNC('day', started_at) as date,
          COUNT(*) as total_calls,
          COUNT(CASE WHEN call_status = 'completed' THEN 1 END) as completed_calls,
          AVG(call_duration) as avg_duration
        FROM voice_calls
        WHERE organization_id = $1 
          AND started_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE_TRUNC('day', started_at)
        ORDER BY date
      `, [organizationId]);

      return {
        metrics: metricsResult.rows[0]?.metrics || {},
        analytics: analyticsResult.rows[0]?.summary || {},
        trends: trendsResult.rows,
        timeframe
      };
    } catch (error) {
      this.logger.error('Error getting voice analytics:', error);
      throw new Error('Failed to get voice analytics');
    }
  }

  /**
   * Private helper methods
   */
  private async getVoiceCall(voiceCallId: string): Promise<VoiceCall | null> {
    const result = await this.db.query(
      'SELECT * FROM voice_calls WHERE id = $1',
      [voiceCallId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapVoiceCallFromDb(result.rows[0]);
  }

  private async getPhoneNumberByNumber(phoneNumber: string): Promise<PhoneNumber | null> {
    const result = await this.db.query(
      'SELECT * FROM phone_numbers WHERE phone_number = $1',
      [phoneNumber]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapPhoneNumberFromDb(result.rows[0]);
  }

  private async createPhoneNumber(
    organizationId: string,
    phoneNumberData: Partial<PhoneNumber>
  ): Promise<PhoneNumber> {
    const result = await this.db.query(`
      INSERT INTO phone_numbers (
        organization_id, phone_number, phone_number_sid, friendly_name,
        country_code, number_type, capabilities, is_primary, routing_config,
        business_hours, after_hours_config, provider, provider_data, monthly_cost
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      organizationId,
      phoneNumberData.phoneNumber,
      phoneNumberData.phoneNumberSid,
      phoneNumberData.friendlyName,
      phoneNumberData.countryCode || 'US',
      phoneNumberData.numberType || 'local',
      JSON.stringify(phoneNumberData.capabilities || {}),
      phoneNumberData.isPrimary || false,
      JSON.stringify(phoneNumberData.routingConfig || {}),
      JSON.stringify(phoneNumberData.businessHours || {}),
      JSON.stringify(phoneNumberData.afterHoursConfig || {}),
      phoneNumberData.provider || 'twilio',
      JSON.stringify(phoneNumberData.providerData || {}),
      phoneNumberData.monthlyCost || 0
    ]);

    return this.mapPhoneNumberFromDb(result.rows[0]);
  }

  private async updatePhoneNumber(
    phoneNumberId: string,
    updates: Partial<PhoneNumber>
  ): Promise<PhoneNumber> {
    const setClause = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'createdAt') continue;
      
      const dbKey = this.camelToSnake(key);
      setClause.push(`${dbKey} = $${paramIndex}`);
      
      if (typeof value === 'object' && value !== null) {
        values.push(JSON.stringify(value));
      } else {
        values.push(value);
      }
      paramIndex++;
    }

    values.push(phoneNumberId);

    const result = await this.db.query(`
      UPDATE phone_numbers 
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    return this.mapPhoneNumberFromDb(result.rows[0]);
  }

  private async getIVRFlowForPhoneNumber(
    phoneNumber: string,
    organizationId: string
  ): Promise<IVRFlow | null> {
    const result = await this.db.query(`
      SELECT ivr.* FROM ivr_flows ivr
      JOIN phone_numbers pn ON ivr.phone_number_id = pn.id
      WHERE pn.phone_number = $1 AND pn.organization_id = $2 AND ivr.is_active = true
      ORDER BY ivr.created_at DESC
      LIMIT 1
    `, [phoneNumber, organizationId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapIVRFlowFromDb(result.rows[0]);
  }

  private async processTranscription(voiceCallId: string): Promise<void> {
    try {
      // This would integrate with speech-to-text services
      // For now, simulate transcription processing
      
      await new Promise(resolve => setTimeout(resolve, 5000)); // Simulate processing time

      const mockTranscription = {
        text: "Hello, I'm calling about my recent order. I haven't received it yet and I'm wondering about the status.",
        confidence: 0.92,
        speakerSegments: [
          { speaker: 'customer', start: 0, end: 8.5, text: "Hello, I'm calling about my recent order." },
          { speaker: 'agent', start: 9.0, end: 12.0, text: "Hi! I'd be happy to help you with that." },
          { speaker: 'customer', start: 12.5, end: 18.0, text: "I haven't received it yet and I'm wondering about the status." }
        ]
      };

      // Update voice call with transcription
      await this.db.query(`
        UPDATE voice_calls 
        SET transcription_text = $1, transcription_confidence = $2, 
            speaker_segments = $3, transcription_status = $4
        WHERE id = $5
      `, [
        mockTranscription.text,
        mockTranscription.confidence,
        JSON.stringify(mockTranscription.speakerSegments),
        'completed',
        voiceCallId
      ]);

      // Start analytics processing
      this.processVoiceAnalytics(voiceCallId).catch(error => {
        this.logger.error('Error processing voice analytics:', error);
      });

      this.emit('transcription.completed', { voiceCallId, transcription: mockTranscription });
    } catch (error) {
      await this.db.query(
        'UPDATE voice_calls SET transcription_status = $1 WHERE id = $2',
        ['failed', voiceCallId]
      );
      
      this.emit('transcription.failed', { voiceCallId, error: error.message });
      throw error;
    }
  }

  private async processVoiceAnalytics(voiceCallId: string): Promise<void> {
    try {
      const voiceCall = await this.getVoiceCall(voiceCallId);
      if (!voiceCall || !voiceCall.transcriptionText) {
        return;
      }

      // Mock analytics processing
      const analytics = {
        sentimentAnalysis: { overall_score: 0.3, positive: 0.2, neutral: 0.5, negative: 0.3 },
        emotionAnalysis: { frustrated: 0.6, concerned: 0.4 },
        keywordsExtracted: ['order', 'status', 'delivery', 'help'],
        topicsIdentified: ['order_inquiry', 'delivery_status'],
        intentClassification: 'order_status_inquiry',
        confidenceScores: { intent: 0.89, sentiment: 0.76 },
        speechAnalytics: { pace: 'normal', interruptions: 1, silence_periods: 2 },
        customerSatisfactionScore: 3.2,
        agentPerformanceScore: 4.1,
        complianceFlags: [],
        coachingOpportunities: ['active_listening', 'empathy_expression']
      };

      // Store analytics
      await this.db.query(`
        INSERT INTO voice_call_analytics (
          voice_call_id, organization_id, sentiment_analysis, emotion_analysis,
          keywords_extracted, topics_identified, intent_classification,
          confidence_scores, speech_analytics, customer_satisfaction_score,
          agent_performance_score, compliance_flags, coaching_opportunities
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        voiceCallId,
        voiceCall.organizationId,
        JSON.stringify(analytics.sentimentAnalysis),
        JSON.stringify(analytics.emotionAnalysis),
        analytics.keywordsExtracted,
        analytics.topicsIdentified,
        analytics.intentClassification,
        JSON.stringify(analytics.confidenceScores),
        JSON.stringify(analytics.speechAnalytics),
        analytics.customerSatisfactionScore,
        analytics.agentPerformanceScore,
        JSON.stringify(analytics.complianceFlags),
        JSON.stringify(analytics.coachingOpportunities)
      ]);

      this.emit('analytics.completed', { voiceCallId, analytics });
    } catch (error) {
      this.logger.error('Error processing voice analytics:', error);
      throw error;
    }
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  private mapVoiceCallFromDb(row: any): VoiceCall {
    return {
      id: row.id,
      organizationId: row.organization_id,
      conversationId: row.conversation_id,
      callSid: row.call_sid,
      phoneNumberFrom: row.phone_number_from,
      phoneNumberTo: row.phone_number_to,
      callDirection: row.call_direction,
      callStatus: row.call_status,
      callDuration: row.call_duration,
      recordingUrl: row.recording_url,
      recordingDuration: row.recording_duration,
      transcriptionText: row.transcription_text,
      transcriptionConfidence: row.transcription_confidence ? parseFloat(row.transcription_confidence) : undefined,
      transcriptionStatus: row.transcription_status,
      speakerSegments: row.speaker_segments,
      callQualityScore: row.call_quality_score ? parseFloat(row.call_quality_score) : undefined,
      callMetadata: row.call_metadata,
      ivrPath: row.ivr_path,
      agentId: row.agent_id,
      queueTime: row.queue_time,
      talkTime: row.talk_time,
      holdTime: row.hold_time,
      transferCount: row.transfer_count,
      cost: parseFloat(row.cost),
      provider: row.provider,
      providerData: row.provider_data,
      startedAt: row.started_at,
      answeredAt: row.answered_at,
      endedAt: row.ended_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapPhoneNumberFromDb(row: any): PhoneNumber {
    return {
      id: row.id,
      organizationId: row.organization_id,
      phoneNumber: row.phone_number,
      phoneNumberSid: row.phone_number_sid,
      friendlyName: row.friendly_name,
      countryCode: row.country_code,
      numberType: row.number_type,
      capabilities: row.capabilities,
      isPrimary: row.is_primary,
      isActive: row.is_active,
      routingConfig: row.routing_config,
      businessHours: row.business_hours,
      afterHoursConfig: row.after_hours_config,
      provider: row.provider,
      providerData: row.provider_data,
      monthlyCost: parseFloat(row.monthly_cost),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapIVRFlowFromDb(row: any): IVRFlow {
    return {
      id: row.id,
      organizationId: row.organization_id,
      phoneNumberId: row.phone_number_id,
      name: row.name,
      description: row.description,
      flowConfig: row.flow_config,
      welcomeMessage: row.welcome_message,
      language: row.language,
      voiceSettings: row.voice_settings,
      businessHoursFlow: row.business_hours_flow,
      afterHoursFlow: row.after_hours_flow,
      fallbackAction: row.fallback_action,
      maxRetries: row.max_retries,
      timeoutSeconds: row.timeout_seconds,
      isActive: row.is_active,
      version: row.version,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export default VoiceIntegrationService;
