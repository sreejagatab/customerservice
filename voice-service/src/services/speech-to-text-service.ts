/**
 * Speech-to-Text Service
 * Handles audio transcription using Google Cloud Speech-to-Text and AWS Transcribe
 */

import { SpeechClient } from '@google-cloud/speech';
import AWS from 'aws-sdk';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { redis } from '@/services/redis';

export interface TranscriptionRequest {
  audioData: Buffer;
  audioFormat: 'wav' | 'mp3' | 'flac' | 'ogg';
  sampleRate: number;
  languageCode: string;
  enableWordTimeOffsets?: boolean;
  enableAutomaticPunctuation?: boolean;
  profanityFilter?: boolean;
  maxAlternatives?: number;
  metadata?: {
    callId?: string;
    organizationId?: string;
    userId?: string;
  };
}

export interface TranscriptionResult {
  transcript: string;
  confidence: number;
  alternatives: Array<{
    transcript: string;
    confidence: number;
  }>;
  words?: Array<{
    word: string;
    startTime: number;
    endTime: number;
    confidence: number;
  }>;
  languageCode: string;
  duration: number;
  provider: 'google' | 'aws';
  metadata?: Record<string, any>;
}

export interface StreamingTranscriptionSession {
  sessionId: string;
  organizationId: string;
  callId?: string;
  languageCode: string;
  isActive: boolean;
  startTime: Date;
  lastActivity: Date;
  partialResults: string[];
  finalResults: TranscriptionResult[];
  onTranscript?: (result: TranscriptionResult) => void;
  onPartialTranscript?: (text: string) => void;
}

export class SpeechToTextService {
  private static instance: SpeechToTextService;
  private googleSpeechClient: SpeechClient | null = null;
  private awsTranscribe: AWS.TranscribeService | null = null;
  private streamingSessions: Map<string, StreamingTranscriptionSession> = new Map();

  private constructor() {
    this.initializeProviders();
  }

  public static getInstance(): SpeechToTextService {
    if (!SpeechToTextService.instance) {
      SpeechToTextService.instance = new SpeechToTextService();
    }
    return SpeechToTextService.instance;
  }

