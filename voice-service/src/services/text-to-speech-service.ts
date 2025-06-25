/**
 * Text-to-Speech Service
 * Handles speech synthesis using Google Cloud Text-to-Speech and AWS Polly
 */

import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import AWS from 'aws-sdk';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { redis } from '@/services/redis';

export interface SynthesisRequest {
  text: string;
  languageCode: string;
  voiceName?: string;
  voiceGender?: 'MALE' | 'FEMALE' | 'NEUTRAL';
  audioEncoding?: 'MP3' | 'LINEAR16' | 'OGG_OPUS';
  speakingRate?: number;
  pitch?: number;
  volumeGainDb?: number;
  ssmlGender?: 'MALE' | 'FEMALE' | 'NEUTRAL';
  metadata?: {
    callId?: string;
    organizationId?: string;
    userId?: string;
  };
}

export interface SynthesisResult {
  audioContent: Buffer;
  audioEncoding: string;
  text: string;
  languageCode: string;
  voiceName: string;
  duration: number;
  provider: 'google' | 'aws';
  metadata?: Record<string, any>;
}

export interface Voice {
  name: string;
  languageCode: string;
  gender: 'MALE' | 'FEMALE' | 'NEUTRAL';
  naturalSampleRateHertz: number;
  provider: 'google' | 'aws';
}

export interface VoiceSettings {
  organizationId: string;
  defaultVoice: string;
  defaultLanguage: string;
  customVoices: Record<string, {
    voiceName: string;
    speakingRate: number;
    pitch: number;
    volumeGainDb: number;
  }>;
  voicePersonalization: {
    enabled: boolean;
    userVoicePreferences: Record<string, string>;
  };
}

export class TextToSpeechService {
  private static instance: TextToSpeechService;
  private googleTTSClient: TextToSpeechClient | null = null;
  private awsPolly: AWS.Polly | null = null;
  private voiceCache: Map<string, Voice[]> = new Map();
  private audioCache: Map<string, Buffer> = new Map();

  private constructor() {
    this.initializeProviders();
    this.startCacheCleanup();
  }

  public static getInstance(): TextToSpeechService {
    if (!TextToSpeechService.instance) {
      TextToSpeechService.instance = new TextToSpeechService();
    }
    return TextToSpeechService.instance;
  }

