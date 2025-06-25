/**
 * Voice Service - Main Application Entry Point
 * Universal AI Customer Service Platform - Voice Integration Engine
 */

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { config } from '@/config';
import { logger, createRequestLogger } from '@/utils/logger';
import { 
  errorHandler, 
  handleUncaughtException, 
  handleUnhandledRejection 
} from '@/utils/errors';

// Import services
import { callHandlingService } from '@/services/call-handling-service';
import { ivrService } from '@/services/ivr-service';
import { speechToTextService } from '@/services/speech-to-text-service';
import { textToSpeechService } from '@/services/text-to-speech-service';
import { voiceAnalyticsService } from '@/services/voice-analytics-service';

// Import routes
import healthRoutes from '@/routes/health';
import callRoutes from '@/routes/calls';
import ivrRoutes from '@/routes/ivr';
import analyticsRoutes from '@/routes/analytics';
import webhookRoutes from '@/routes/webhooks';

class VoiceService {
  private app: Application;
  private server: Server | null = null;
  private io: SocketIOServer | null = null;

  constructor() {
    this.app = express();
    
    this.setupGlobalErrorHandlers();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private setupGlobalErrorHandlers(): void {
    process.on('uncaughtException', handleUncaughtException);
    process.on('unhandledRejection', handleUnhandledRejection);
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "wss:", "ws:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: config.security.corsOrigin === '*' ? true : config.security.corsOrigin.split(','),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-API-Key', 'X-Organization-ID'],
    }));

    // Compression
    this.app.use(compression());

    // Request parsing
    this.app.use(express.json({ limit: '50mb' })); // Larger limit for audio data
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    this.app.use(express.raw({ type: 'audio/*', limit: '50mb' }));

    // Trust proxy if configured
    if (config.security.trustProxy) {
      this.app.set('trust proxy', 1);
    }

    // Request logging
    if (config.security.enableRequestLogging) {
      this.app.use(morgan('combined', {
        stream: {
          write: (message: string) => {
            logger.info(message.trim());
          },
        },
      }));
      this.app.use(createRequestLogger());
    }

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.maxRequests,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
          timestamp: new Date().toISOString(),
        },
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    // Request ID middleware
    this.app.use((req, res, next) => {
      req.headers['x-request-id'] = req.headers['x-request-id'] || 
        `voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Request-ID', req.headers['x-request-id'] as string);
      next();
    });

    // Organization context middleware
    this.app.use((req, res, next) => {
      const organizationId = req.headers['x-organization-id'] as string;
      if (organizationId) {
        (req as any).organizationId = organizationId;
      }
      next();
    });
  }

  private initializeRoutes(): void {
    // Health check routes (no authentication required)
    this.app.use('/health', healthRoutes);

    // Webhook routes (Twilio webhooks)
    this.app.use('/webhooks', webhookRoutes);

    // API routes
    this.app.use('/api/v1/calls', callRoutes);
    this.app.use('/api/v1/ivr', ivrRoutes);
    this.app.use('/api/v1/analytics', analyticsRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        service: config.serviceName,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: config.nodeEnv,
        features: {
          callHandling: true,
          ivr: config.ivr.enabled,
          speechToText: true,
          textToSpeech: true,
          voiceAnalytics: true,
          webrtc: config.webrtc.enabled,
          recording: config.call.recordingEnabled,
          transcription: config.call.transcriptionEnabled,
          sentimentAnalysis: config.call.sentimentAnalysis,
        },
        providers: {
          twilio: !!config.twilio.accountSid,
          googleCloud: !!config.googleCloud.projectId,
          aws: !!config.aws.accessKeyId,
        },
      });
    });

    // API documentation
    this.app.get('/api-docs', (req, res) => {
      res.json({
        openapi: '3.0.0',
        info: {
          title: 'Voice Service API',
          version: '1.0.0',
          description: 'Universal AI Customer Service Platform - Voice Service',
        },
        servers: [
          {
            url: `http://localhost:${config.port}`,
            description: 'Development server',
          },
        ],
        paths: {
          '/health': {
            get: {
              summary: 'Health check',
              responses: {
                '200': {
                  description: 'Service is healthy',
                },
              },
            },
          },
          '/api/v1/calls': {
            get: {
              summary: 'Get calls',
              responses: {
                '200': {
                  description: 'List of calls',
                },
              },
            },
          },
        },
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Route ${req.method} ${req.originalUrl} not found`,
          timestamp: new Date().toISOString(),
        },
      });
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  private initializeWebSocket(): void {
    if (!this.server) {
      throw new Error('HTTP server must be initialized before WebSocket');
    }

    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: config.security.corsOrigin === '*' ? true : config.security.corsOrigin.split(','),
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    // WebSocket connection handling for real-time voice features
    this.io.on('connection', (socket) => {
      logger.info('WebSocket client connected', {
        socketId: socket.id,
        clientIP: socket.handshake.address,
      });

      // Handle voice call events
      socket.on('join_call', async (data) => {
        try {
          const { callId, organizationId } = data;
          socket.join(`call:${callId}`);
          socket.join(`org:${organizationId}`);
          
          logger.info('Client joined call room', {
            socketId: socket.id,
            callId,
            organizationId,
          });
        } catch (error) {
          logger.error('Failed to join call room', {
            socketId: socket.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      // Handle real-time transcription
      socket.on('transcription_update', (data) => {
        const { callId, transcript, confidence } = data;
        socket.to(`call:${callId}`).emit('live_transcript', {
          transcript,
          confidence,
          timestamp: new Date().toISOString(),
        });
      });

      // Handle call quality updates
      socket.on('call_quality', (data) => {
        const { callId, quality } = data;
        socket.to(`call:${callId}`).emit('quality_update', {
          quality,
          timestamp: new Date().toISOString(),
        });
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        logger.info('WebSocket client disconnected', {
          socketId: socket.id,
          reason,
        });
      });
    });

    logger.info('WebSocket server initialized for voice features');
  }

  private async initializeServices(): Promise<void> {
    try {
      // Initialize call handling service
      await callHandlingService.initialize();
      logger.info('Call handling service initialized');

      // Initialize IVR service
      if (config.ivr.enabled) {
        await ivrService.initialize();
        logger.info('IVR service initialized');
      }

      // Initialize speech-to-text service
      await speechToTextService.initialize();
      logger.info('Speech-to-text service initialized');

      // Initialize text-to-speech service
      await textToSpeechService.initialize();
      logger.info('Text-to-speech service initialized');

      // Initialize voice analytics service
      await voiceAnalyticsService.initialize();
      logger.info('Voice analytics service initialized');

      logger.info('All voice services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize voice services', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  public async start(): Promise<void> {
    try {
      // Initialize services
      await this.initializeServices();

      // Start HTTP server
      this.server = this.app.listen(config.port, () => {
        logger.info('Voice Service started', {
          port: config.port,
          environment: config.nodeEnv,
          service: config.serviceName,
          timestamp: new Date().toISOString(),
          features: {
            callHandling: true,
            ivr: config.ivr.enabled,
            webrtc: config.webrtc.enabled,
            recording: config.call.recordingEnabled,
            transcription: config.call.transcriptionEnabled,
          },
        });
      });

      // Initialize WebSocket service for real-time features
      this.initializeWebSocket();
      logger.info('WebSocket service initialized for voice features');

      // Handle server errors
      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${config.port} is already in use`);
        } else {
          logger.error('Server error', { error: error.message });
        }
        process.exit(1);
      });

      // Start background services
      await this.startBackgroundServices();

    } catch (error) {
      logger.error('Failed to start Voice Service', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  }

  private async startBackgroundServices(): Promise<void> {
    try {
      // Start call monitoring
      await callHandlingService.startMonitoring();
      logger.info('Call monitoring started');

      // Start voice analytics processing
      await voiceAnalyticsService.startProcessing();
      logger.info('Voice analytics processing started');

      // Start IVR session cleanup
      if (config.ivr.enabled) {
        await ivrService.startSessionCleanup();
        logger.info('IVR session cleanup started');
      }

      logger.info('All background services started');
    } catch (error) {
      logger.error('Failed to start background services', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public async stop(): Promise<void> {
    logger.info('Shutting down Voice Service...');

    try {
      // Stop background services
      await callHandlingService.stopMonitoring();
      logger.info('Call monitoring stopped');

      await voiceAnalyticsService.stopProcessing();
      logger.info('Voice analytics processing stopped');

      if (config.ivr.enabled) {
        await ivrService.stopSessionCleanup();
        logger.info('IVR session cleanup stopped');
      }

      // Close WebSocket server
      if (this.io) {
        this.io.close();
        logger.info('WebSocket server closed');
      }

      // Close HTTP server
      if (this.server) {
        await new Promise<void>((resolve, reject) => {
          this.server!.close((error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
        logger.info('HTTP server closed');
      }

      // Close service connections
      await callHandlingService.close();
      await speechToTextService.close();
      await textToSpeechService.close();
      await voiceAnalyticsService.close();

      if (config.ivr.enabled) {
        await ivrService.close();
      }

      logger.info('Voice Service shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public getApp(): Application {
    return this.app;
  }

  public getIO(): SocketIOServer | null {
    return this.io;
  }

  public getServices() {
    return {
      callHandling: callHandlingService,
      ivr: ivrService,
      speechToText: speechToTextService,
      textToSpeech: textToSpeechService,
      voiceAnalytics: voiceAnalyticsService,
    };
  }
}

// Create and start the service
const voiceService = new VoiceService();

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, starting graceful shutdown');
  await voiceService.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, starting graceful shutdown');
  await voiceService.stop();
  process.exit(0);
});

// Start the service
if (require.main === module) {
  voiceService.start().catch((error) => {
    logger.error('Failed to start service', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}

export default voiceService;
