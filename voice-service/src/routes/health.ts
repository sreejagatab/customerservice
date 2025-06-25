/**
 * Health Check Routes for Voice Service
 */

import { Router, Request, Response } from 'express';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { callHandlingService } from '@/services/call-handling-service';
import { ivrService } from '@/services/ivr-service';
import { speechToTextService } from '@/services/speech-to-text-service';
import { textToSpeechService } from '@/services/text-to-speech-service';
import { voiceAnalyticsService } from '@/services/voice-analytics-service';

const router = Router();

/**
 * Basic health check
 * GET /health
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const health = {
      success: true,
      service: config.serviceName,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.nodeEnv,
      status: 'healthy',
    };

    res.json(health);
  } catch (error) {
    logger.error('Health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(503).json({
      success: false,
      service: config.serviceName,
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Detailed health check
 * GET /health/detailed
 */
router.get('/detailed', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    
    // Check all voice services
    const [
      callHandlingHealth,
      ivrHealth,
      sttHealth,
      ttsHealth,
      analyticsHealth,
    ] = await Promise.allSettled([
      callHandlingService.healthCheck(),
      config.ivr.enabled ? ivrService.healthCheck() : Promise.resolve({ status: 'disabled' }),
      speechToTextService.healthCheck(),
      textToSpeechService.healthCheck(),
      voiceAnalyticsService.healthCheck(),
    ]);

    // Get memory usage
    const memoryUsage = process.memoryUsage();

    // Get call statistics
    const callStats = callHandlingService.getCallStatistics();

    const responseTime = Date.now() - startTime;
    
    const health = {
      success: true,
      service: config.serviceName,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.nodeEnv,
      responseTime: `${responseTime}ms`,
      components: {
        callHandling: {
          status: callHandlingHealth.status === 'fulfilled' ? 'healthy' : 'unhealthy',
          details: callHandlingHealth.status === 'fulfilled' ? callHandlingHealth.value : callHandlingHealth.reason,
        },
        ivr: {
          status: ivrHealth.status === 'fulfilled' ? 'healthy' : 'unhealthy',
          details: ivrHealth.status === 'fulfilled' ? ivrHealth.value : ivrHealth.reason,
        },
        speechToText: {
          status: sttHealth.status === 'fulfilled' ? 'healthy' : 'unhealthy',
          details: sttHealth.status === 'fulfilled' ? sttHealth.value : sttHealth.reason,
        },
        textToSpeech: {
          status: ttsHealth.status === 'fulfilled' ? 'healthy' : 'unhealthy',
          details: ttsHealth.status === 'fulfilled' ? ttsHealth.value : ttsHealth.reason,
        },
        voiceAnalytics: {
          status: analyticsHealth.status === 'fulfilled' ? 'healthy' : 'unhealthy',
          details: analyticsHealth.status === 'fulfilled' ? analyticsHealth.value : analyticsHealth.reason,
        },
        memory: {
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
          external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
        },
      },
      statistics: {
        calls: callStats,
        ttsCache: textToSpeechService.getCacheStats(),
      },
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
    };

    // Determine overall status
    const allHealthy = [callHandlingHealth, ivrHealth, sttHealth, ttsHealth, analyticsHealth]
      .every(result => result.status === 'fulfilled');

    if (!allHealthy) {
      res.status(503);
    }

    res.json(health);
  } catch (error) {
    logger.error('Detailed health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(503).json({
      success: false,
      service: config.serviceName,
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Readiness check
 * GET /health/ready
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const callHandlingReady = await callHandlingService.isReady();
    const sttReady = await speechToTextService.isReady();
    const ttsReady = await textToSpeechService.isReady();
    
    const isReady = callHandlingReady && sttReady && ttsReady;

    if (isReady) {
      res.json({
        success: true,
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        success: false,
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        reason: 'Voice services not ready',
      });
    }
  } catch (error) {
    logger.error('Readiness check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(503).json({
      success: false,
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Liveness check
 * GET /health/live
 */
router.get('/live', (req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * Twilio connectivity check
 * GET /health/twilio
 */
router.get('/twilio', async (req: Request, res: Response) => {
  try {
    const twilioHealth = await callHandlingService.healthCheck();

    res.json({
      success: true,
      status: twilioHealth.twilio ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
      details: twilioHealth,
    });
  } catch (error) {
    logger.error('Twilio health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(503).json({
      success: false,
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Twilio connection failed',
    });
  }
});

/**
 * Voice providers health check
 * GET /health/providers
 */
router.get('/providers', async (req: Request, res: Response) => {
  try {
    const sttHealth = await speechToTextService.healthCheck();
    const ttsHealth = await textToSpeechService.healthCheck();

    const providers = {
      speechToText: sttHealth,
      textToSpeech: ttsHealth,
    };

    const allHealthy = Object.values(sttHealth).some(status => status) && 
                      Object.values(ttsHealth).some(status => status);

    res.status(allHealthy ? 200 : 503).json({
      success: allHealthy,
      status: allHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      providers,
    });
  } catch (error) {
    logger.error('Providers health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(503).json({
      success: false,
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Providers health check failed',
    });
  }
});

export default router;
