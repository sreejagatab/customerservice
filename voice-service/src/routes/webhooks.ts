/**
 * Webhook Routes for Twilio Integration
 */

import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { callHandlingService } from '@/services/call-handling-service';
import { ivrService } from '@/services/ivr-service';
import { voiceAnalyticsService } from '@/services/voice-analytics-service';
import { logger } from '@/utils/logger';
import { asyncHandler } from '@/utils/async-handler';
import { config } from '@/config';

const router = Router();

/**
 * Twilio voice webhook
 * POST /webhooks/twilio/voice
 */
router.post('/twilio/voice', asyncHandler(async (req: Request, res: Response) => {
  try {
    const {
      CallSid,
      From,
      To,
      CallStatus,
      Direction,
      AccountSid,
    } = req.body;

    logger.info('Twilio voice webhook received', {
      callSid: CallSid,
      from: From,
      to: To,
      status: CallStatus,
      direction: Direction,
    });

    // Handle incoming call
    if (Direction === 'inbound') {
      const twiml = await callHandlingService.handleIncomingCall({
        callSid: CallSid,
        from: From,
        to: To,
        status: CallStatus,
      });

      res.type('text/xml');
      res.send(twiml);
    } else {
      // Handle outbound call status update
      await callHandlingService.updateCallStatus(CallSid, CallStatus);
      res.status(200).send('OK');
    }
  } catch (error) {
    logger.error('Twilio voice webhook error', {
      error: error instanceof Error ? error.message : String(error),
      body: req.body,
    });

    res.status(500).send('Internal Server Error');
  }
}));

/**
 * Twilio call status webhook
 * POST /webhooks/twilio/status
 */
router.post('/twilio/status', asyncHandler(async (req: Request, res: Response) => {
  try {
    const {
      CallSid,
      CallStatus,
      CallDuration,
      RecordingUrl,
      RecordingDuration,
    } = req.body;

    logger.info('Twilio status webhook received', {
      callSid: CallSid,
      status: CallStatus,
      duration: CallDuration,
      recordingUrl: RecordingUrl,
    });

    // Update call status and metadata
    await callHandlingService.updateCallStatus(CallSid, CallStatus, {
      duration: CallDuration ? parseInt(CallDuration) : undefined,
      recordingUrl: RecordingUrl,
      recordingDuration: RecordingDuration ? parseInt(RecordingDuration) : undefined,
    });

    // If call is completed, trigger analytics processing
    if (CallStatus === 'completed' && RecordingUrl) {
      await voiceAnalyticsService.processCallRecording(CallSid, RecordingUrl);
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Twilio status webhook error', {
      error: error instanceof Error ? error.message : String(error),
      body: req.body,
    });

    res.status(500).send('Internal Server Error');
  }
}));

/**
 * Twilio recording webhook
 * POST /webhooks/twilio/recording
 */
router.post('/twilio/recording', asyncHandler(async (req: Request, res: Response) => {
  try {
    const {
      CallSid,
      RecordingSid,
      RecordingUrl,
      RecordingStatus,
      RecordingDuration,
    } = req.body;

    logger.info('Twilio recording webhook received', {
      callSid: CallSid,
      recordingSid: RecordingSid,
      recordingUrl: RecordingUrl,
      status: RecordingStatus,
      duration: RecordingDuration,
    });

    // Update call with recording information
    await callHandlingService.updateCallRecording(CallSid, {
      recordingSid: RecordingSid,
      recordingUrl: RecordingUrl,
      recordingStatus: RecordingStatus,
      recordingDuration: RecordingDuration ? parseInt(RecordingDuration) : undefined,
    });

    // Process recording for transcription and analytics
    if (RecordingStatus === 'completed') {
      await voiceAnalyticsService.processCallRecording(CallSid, RecordingUrl);
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Twilio recording webhook error', {
      error: error instanceof Error ? error.message : String(error),
      body: req.body,
    });

    res.status(500).send('Internal Server Error');
  }
}));

/**
 * Twilio transcription webhook
 * POST /webhooks/twilio/transcription
 */
