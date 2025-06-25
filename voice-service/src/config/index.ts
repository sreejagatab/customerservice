/**
 * Voice Service Configuration
 * Universal AI Customer Service Platform - Voice Communication Engine
 */

import Joi from 'joi';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration schema validation
const configSchema = Joi.object({
  // Server configuration
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3006),
  SERVICE_NAME: Joi.string().default('voice-service'),
  
  // Database configuration
  DATABASE_URL: Joi.string().required(),
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_NAME: Joi.string().default('universal_ai_cs'),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  
  // Redis configuration
  REDIS_URL: Joi.string().optional(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional(),
  REDIS_DB: Joi.number().default(3),
  
  // Twilio configuration
  TWILIO_ACCOUNT_SID: Joi.string().required(),
  TWILIO_AUTH_TOKEN: Joi.string().required(),
  TWILIO_PHONE_NUMBER: Joi.string().required(),
  TWILIO_WEBHOOK_URL: Joi.string().optional(),
  
  // Google Cloud Speech/TTS configuration
  GOOGLE_CLOUD_PROJECT_ID: Joi.string().required(),
  GOOGLE_CLOUD_KEY_FILE: Joi.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: Joi.string().optional(),
  
  // AWS configuration (alternative to Google Cloud)
  AWS_ACCESS_KEY_ID: Joi.string().optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().optional(),
  AWS_REGION: Joi.string().default('us-east-1'),
  
  // Voice processing configuration
  VOICE_SAMPLE_RATE: Joi.number().default(16000),
  VOICE_ENCODING: Joi.string().default('LINEAR16'),
  VOICE_LANGUAGE_CODE: Joi.string().default('en-US'),
  VOICE_MAX_ALTERNATIVES: Joi.number().default(3),
  VOICE_PROFANITY_FILTER: Joi.boolean().default(true),
  VOICE_ENABLE_WORD_TIME_OFFSETS: Joi.boolean().default(true),
  VOICE_ENABLE_AUTOMATIC_PUNCTUATION: Joi.boolean().default(true),
  
  // TTS configuration
  TTS_VOICE_NAME: Joi.string().default('en-US-Wavenet-D'),
  TTS_VOICE_GENDER: Joi.string().valid('MALE', 'FEMALE', 'NEUTRAL').default('NEUTRAL'),
  TTS_AUDIO_ENCODING: Joi.string().default('MP3'),
  TTS_SPEAKING_RATE: Joi.number().min(0.25).max(4.0).default(1.0),
  TTS_PITCH: Joi.number().min(-20.0).max(20.0).default(0.0),
  TTS_VOLUME_GAIN_DB: Joi.number().min(-96.0).max(16.0).default(0.0),
  
  // Call handling configuration
  CALL_MAX_DURATION: Joi.number().default(3600), // 1 hour in seconds
  CALL_RECORDING_ENABLED: Joi.boolean().default(true),
  CALL_TRANSCRIPTION_ENABLED: Joi.boolean().default(true),
  CALL_SENTIMENT_ANALYSIS: Joi.boolean().default(true),
  CALL_QUEUE_TIMEOUT: Joi.number().default(300), // 5 minutes
  CALL_MAX_QUEUE_SIZE: Joi.number().default(100),
  
  // IVR configuration
  IVR_ENABLED: Joi.boolean().default(true),
  IVR_MAX_RETRIES: Joi.number().default(3),
  IVR_TIMEOUT: Joi.number().default(10), // seconds
  IVR_DEFAULT_LANGUAGE: Joi.string().default('en-US'),
  
  // WebRTC configuration
  WEBRTC_ENABLED: Joi.boolean().default(true),
  WEBRTC_STUN_SERVERS: Joi.string().default('stun:stun.l.google.com:19302'),
  WEBRTC_TURN_SERVERS: Joi.string().optional(),
  
  // File storage configuration
  VOICE_STORAGE_TYPE: Joi.string().valid('local', 's3', 'gcs').default('local'),
  VOICE_STORAGE_BUCKET: Joi.string().optional(),
  VOICE_STORAGE_PATH: Joi.string().default('./voice-files'),
  VOICE_FILE_RETENTION_DAYS: Joi.number().default(90),
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),
  
  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FORMAT: Joi.string().valid('json', 'simple').default('json'),
  
  // External services
  MESSAGE_SERVICE_URL: Joi.string().default('http://localhost:3004'),
  MESSAGE_SERVICE_API_KEY: Joi.string().required(),
  NOTIFICATION_SERVICE_URL: Joi.string().default('http://localhost:3005'),
  NOTIFICATION_SERVICE_API_KEY: Joi.string().required(),
  AI_SERVICE_URL: Joi.string().default('http://localhost:3003'),
  AI_SERVICE_API_KEY: Joi.string().required(),
  ADMIN_SERVICE_URL: Joi.string().default('http://localhost:3001'),
  ADMIN_SERVICE_API_KEY: Joi.string().required(),
  
  // Analytics configuration
  VOICE_ANALYTICS_ENABLED: Joi.boolean().default(true),
  VOICE_ANALYTICS_BATCH_SIZE: Joi.number().default(100),
  VOICE_ANALYTICS_FLUSH_INTERVAL: Joi.number().default(60000), // 1 minute
  
  // Security
  CORS_ORIGIN: Joi.string().default('*'),
  TRUST_PROXY: Joi.boolean().default(false),
  ENABLE_REQUEST_LOGGING: Joi.boolean().default(true),
  ENABLE_SECURITY_HEADERS: Joi.boolean().default(true),
  
  // Feature flags
  ENABLE_VOICE_BIOMETRICS: Joi.boolean().default(false),
  ENABLE_REAL_TIME_TRANSCRIPTION: Joi.boolean().default(true),
  ENABLE_CALL_RECORDING: Joi.boolean().default(true),
  ENABLE_SENTIMENT_ANALYSIS: Joi.boolean().default(true),
  ENABLE_VOICE_ANALYTICS: Joi.boolean().default(true),
  ENABLE_IVR: Joi.boolean().default(true),
  ENABLE_WEBRTC: Joi.boolean().default(true),
  
  // Performance monitoring
  ENABLE_METRICS: Joi.boolean().default(true),
  METRICS_PORT: Joi.number().default(9096),
}).unknown();