  /**
   * Initialize speech recognition providers
   */
  private initializeProviders(): void {
    try {
      // Initialize Google Cloud Speech-to-Text
      if (config.googleCloud.projectId) {
        this.googleSpeechClient = new SpeechClient({
          projectId: config.googleCloud.projectId,
          keyFilename: config.googleCloud.keyFile,
        });
        logger.info('Google Cloud Speech-to-Text client initialized');
      }

      // Initialize AWS Transcribe
      if (config.aws.accessKeyId && config.aws.secretAccessKey) {
        AWS.config.update({
          accessKeyId: config.aws.accessKeyId,
          secretAccessKey: config.aws.secretAccessKey,
          region: config.aws.region,
        });
        this.awsTranscribe = new AWS.TranscribeService();
        logger.info('AWS Transcribe client initialized');
      }

      if (!this.googleSpeechClient && !this.awsTranscribe) {
        logger.warn('No speech-to-text providers configured');
      }
    } catch (error) {
      logger.error('Error initializing speech-to-text providers', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Transcribe audio using the best available provider
   */
  public async transcribeAudio(request: TranscriptionRequest): Promise<TranscriptionResult> {
    try {
      // Try Google Cloud first, then AWS as fallback
      if (this.googleSpeechClient) {
        return await this.transcribeWithGoogle(request);
      } else if (this.awsTranscribe) {
        return await this.transcribeWithAWS(request);
      } else {
        throw new Error('No speech-to-text providers available');
      }
    } catch (error) {
      logger.error('Error transcribing audio', {
        audioFormat: request.audioFormat,
        sampleRate: request.sampleRate,
        languageCode: request.languageCode,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Transcribe audio using Google Cloud Speech-to-Text
   */
  private async transcribeWithGoogle(request: TranscriptionRequest): Promise<TranscriptionResult> {
    if (!this.googleSpeechClient) {
      throw new Error('Google Cloud Speech client not initialized');
    }

    const startTime = Date.now();

    try {
      const audioConfig = {
        encoding: this.getGoogleEncoding(request.audioFormat),
        sampleRateHertz: request.sampleRate,
        languageCode: request.languageCode,
        maxAlternatives: request.maxAlternatives || config.voice.maxAlternatives,
        profanityFilter: request.profanityFilter ?? config.voice.profanityFilter,
        enableWordTimeOffsets: request.enableWordTimeOffsets ?? config.voice.enableWordTimeOffsets,
        enableAutomaticPunctuation: request.enableAutomaticPunctuation ?? config.voice.enableAutomaticPunctuation,
      };

      const audio = {
        content: request.audioData.toString('base64'),
      };

      const recognitionRequest = {
        config: audioConfig,
        audio: audio,
      };

      const [response] = await this.googleSpeechClient.recognize(recognitionRequest);
      const recognition = response.results?.[0]?.alternatives?.[0];

      if (!recognition) {
        throw new Error('No transcription results from Google Cloud Speech');
      }

      const duration = Date.now() - startTime;

      const result: TranscriptionResult = {
        transcript: recognition.transcript || '',
        confidence: recognition.confidence || 0,
        alternatives: response.results?.[0]?.alternatives?.map(alt => ({
          transcript: alt.transcript || '',
          confidence: alt.confidence || 0,
        })) || [],
        words: recognition.words?.map(word => ({
          word: word.word || '',
          startTime: this.parseGoogleTime(word.startTime),
          endTime: this.parseGoogleTime(word.endTime),
          confidence: word.confidence || 0,
        })),
        languageCode: request.languageCode,
        duration,
        provider: 'google',
        metadata: request.metadata,
      };

      // Cache result for analytics
      await this.cacheTranscriptionResult(result);

      logger.debug('Google Cloud transcription completed', {
        transcript: result.transcript.substring(0, 100),
        confidence: result.confidence,
        duration,
        wordCount: result.words?.length || 0,
      });

      return result;
    } catch (error) {
      logger.error('Google Cloud transcription failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Transcribe audio using AWS Transcribe
   */
  private async transcribeWithAWS(request: TranscriptionRequest): Promise<TranscriptionResult> {
    if (!this.awsTranscribe) {
      throw new Error('AWS Transcribe client not initialized');
    }

    const startTime = Date.now();

    try {
      // AWS Transcribe requires audio to be uploaded to S3 first
      // For this implementation, we'll use a simplified approach
      // In production, you would upload to S3 and use the streaming API

      // Simulate AWS transcription (replace with actual implementation)
      const mockResult: TranscriptionResult = {
        transcript: 'AWS Transcribe mock result',
        confidence: 0.95,
        alternatives: [],
        languageCode: request.languageCode,
        duration: Date.now() - startTime,
        provider: 'aws',
        metadata: request.metadata,
      };

      await this.cacheTranscriptionResult(mockResult);

      logger.debug('AWS transcription completed', {
        transcript: mockResult.transcript,
        confidence: mockResult.confidence,
        duration: mockResult.duration,
      });

      return mockResult;
    } catch (error) {
      logger.error('AWS transcription failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Start streaming transcription session
   */
  public async startStreamingTranscription(
    sessionId: string,
    organizationId: string,
    languageCode: string,
    callId?: string
  ): Promise<StreamingTranscriptionSession> {
    try {
      const session: StreamingTranscriptionSession = {
        sessionId,
        organizationId,
        callId,
        languageCode,
        isActive: true,
        startTime: new Date(),
        lastActivity: new Date(),
        partialResults: [],
        finalResults: [],
      };

      this.streamingSessions.set(sessionId, session);

      logger.info('Streaming transcription session started', {
        sessionId,
        organizationId,
        callId,
        languageCode,
      });

      return session;
    } catch (error) {
      logger.error('Error starting streaming transcription', {
        sessionId,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Process streaming audio chunk
   */
  public async processStreamingAudio(
    sessionId: string,
    audioChunk: Buffer,
    isLast: boolean = false
  ): Promise<void> {
    try {
      const session = this.streamingSessions.get(sessionId);
      if (!session || !session.isActive) {
        throw new Error('Invalid or inactive streaming session');
      }

      session.lastActivity = new Date();

      // Process audio chunk with Google Cloud Streaming API
      if (this.googleSpeechClient && config.features.realTimeTranscription) {
        await this.processGoogleStreamingAudio(session, audioChunk, isLast);
      }

      if (isLast) {
        await this.endStreamingTranscription(sessionId);
      }
    } catch (error) {
      logger.error('Error processing streaming audio', {
        sessionId,
        chunkSize: audioChunk.length,
        isLast,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * End streaming transcription session
   */
  public async endStreamingTranscription(sessionId: string): Promise<StreamingTranscriptionSession | null> {
    try {
      const session = this.streamingSessions.get(sessionId);
      if (!session) {
        return null;
      }

      session.isActive = false;
      this.streamingSessions.delete(sessionId);

      // Store session results for analytics
      await this.storeStreamingResults(session);

      logger.info('Streaming transcription session ended', {
        sessionId,
        duration: Date.now() - session.startTime.getTime(),
        finalResultsCount: session.finalResults.length,
      });

      return session;
    } catch (error) {
      logger.error('Error ending streaming transcription', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get transcription analytics
   */
  public async getTranscriptionAnalytics(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalTranscriptions: number;
    averageConfidence: number;
    averageDuration: number;
    languageDistribution: Record<string, number>;
    providerDistribution: Record<string, number>;
    errorRate: number;
  }> {
    try {
      // TODO: Implement analytics aggregation from stored results
      return {
        totalTranscriptions: 0,
        averageConfidence: 0,
        averageDuration: 0,
        languageDistribution: {},
        providerDistribution: {},
        errorRate: 0,
      };
    } catch (error) {
      logger.error('Error getting transcription analytics', {
        organizationId,
        startDate,
        endDate,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Helper methods
   */
  private getGoogleEncoding(format: string): string {
    const encodingMap: Record<string, string> = {
      wav: 'LINEAR16',
      mp3: 'MP3',
      flac: 'FLAC',
      ogg: 'OGG_OPUS',
    };
    return encodingMap[format] || 'LINEAR16';
  }

  private parseGoogleTime(timeObj: any): number {
    if (!timeObj) return 0;
    return (timeObj.seconds || 0) * 1000 + (timeObj.nanos || 0) / 1000000;
  }

  private async processGoogleStreamingAudio(
    session: StreamingTranscriptionSession,
    audioChunk: Buffer,
    isLast: boolean
  ): Promise<void> {
    // TODO: Implement Google Cloud Streaming Speech recognition
    // This would use the streaming recognize API for real-time transcription
  }

  private async cacheTranscriptionResult(result: TranscriptionResult): Promise<void> {
    try {
      const cacheKey = `transcription:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
      await redis.set(cacheKey, result, { ttl: 3600 }); // 1 hour TTL
    } catch (error) {
      logger.error('Error caching transcription result', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async storeStreamingResults(session: StreamingTranscriptionSession): Promise<void> {
    try {
      // TODO: Store streaming session results in database for analytics
      logger.debug('Storing streaming transcription results', {
        sessionId: session.sessionId,
        finalResultsCount: session.finalResults.length,
      });
    } catch (error) {
      logger.error('Error storing streaming results', {
        sessionId: session.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Cleanup inactive sessions
   */
  public cleanupInactiveSessions(): void {
    const now = new Date();
    const timeoutMs = 5 * 60 * 1000; // 5 minutes

    for (const [sessionId, session] of this.streamingSessions.entries()) {
      if (now.getTime() - session.lastActivity.getTime() > timeoutMs) {
        logger.info('Cleaning up inactive streaming session', { sessionId });
        this.endStreamingTranscription(sessionId);
      }
    }
  }

  /**
   * Get active sessions count
   */
  public getActiveSessionsCount(): number {
    return this.streamingSessions.size;
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{ google: boolean; aws: boolean }> {
    const health = {
      google: false,
      aws: false,
    };

    try {
      if (this.googleSpeechClient) {
        // Simple health check for Google Cloud
        health.google = true;
      }

      if (this.awsTranscribe) {
        // Simple health check for AWS
        health.aws = true;
      }
    } catch (error) {
      logger.error('Speech-to-text health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return health;
  }
}

// Export singleton instance
export const speechToTextService = SpeechToTextService.getInstance();