router.post('/twilio/transcription', asyncHandler(async (req: Request, res: Response) => {
  try {
    const {
      CallSid,
      TranscriptionSid,
      TranscriptionText,
      TranscriptionStatus,
      TranscriptionUrl,
    } = req.body;

    logger.info('Twilio transcription webhook received', {
      callSid: CallSid,
      transcriptionSid: TranscriptionSid,
      status: TranscriptionStatus,
      textLength: TranscriptionText ? TranscriptionText.length : 0,
    });

    // Update call with transcription
    await callHandlingService.updateCallTranscription(CallSid, {
      transcriptionSid: TranscriptionSid,
      transcriptionText: TranscriptionText,
      transcriptionStatus: TranscriptionStatus,
      transcriptionUrl: TranscriptionUrl,
    });

    // Process transcription for analytics
    if (TranscriptionStatus === 'completed' && TranscriptionText) {
      await voiceAnalyticsService.processCallTranscription(CallSid, TranscriptionText);
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Twilio transcription webhook error', {
      error: error instanceof Error ? error.message : String(error),
      body: req.body,
    });

    res.status(500).send('Internal Server Error');
  }
}));

/**
 * IVR interaction webhook
 * POST /webhooks/twilio/ivr
 */
router.post('/twilio/ivr', asyncHandler(async (req: Request, res: Response) => {
  try {
    const {
      CallSid,
      From,
      To,
      Digits,
      SpeechResult,
      Confidence,
    } = req.body;

    logger.info('Twilio IVR webhook received', {
      callSid: CallSid,
      from: From,
      to: To,
      digits: Digits,
      speechResult: SpeechResult,
      confidence: Confidence,
    });

    // Process IVR interaction
    const twiml = await ivrService.processInteraction({
      callSid: CallSid,
      from: From,
      to: To,
      input: Digits || SpeechResult,
      inputType: Digits ? 'dtmf' : 'speech',
      confidence: Confidence ? parseFloat(Confidence) : undefined,
    });

    res.type('text/xml');
    res.send(twiml);
  } catch (error) {
    logger.error('Twilio IVR webhook error', {
      error: error instanceof Error ? error.message : String(error),
      body: req.body,
    });

    // Return fallback TwiML
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>I'm sorry, there was an error processing your request. Please try again later.</Say>
  <Hangup/>
</Response>`;

    res.type('text/xml');
    res.send(fallbackTwiml);
  }
}));

/**
 * Call queue webhook
 * POST /webhooks/twilio/queue
 */
router.post('/twilio/queue', asyncHandler(async (req: Request, res: Response) => {
  try {
    const {
      CallSid,
      QueueResult,
      QueueTime,
      QueueSid,
    } = req.body;

    logger.info('Twilio queue webhook received', {
      callSid: CallSid,
      queueResult: QueueResult,
      queueTime: QueueTime,
      queueSid: QueueSid,
    });

    // Handle queue events
    const twiml = await callHandlingService.handleQueueEvent({
      callSid: CallSid,
      queueResult: QueueResult,
      queueTime: QueueTime ? parseInt(QueueTime) : undefined,
      queueSid: QueueSid,
    });

    res.type('text/xml');
    res.send(twiml);
  } catch (error) {
    logger.error('Twilio queue webhook error', {
      error: error instanceof Error ? error.message : String(error),
      body: req.body,
    });

    res.status(500).send('Internal Server Error');
  }
}));

/**
 * Conference webhook
 * POST /webhooks/twilio/conference
 */
router.post('/twilio/conference', asyncHandler(async (req: Request, res: Response) => {
  try {
    const {
      ConferenceSid,
      StatusCallbackEvent,
      CallSid,
      Muted,
      Hold,
    } = req.body;

    logger.info('Twilio conference webhook received', {
      conferenceSid: ConferenceSid,
      event: StatusCallbackEvent,
      callSid: CallSid,
      muted: Muted,
      hold: Hold,
    });

    // Handle conference events
    await callHandlingService.handleConferenceEvent({
      conferenceSid: ConferenceSid,
      event: StatusCallbackEvent,
      callSid: CallSid,
      muted: Muted === 'true',
      hold: Hold === 'true',
    });

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Twilio conference webhook error', {
      error: error instanceof Error ? error.message : String(error),
      body: req.body,
    });

    res.status(500).send('Internal Server Error');
  }
}));

/**
 * Generic webhook health check
 * GET /webhooks/health
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'Voice Service Webhooks',
    timestamp: new Date().toISOString(),
    endpoints: [
      '/webhooks/twilio/voice',
      '/webhooks/twilio/status',
      '/webhooks/twilio/recording',
      '/webhooks/twilio/transcription',
      '/webhooks/twilio/ivr',
      '/webhooks/twilio/queue',
      '/webhooks/twilio/conference',
    ],
  });
});

export default router;