  /**
   * Initialize TTS providers
   */
  private initializeProviders(): void {
    try {
      // Initialize Google Cloud Text-to-Speech
      if (config.googleCloud.projectId) {
        this.googleTTSClient = new TextToSpeechClient({
          projectId: config.googleCloud.projectId,
          keyFilename: config.googleCloud.keyFile,
        });
        logger.info('Google Cloud Text-to-Speech client initialized');
      }

      // Initialize AWS Polly
      if (config.aws.accessKeyId && config.aws.secretAccessKey) {
        AWS.config.update({
          accessKeyId: config.aws.accessKeyId,
          secretAccessKey: config.aws.secretAccessKey,
          region: config.aws.region,
        });
        this.awsPolly = new AWS.Polly();
        logger.info('AWS Polly client initialized');
      }

      if (!this.googleTTSClient && !this.awsPolly) {
        logger.warn('No text-to-speech providers configured');
      }
    } catch (error) {
      logger.error('Error initializing text-to-speech providers', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Synthesize speech from text
   */
  public async synthesizeSpeech(request: SynthesisRequest): Promise<SynthesisResult> {
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(request);
      const cachedAudio = this.audioCache.get(cacheKey);
      
      if (cachedAudio) {
        logger.debug('Returning cached audio', { cacheKey });
        return {
          audioContent: cachedAudio,
          audioEncoding: request.audioEncoding || config.tts.audioEncoding,
          text: request.text,
          languageCode: request.languageCode,
          voiceName: request.voiceName || config.tts.voiceName,
          duration: 0,
          provider: 'cache' as any,
          metadata: request.metadata,
        };
      }

      // Try Google Cloud first, then AWS as fallback
      let result: SynthesisResult;
      if (this.googleTTSClient) {
        result = await this.synthesizeWithGoogle(request);
      } else if (this.awsPolly) {
        result = await this.synthesizeWithAWS(request);
      } else {
        throw new Error('No text-to-speech providers available');
      }

      // Cache the result
      this.audioCache.set(cacheKey, result.audioContent);

      return result;
    } catch (error) {
      logger.error('Error synthesizing speech', {
        text: request.text.substring(0, 100),
        languageCode: request.languageCode,
        voiceName: request.voiceName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Synthesize speech using Google Cloud Text-to-Speech
   */
  private async synthesizeWithGoogle(request: SynthesisRequest): Promise<SynthesisResult> {
    if (!this.googleTTSClient) {
      throw new Error('Google Cloud TTS client not initialized');
    }

    const startTime = Date.now();

    try {
      const synthesisRequest = {
        input: { text: request.text },
        voice: {
          languageCode: request.languageCode,
          name: request.voiceName || config.tts.voiceName,
          ssmlGender: request.voiceGender || config.tts.voiceGender,
        },
        audioConfig: {
          audioEncoding: this.getGoogleAudioEncoding(request.audioEncoding || config.tts.audioEncoding),
          speakingRate: request.speakingRate || config.tts.speakingRate,
          pitch: request.pitch || config.tts.pitch,
          volumeGainDb: request.volumeGainDb || config.tts.volumeGainDb,
        },
      };

      const [response] = await this.googleTTSClient.synthesizeSpeech(synthesisRequest);
      
      if (!response.audioContent) {
        throw new Error('No audio content received from Google Cloud TTS');
      }

      const duration = Date.now() - startTime;
      const audioBuffer = Buffer.from(response.audioContent as Uint8Array);

      const result: SynthesisResult = {
        audioContent: audioBuffer,
        audioEncoding: request.audioEncoding || config.tts.audioEncoding,
        text: request.text,
        languageCode: request.languageCode,
        voiceName: request.voiceName || config.tts.voiceName,
        duration,
        provider: 'google',
        metadata: request.metadata,
      };

      logger.debug('Google Cloud TTS synthesis completed', {
        textLength: request.text.length,
        audioSize: audioBuffer.length,
        duration,
        voiceName: result.voiceName,
      });

      return result;
    } catch (error) {
      logger.error('Google Cloud TTS synthesis failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Synthesize speech using AWS Polly
   */
  private async synthesizeWithAWS(request: SynthesisRequest): Promise<SynthesisResult> {
    if (!this.awsPolly) {
      throw new Error('AWS Polly client not initialized');
    }

    const startTime = Date.now();

    try {
      const params = {
        Text: request.text,
        OutputFormat: this.getAWSOutputFormat(request.audioEncoding || config.tts.audioEncoding),
        VoiceId: this.mapVoiceToAWS(request.voiceName || config.tts.voiceName),
        LanguageCode: request.languageCode,
        SampleRate: '16000',
      };

      const response = await this.awsPolly.synthesizeSpeech(params).promise();
      
      if (!response.AudioStream) {
        throw new Error('No audio stream received from AWS Polly');
      }

      const duration = Date.now() - startTime;
      const audioBuffer = Buffer.from(response.AudioStream as Uint8Array);

      const result: SynthesisResult = {
        audioContent: audioBuffer,
        audioEncoding: request.audioEncoding || config.tts.audioEncoding,
        text: request.text,
        languageCode: request.languageCode,
        voiceName: request.voiceName || config.tts.voiceName,
        duration,
        provider: 'aws',
        metadata: request.metadata,
      };

      logger.debug('AWS Polly synthesis completed', {
        textLength: request.text.length,
        audioSize: audioBuffer.length,
        duration,
        voiceId: params.VoiceId,
      });

      return result;
    } catch (error) {
      logger.error('AWS Polly synthesis failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get available voices
   */
  public async getAvailableVoices(languageCode?: string): Promise<Voice[]> {
    try {
      const cacheKey = `voices:${languageCode || 'all'}`;
      const cachedVoices = this.voiceCache.get(cacheKey);
      
      if (cachedVoices) {
        return cachedVoices;
      }

      const voices: Voice[] = [];

      // Get Google Cloud voices
      if (this.googleTTSClient) {
        const googleVoices = await this.getGoogleVoices(languageCode);
        voices.push(...googleVoices);
      }

      // Get AWS Polly voices
      if (this.awsPolly) {
        const awsVoices = await this.getAWSVoices(languageCode);
        voices.push(...awsVoices);
      }

      // Cache the results
      this.voiceCache.set(cacheKey, voices);

      return voices;
    } catch (error) {
      logger.error('Error getting available voices', {
        languageCode,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get voice settings for organization
   */
  public async getVoiceSettings(organizationId: string): Promise<VoiceSettings | null> {
    try {
      const cacheKey = `voice_settings:${organizationId}`;
      const cached = await redis.get<VoiceSettings>(cacheKey);
      
      if (cached) {
        return cached;
      }

      // TODO: Load from database
      const defaultSettings: VoiceSettings = {
        organizationId,
        defaultVoice: config.tts.voiceName,
        defaultLanguage: config.voice.languageCode,
        customVoices: {},
        voicePersonalization: {
          enabled: false,
          userVoicePreferences: {},
        },
      };

      await redis.set(cacheKey, defaultSettings, { ttl: 3600 });
      return defaultSettings;
    } catch (error) {
      logger.error('Error getting voice settings', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Update voice settings for organization
   */
  public async updateVoiceSettings(
    organizationId: string,
    settings: Partial<VoiceSettings>
  ): Promise<VoiceSettings | null> {
    try {
      const currentSettings = await this.getVoiceSettings(organizationId);
      if (!currentSettings) {
        throw new Error('Voice settings not found');
      }

      const updatedSettings: VoiceSettings = {
        ...currentSettings,
        ...settings,
        organizationId,
      };

      // TODO: Save to database
      
      const cacheKey = `voice_settings:${organizationId}`;
      await redis.set(cacheKey, updatedSettings, { ttl: 3600 });

      logger.info('Voice settings updated', {
        organizationId,
        changes: Object.keys(settings),
      });

      return updatedSettings;
    } catch (error) {
      logger.error('Error updating voice settings', {
        organizationId,
        settings,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Helper methods
   */
  private generateCacheKey(request: SynthesisRequest): string {
    const key = `tts:${request.text}:${request.languageCode}:${request.voiceName || 'default'}:${request.speakingRate || 1}:${request.pitch || 0}`;
    return Buffer.from(key).toString('base64').substring(0, 50);
  }

  private getGoogleAudioEncoding(encoding: string): string {
    const encodingMap: Record<string, string> = {
      MP3: 'MP3',
      LINEAR16: 'LINEAR16',
      OGG_OPUS: 'OGG_OPUS',
    };
    return encodingMap[encoding] || 'MP3';
  }

  private getAWSOutputFormat(encoding: string): string {
    const formatMap: Record<string, string> = {
      MP3: 'mp3',
      LINEAR16: 'pcm',
      OGG_OPUS: 'ogg_vorbis',
    };
    return formatMap[encoding] || 'mp3';
  }

  private mapVoiceToAWS(googleVoiceName: string): string {
    // Map Google voice names to AWS voice IDs
    const voiceMap: Record<string, string> = {
      'en-US-Wavenet-D': 'Joanna',
      'en-US-Wavenet-A': 'Matthew',
      'en-GB-Wavenet-A': 'Emma',
      'en-GB-Wavenet-B': 'Brian',
    };
    return voiceMap[googleVoiceName] || 'Joanna';
  }

  private async getGoogleVoices(languageCode?: string): Promise<Voice[]> {
    try {
      if (!this.googleTTSClient) return [];

      const [response] = await this.googleTTSClient.listVoices({
        languageCode,
      });

      return response.voices?.map(voice => ({
        name: voice.name || '',
        languageCode: voice.languageCodes?.[0] || '',
        gender: (voice.ssmlGender as any) || 'NEUTRAL',
        naturalSampleRateHertz: voice.naturalSampleRateHertz || 16000,
        provider: 'google' as const,
      })) || [];
    } catch (error) {
      logger.error('Error getting Google voices', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async getAWSVoices(languageCode?: string): Promise<Voice[]> {
    try {
      if (!this.awsPolly) return [];

      const response = await this.awsPolly.describeVoices({
        LanguageCode: languageCode,
      }).promise();

      return response.Voices?.map(voice => ({
        name: voice.Id || '',
        languageCode: voice.LanguageCode || '',
        gender: (voice.Gender as any) || 'NEUTRAL',
        naturalSampleRateHertz: 16000,
        provider: 'aws' as const,
      })) || [];
    } catch (error) {
      logger.error('Error getting AWS voices', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Start cache cleanup interval
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      // Clear audio cache if it gets too large
      if (this.audioCache.size > 1000) {
        this.audioCache.clear();
        logger.debug('Audio cache cleared');
      }

      // Clear voice cache periodically
      if (this.voiceCache.size > 100) {
        this.voiceCache.clear();
        logger.debug('Voice cache cleared');
      }
    }, 60 * 60 * 1000); // Every hour
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
      if (this.googleTTSClient) {
        // Simple health check for Google Cloud
        health.google = true;
      }

      if (this.awsPolly) {
        // Simple health check for AWS
        health.aws = true;
      }
    } catch (error) {
      logger.error('Text-to-speech health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return health;
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): {
    audioCacheSize: number;
    voiceCacheSize: number;
  } {
    return {
      audioCacheSize: this.audioCache.size,
      voiceCacheSize: this.voiceCache.size,
    };
  }
}

// Export singleton instance
export const textToSpeechService = TextToSpeechService.getInstance();
