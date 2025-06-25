/**
 * Voice Analytics Service
 * Provides sentiment analysis, call quality monitoring, and voice biometrics
 */

import { config } from '@/config';
import { logger } from '@/utils/logger';
import { redis } from '@/services/redis';
import axios from 'axios';

export interface VoiceAnalysis {
  callId: string;
  organizationId: string;
  analysisType: 'sentiment' | 'emotion' | 'quality' | 'biometric' | 'keyword';
  timestamp: Date;
  results: {
    sentiment?: SentimentAnalysis;
    emotion?: EmotionAnalysis;
    quality?: CallQualityAnalysis;
    biometric?: BiometricAnalysis;
    keywords?: KeywordAnalysis;
  };
  confidence: number;
  processingTime: number;
  metadata: Record<string, any>;
}

export interface SentimentAnalysis {
  overall: 'positive' | 'neutral' | 'negative';
  score: number; // -1 to 1
  confidence: number;
  segments: Array<{
    startTime: number;
    endTime: number;
    sentiment: 'positive' | 'neutral' | 'negative';
    score: number;
    text: string;
  }>;
  trends: Array<{
    timestamp: number;
    score: number;
  }>;
  escalationRisk: number; // 0 to 1
  satisfactionPrediction: number; // 0 to 1
}

export interface EmotionAnalysis {
  primaryEmotion: string;
  emotions: Array<{
    emotion: 'joy' | 'sadness' | 'anger' | 'fear' | 'surprise' | 'disgust' | 'neutral';
    intensity: number; // 0 to 1
    confidence: number;
  }>;
  emotionalJourney: Array<{
    timestamp: number;
    emotion: string;
    intensity: number;
  }>;
  stressLevel: number; // 0 to 1
  agitation: number; // 0 to 1
}

export interface CallQualityAnalysis {
  overallScore: number; // 0 to 100
  audioQuality: {
    clarity: number;
    volume: number;
    backgroundNoise: number;
    distortion: number;
    dropouts: number;
  };
  speechMetrics: {
    speakingRate: number; // words per minute
    pauseFrequency: number;
    interruptionCount: number;
    talkTimeRatio: number; // agent vs customer
    silencePercentage: number;
  };
  conversationFlow: {
    turnTaking: number;
    overlap: number;
    responseTime: number;
    engagement: number;
  };
  technicalIssues: Array<{
    type: 'echo' | 'latency' | 'jitter' | 'packet_loss' | 'codec_issues';
    severity: 'low' | 'medium' | 'high';
    timestamp: number;
    duration: number;
  }>;
}

export interface BiometricAnalysis {
  voiceprintId: string;
  matchConfidence: number; // 0 to 1
  isAuthenticated: boolean;
  voiceCharacteristics: {
    pitch: number;
    tone: number;
    rhythm: number;
    accent: string;
    gender: 'male' | 'female' | 'unknown';
    ageEstimate: number;
  };
  anomalies: Array<{
    type: 'stress' | 'illness' | 'fatigue' | 'deception' | 'intoxication';
    confidence: number;
    indicators: string[];
  }>;
  riskFactors: Array<{
    factor: string;
    severity: number;
    description: string;
  }>;
}

export interface KeywordAnalysis {
  keywords: Array<{
    word: string;
    frequency: number;
    sentiment: number;
    importance: number;
    category: string;
  }>;
  phrases: Array<{
    phrase: string;
    frequency: number;
    sentiment: number;
    context: string;
  }>;
  topics: Array<{
    topic: string;
    relevance: number;
    sentiment: number;
    keywords: string[];
  }>;
  complianceFlags: Array<{
    type: 'profanity' | 'threat' | 'discrimination' | 'privacy_violation';
    severity: 'low' | 'medium' | 'high' | 'critical';
    text: string;
    timestamp: number;
  }>;
}