// Validate configuration
const { error, value: envVars } = configSchema.validate(process.env);

if (error) {
  throw new Error(`Voice Service config validation error: ${error.message}`);
}

// Export configuration
export const config = {
  // Server
  nodeEnv: envVars.NODE_ENV,
  port: envVars.PORT,
  serviceName: envVars.SERVICE_NAME,
  
  // Database
  database: {
    url: envVars.DATABASE_URL,
    host: envVars.DB_HOST,
    port: envVars.DB_PORT,
    name: envVars.DB_NAME,
    user: envVars.DB_USER,
    password: envVars.DB_PASSWORD,
  },
  
  // Redis
  redis: {
    url: envVars.REDIS_URL,
    host: envVars.REDIS_HOST,
    port: envVars.REDIS_PORT,
    password: envVars.REDIS_PASSWORD,
    db: envVars.REDIS_DB,
  },
  
  // Twilio
  twilio: {
    accountSid: envVars.TWILIO_ACCOUNT_SID,
    authToken: envVars.TWILIO_AUTH_TOKEN,
    phoneNumber: envVars.TWILIO_PHONE_NUMBER,
    webhookUrl: envVars.TWILIO_WEBHOOK_URL,
  },
  
  // Google Cloud
  googleCloud: {
    projectId: envVars.GOOGLE_CLOUD_PROJECT_ID,
    keyFile: envVars.GOOGLE_CLOUD_KEY_FILE,
    credentials: envVars.GOOGLE_APPLICATION_CREDENTIALS,
  },
  
  // AWS
  aws: {
    accessKeyId: envVars.AWS_ACCESS_KEY_ID,
    secretAccessKey: envVars.AWS_SECRET_ACCESS_KEY,
    region: envVars.AWS_REGION,
  },
  
  // Voice processing
  voice: {
    sampleRate: envVars.VOICE_SAMPLE_RATE,
    encoding: envVars.VOICE_ENCODING,
    languageCode: envVars.VOICE_LANGUAGE_CODE,
    maxAlternatives: envVars.VOICE_MAX_ALTERNATIVES,
    profanityFilter: envVars.VOICE_PROFANITY_FILTER,
    enableWordTimeOffsets: envVars.VOICE_ENABLE_WORD_TIME_OFFSETS,
    enableAutomaticPunctuation: envVars.VOICE_ENABLE_AUTOMATIC_PUNCTUATION,
  },
  
  // Text-to-Speech
  tts: {
    voiceName: envVars.TTS_VOICE_NAME,
    voiceGender: envVars.TTS_VOICE_GENDER,
    audioEncoding: envVars.TTS_AUDIO_ENCODING,
    speakingRate: envVars.TTS_SPEAKING_RATE,
    pitch: envVars.TTS_PITCH,
    volumeGainDb: envVars.TTS_VOLUME_GAIN_DB,
  },
  
  // Call handling
  call: {
    maxDuration: envVars.CALL_MAX_DURATION,
    recordingEnabled: envVars.CALL_RECORDING_ENABLED,
    transcriptionEnabled: envVars.CALL_TRANSCRIPTION_ENABLED,
    sentimentAnalysis: envVars.CALL_SENTIMENT_ANALYSIS,
    queueTimeout: envVars.CALL_QUEUE_TIMEOUT,
    maxQueueSize: envVars.CALL_MAX_QUEUE_SIZE,
  },
  
  // IVR
  ivr: {
    enabled: envVars.IVR_ENABLED,
    maxRetries: envVars.IVR_MAX_RETRIES,
    timeout: envVars.IVR_TIMEOUT,
    defaultLanguage: envVars.IVR_DEFAULT_LANGUAGE,
  },
  
  // WebRTC
  webrtc: {
    enabled: envVars.WEBRTC_ENABLED,
    stunServers: envVars.WEBRTC_STUN_SERVERS.split(','),
    turnServers: envVars.WEBRTC_TURN_SERVERS ? envVars.WEBRTC_TURN_SERVERS.split(',') : [],
  },
  
  // File storage
  storage: {
    type: envVars.VOICE_STORAGE_TYPE,
    bucket: envVars.VOICE_STORAGE_BUCKET,
    path: envVars.VOICE_STORAGE_PATH,
    retentionDays: envVars.VOICE_FILE_RETENTION_DAYS,
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: envVars.RATE_LIMIT_WINDOW_MS,
    maxRequests: envVars.RATE_LIMIT_MAX_REQUESTS,
  },
  
  // Logging
  logging: {
    level: envVars.LOG_LEVEL,
    format: envVars.LOG_FORMAT,
  },
  
  // External services
  services: {
    message: {
      url: envVars.MESSAGE_SERVICE_URL,
      apiKey: envVars.MESSAGE_SERVICE_API_KEY,
    },
    notification: {
      url: envVars.NOTIFICATION_SERVICE_URL,
      apiKey: envVars.NOTIFICATION_SERVICE_API_KEY,
    },
    ai: {
      url: envVars.AI_SERVICE_URL,
      apiKey: envVars.AI_SERVICE_API_KEY,
    },
    admin: {
      url: envVars.ADMIN_SERVICE_URL,
      apiKey: envVars.ADMIN_SERVICE_API_KEY,
    },
  },
  
  // Analytics
  analytics: {
    enabled: envVars.VOICE_ANALYTICS_ENABLED,
    batchSize: envVars.VOICE_ANALYTICS_BATCH_SIZE,
    flushInterval: envVars.VOICE_ANALYTICS_FLUSH_INTERVAL,
  },
  
  // Security
  security: {
    corsOrigin: envVars.CORS_ORIGIN,
    trustProxy: envVars.TRUST_PROXY,
    enableRequestLogging: envVars.ENABLE_REQUEST_LOGGING,
    enableSecurityHeaders: envVars.ENABLE_SECURITY_HEADERS,
  },
  
  // Feature flags
  features: {
    voiceBiometrics: envVars.ENABLE_VOICE_BIOMETRICS,
    realTimeTranscription: envVars.ENABLE_REAL_TIME_TRANSCRIPTION,
    callRecording: envVars.ENABLE_CALL_RECORDING,
    sentimentAnalysis: envVars.ENABLE_SENTIMENT_ANALYSIS,
    voiceAnalytics: envVars.ENABLE_VOICE_ANALYTICS,
    ivr: envVars.ENABLE_IVR,
    webrtc: envVars.ENABLE_WEBRTC,
  },
  
  // Performance monitoring
  metrics: {
    enabled: envVars.ENABLE_METRICS,
    port: envVars.METRICS_PORT,
  },
};