export interface VoiceMetrics {
  organizationId: string;
  timeRange: { start: Date; end: Date };
  callVolume: {
    total: number;
    inbound: number;
    outbound: number;
    byHour: Array<{ hour: number; count: number }>;
  };
  sentimentMetrics: {
    averageSentiment: number;
    positivePercentage: number;
    negativePercentage: number;
    escalationRate: number;
    satisfactionScore: number;
  };
  qualityMetrics: {
    averageQualityScore: number;
    audioQualityIssues: number;
    technicalIssuesRate: number;
    callDropRate: number;
  };
  performanceMetrics: {
    averageCallDuration: number;
    agentTalkTime: number;
    customerTalkTime: number;
    silenceTime: number;
    interruptionRate: number;
  };
  complianceMetrics: {
    flaggedCalls: number;
    complianceViolations: number;
    riskyCalls: number;
  };
}

export class VoiceAnalyticsService {
  private static instance: VoiceAnalyticsService;
  private analysisQueue: Array<{ callId: string; audioData: Buffer; metadata: any }> = [];
  private processingInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.startAnalysisProcessing();
  }

  public static getInstance(): VoiceAnalyticsService {
    if (!VoiceAnalyticsService.instance) {
      VoiceAnalyticsService.instance = new VoiceAnalyticsService();
    }
    return VoiceAnalyticsService.instance;
  }

  /**
   * Analyze call audio for sentiment, emotion, and quality
   */
  public async analyzeCall(
    callId: string,
    organizationId: string,
    audioData: Buffer,
    transcription: string,
    metadata: Record<string, any> = {}
  ): Promise<VoiceAnalysis> {
    try {
      const startTime = Date.now();
      
      const analysis: VoiceAnalysis = {
        callId,
        organizationId,
        analysisType: 'sentiment',
        timestamp: new Date(),
        results: {},
        confidence: 0,
        processingTime: 0,
        metadata,
      };

      // Perform different types of analysis
      const [sentiment, emotion, quality, keywords] = await Promise.all([
        this.analyzeSentiment(transcription, audioData),
        this.analyzeEmotion(transcription, audioData),
        this.analyzeCallQuality(audioData, metadata),
        this.analyzeKeywords(transcription),
      ]);

      analysis.results = {
        sentiment,
        emotion,
        quality,
        keywords,
      };

      // Perform biometric analysis if enabled
      if (config.features.voiceBiometrics) {
        analysis.results.biometric = await this.analyzeBiometrics(audioData, metadata);
      }

      // Calculate overall confidence
      analysis.confidence = this.calculateOverallConfidence(analysis.results);
      analysis.processingTime = Date.now() - startTime;

      // Store analysis results
      await this.storeAnalysis(analysis);

      // Check for alerts
      await this.checkAnalysisAlerts(analysis);

      logger.info('Voice analysis completed', {
        callId,
        organizationId,
        processingTime: analysis.processingTime,
        confidence: analysis.confidence,
      });

      return analysis;
    } catch (error) {
      logger.error('Error analyzing call', {
        callId,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Analyze sentiment from transcription and audio
   */
  private async analyzeSentiment(transcription: string, audioData: Buffer): Promise<SentimentAnalysis> {
    try {
      // Use AI service for sentiment analysis
      const response = await axios.post(`${config.services.ai.url}/api/v1/sentiment`, {
        text: transcription,
        includeSegments: true,
        includeTrends: true,
      }, {
        headers: {
          'Authorization': `Bearer ${config.services.ai.apiKey}`,
        },
        timeout: 30000,
      });

      const sentimentData = response.data.data;

      // Enhance with audio-based sentiment analysis
      const audioSentiment = await this.analyzeAudioSentiment(audioData);

      return {
        overall: sentimentData.overall || 'neutral',
        score: sentimentData.score || 0,
        confidence: sentimentData.confidence || 0,
        segments: sentimentData.segments || [],
        trends: sentimentData.trends || [],
        escalationRisk: this.calculateEscalationRisk(sentimentData, audioSentiment),
        satisfactionPrediction: this.predictSatisfaction(sentimentData, audioSentiment),
      };
    } catch (error) {
      logger.error('Error analyzing sentiment', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Return default sentiment analysis
      return {
        overall: 'neutral',
        score: 0,
        confidence: 0,
        segments: [],
        trends: [],
        escalationRisk: 0,
        satisfactionPrediction: 0.5,
      };
    }
  }

  /**
   * Analyze emotions from transcription and audio
   */
  private async analyzeEmotion(transcription: string, audioData: Buffer): Promise<EmotionAnalysis> {
    try {
      // Use AI service for emotion analysis
      const response = await axios.post(`${config.services.ai.url}/api/v1/emotion`, {
        text: transcription,
        includeJourney: true,
      }, {
        headers: {
          'Authorization': `Bearer ${config.services.ai.apiKey}`,
        },
        timeout: 30000,
      });

      const emotionData = response.data.data;

      // Enhance with audio-based emotion analysis
      const audioEmotion = await this.analyzeAudioEmotion(audioData);

      return {
        primaryEmotion: emotionData.primaryEmotion || 'neutral',
        emotions: emotionData.emotions || [],
        emotionalJourney: emotionData.journey || [],
        stressLevel: audioEmotion.stressLevel || 0,
        agitation: audioEmotion.agitation || 0,
      };
    } catch (error) {
      logger.error('Error analyzing emotion', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        primaryEmotion: 'neutral',
        emotions: [],
        emotionalJourney: [],
        stressLevel: 0,
        agitation: 0,
      };
    }
  }

  /**
   * Analyze call quality from audio
   */
  private async analyzeCallQuality(audioData: Buffer, metadata: Record<string, any>): Promise<CallQualityAnalysis> {
    try {
      // Analyze audio quality metrics
      const audioMetrics = await this.analyzeAudioQuality(audioData);
      const speechMetrics = await this.analyzeSpeechMetrics(audioData, metadata);
      const conversationMetrics = await this.analyzeConversationFlow(metadata);

      const overallScore = this.calculateQualityScore(audioMetrics, speechMetrics, conversationMetrics);

      return {
        overallScore,
        audioQuality: audioMetrics,
        speechMetrics,
        conversationFlow: conversationMetrics,
        technicalIssues: await this.detectTechnicalIssues(audioData),
      };
    } catch (error) {
      logger.error('Error analyzing call quality', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        overallScore: 50,
        audioQuality: {
          clarity: 50,
          volume: 50,
          backgroundNoise: 50,
          distortion: 0,
          dropouts: 0,
        },
        speechMetrics: {
          speakingRate: 150,
          pauseFrequency: 0,
          interruptionCount: 0,
          talkTimeRatio: 0.5,
          silencePercentage: 0,
        },
        conversationFlow: {
          turnTaking: 50,
          overlap: 0,
          responseTime: 1000,
          engagement: 50,
        },
        technicalIssues: [],
      };
    }
  }

  /**
   * Analyze keywords and topics
   */
  private async analyzeKeywords(transcription: string): Promise<KeywordAnalysis> {
    try {
      // Use AI service for keyword analysis
      const response = await axios.post(`${config.services.ai.url}/api/v1/keywords`, {
        text: transcription,
        includeTopics: true,
        includeCompliance: true,
      }, {
        headers: {
          'Authorization': `Bearer ${config.services.ai.apiKey}`,
        },
        timeout: 30000,
      });

      return response.data.data;
    } catch (error) {
      logger.error('Error analyzing keywords', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        keywords: [],
        phrases: [],
        topics: [],
        complianceFlags: [],
      };
    }
  }

  /**
   * Analyze voice biometrics
   */
  private async analyzeBiometrics(audioData: Buffer, metadata: Record<string, any>): Promise<BiometricAnalysis> {
    try {
      // TODO: Implement voice biometric analysis
      // This would typically use specialized voice biometric services
      
      return {
        voiceprintId: 'unknown',
        matchConfidence: 0,
        isAuthenticated: false,
        voiceCharacteristics: {
          pitch: 0,
          tone: 0,
          rhythm: 0,
          accent: 'unknown',
          gender: 'unknown',
          ageEstimate: 0,
        },
        anomalies: [],
        riskFactors: [],
      };
    } catch (error) {
      logger.error('Error analyzing biometrics', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get voice metrics for organization
   */
  public async getVoiceMetrics(
    organizationId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<VoiceMetrics> {
    try {
      // TODO: Aggregate metrics from stored analyses
      
      return {
        organizationId,
        timeRange,
        callVolume: {
          total: 0,
          inbound: 0,
          outbound: 0,
          byHour: [],
        },
        sentimentMetrics: {
          averageSentiment: 0,
          positivePercentage: 0,
          negativePercentage: 0,
          escalationRate: 0,
          satisfactionScore: 0,
        },
        qualityMetrics: {
          averageQualityScore: 0,
          audioQualityIssues: 0,
          technicalIssuesRate: 0,
          callDropRate: 0,
        },
        performanceMetrics: {
          averageCallDuration: 0,
          agentTalkTime: 0,
          customerTalkTime: 0,
          silenceTime: 0,
          interruptionRate: 0,
        },
        complianceMetrics: {
          flaggedCalls: 0,
          complianceViolations: 0,
          riskyCalls: 0,
        },
      };
    } catch (error) {
      logger.error('Error getting voice metrics', {
        organizationId,
        timeRange,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Helper methods for audio analysis
   */
  private async analyzeAudioSentiment(audioData: Buffer): Promise<any> {
    // TODO: Implement audio-based sentiment analysis
    return { stressLevel: 0, agitation: 0 };
  }

  private async analyzeAudioEmotion(audioData: Buffer): Promise<any> {
    // TODO: Implement audio-based emotion analysis
    return { stressLevel: 0, agitation: 0 };
  }

  private async analyzeAudioQuality(audioData: Buffer): Promise<any> {
    // TODO: Implement audio quality analysis
    return {
      clarity: 80,
      volume: 75,
      backgroundNoise: 10,
      distortion: 5,
      dropouts: 0,
    };
  }

  private async analyzeSpeechMetrics(audioData: Buffer, metadata: Record<string, any>): Promise<any> {
    // TODO: Implement speech metrics analysis
    return {
      speakingRate: 150,
      pauseFrequency: 5,
      interruptionCount: 2,
      talkTimeRatio: 0.6,
      silencePercentage: 15,
    };
  }

  private async analyzeConversationFlow(metadata: Record<string, any>): Promise<any> {
    // TODO: Implement conversation flow analysis
    return {
      turnTaking: 80,
      overlap: 5,
      responseTime: 1200,
      engagement: 75,
    };
  }

  private async detectTechnicalIssues(audioData: Buffer): Promise<any[]> {
    // TODO: Implement technical issue detection
    return [];
  }

  private calculateEscalationRisk(sentimentData: any, audioSentiment: any): number {
    // TODO: Implement escalation risk calculation
    return 0.2;
  }

  private predictSatisfaction(sentimentData: any, audioSentiment: any): number {
    // TODO: Implement satisfaction prediction
    return 0.7;
  }

  private calculateOverallConfidence(results: any): number {
    // Calculate weighted average of all analysis confidences
    let totalConfidence = 0;
    let count = 0;

    if (results.sentiment?.confidence) {
      totalConfidence += results.sentiment.confidence;
      count++;
    }

    if (results.emotion?.emotions?.length) {
      const avgEmotionConfidence = results.emotion.emotions.reduce((sum: number, e: any) => sum + e.confidence, 0) / results.emotion.emotions.length;
      totalConfidence += avgEmotionConfidence;
      count++;
    }

    return count > 0 ? totalConfidence / count : 0;
  }

  private calculateQualityScore(audioMetrics: any, speechMetrics: any, conversationMetrics: any): number {
    // Calculate weighted quality score
    const audioScore = (audioMetrics.clarity + audioMetrics.volume - audioMetrics.backgroundNoise) / 3;
    const speechScore = Math.min(speechMetrics.speakingRate / 150 * 100, 100);
    const conversationScore = (conversationMetrics.turnTaking + conversationMetrics.engagement) / 2;

    return (audioScore * 0.4 + speechScore * 0.3 + conversationScore * 0.3);
  }

  private async storeAnalysis(analysis: VoiceAnalysis): Promise<void> {
    try {
      // Store in Redis for quick access
      await redis.set(`voice_analysis:${analysis.callId}`, analysis, { ttl: 30 * 24 * 60 * 60 }); // 30 days
      
      // TODO: Store in database for long-term analytics
    } catch (error) {
      logger.error('Error storing analysis', {
        callId: analysis.callId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async checkAnalysisAlerts(analysis: VoiceAnalysis): Promise<void> {
    try {
      const alerts = [];

      // Check for high escalation risk
      if (analysis.results.sentiment?.escalationRisk && analysis.results.sentiment.escalationRisk > 0.8) {
        alerts.push({
          type: 'escalation_risk',
          severity: 'high',
          message: 'High escalation risk detected',
        });
      }

      // Check for compliance violations
      if (analysis.results.keywords?.complianceFlags?.length) {
        const criticalFlags = analysis.results.keywords.complianceFlags.filter((flag: any) => flag.severity === 'critical');
        if (criticalFlags.length > 0) {
          alerts.push({
            type: 'compliance_violation',
            severity: 'critical',
            message: 'Critical compliance violation detected',
          });
        }
      }

      // Check for poor call quality
      if (analysis.results.quality?.overallScore && analysis.results.quality.overallScore < 30) {
        alerts.push({
          type: 'poor_quality',
          severity: 'medium',
          message: 'Poor call quality detected',
        });
      }

      // Send alerts if any
      if (alerts.length > 0) {
        await this.sendAnalysisAlerts(analysis.callId, analysis.organizationId, alerts);
      }
    } catch (error) {
      logger.error('Error checking analysis alerts', {
        callId: analysis.callId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async sendAnalysisAlerts(callId: string, organizationId: string, alerts: any[]): Promise<void> {
    try {
      // Send alerts via notification service
      await axios.post(`${config.services.notification.url}/api/v1/notifications`, {
        organizationId,
        type: 'voice_analysis_alert',
        channels: ['email', 'in_app'],
        data: {
          callId,
          alerts,
        },
      }, {
        headers: {
          'Authorization': `Bearer ${config.services.notification.apiKey}`,
        },
      });
    } catch (error) {
      logger.error('Error sending analysis alerts', {
        callId,
        organizationId,
        alerts,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private startAnalysisProcessing(): void {
    this.processingInterval = setInterval(async () => {
      if (this.analysisQueue.length > 0) {
        const batch = this.analysisQueue.splice(0, config.analytics.batchSize);
        await this.processBatch(batch);
      }
    }, config.analytics.flushInterval);
  }

  private async processBatch(batch: any[]): Promise<void> {
    try {
      for (const item of batch) {
        // Process analysis in background
        this.analyzeCall(item.callId, item.metadata.organizationId, item.audioData, item.metadata.transcription, item.metadata)
          .catch(error => {
            logger.error('Error processing analysis batch item', {
              callId: item.callId,
              error: error instanceof Error ? error.message : String(error),
            });
          });
      }
    } catch (error) {
      logger.error('Error processing analysis batch', {
        batchSize: batch.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Queue call for analysis
   */
  public queueAnalysis(callId: string, audioData: Buffer, metadata: any): void {
    this.analysisQueue.push({ callId, audioData, metadata });
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{
    queueSize: number;
    aiServiceHealth: boolean;
    processingEnabled: boolean;
  }> {
    try {
      // Check AI service connectivity
      const aiHealth = await axios.get(`${config.services.ai.url}/health`, {
        timeout: 5000,
      });

      return {
        queueSize: this.analysisQueue.length,
        aiServiceHealth: aiHealth.status === 200,
        processingEnabled: !!this.processingInterval,
      };
    } catch (error) {
      return {
        queueSize: this.analysisQueue.length,
        aiServiceHealth: false,
        processingEnabled: !!this.processingInterval,
      };
    }
  }
}

// Export singleton instance
export const voiceAnalyticsService = VoiceAnalyticsService.getInstance();
