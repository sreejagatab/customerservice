/**
 * Call Management Routes
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { callHandlingService } from '@/services/call-handling-service';
import { voiceAnalyticsService } from '@/services/voice-analytics-service';
import { logger } from '@/utils/logger';
import { asyncHandler } from '@/utils/async-handler';

const router = Router();

/**
 * Get calls
 * GET /api/v1/calls
 */
router.get('/', [
  query('organizationId').isString().notEmpty().withMessage('Organization ID is required'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['initiated', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer']).withMessage('Invalid call status'),
  query('direction').optional().isIn(['inbound', 'outbound']).withMessage('Invalid call direction'),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        details: errors.array(),
      },
    });
  }

  try {
    const { organizationId, page = 1, limit = 20, status, direction } = req.query;

    const calls = await callHandlingService.getCalls({
      organizationId: organizationId as string,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      status: status as string,
      direction: direction as string,
    });

    res.json({
      success: true,
      data: calls,
    });
  } catch (error) {
    logger.error('Failed to get calls', {
      error: error instanceof Error ? error.message : String(error),
      requestId: req.headers['x-request-id'],
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'CALLS_FETCH_FAILED',
        message: 'Failed to fetch calls',
      },
    });
  }
}));

/**
 * Get call by ID
 * GET /api/v1/calls/:id
 */
router.get('/:id', [
  param('id').isString().notEmpty().withMessage('Call ID is required'),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid call ID',
        details: errors.array(),
      },
    });
  }

  try {
    const { id } = req.params;

    const call = await callHandlingService.getCall(id);

    if (!call) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CALL_NOT_FOUND',
          message: 'Call not found',
        },
      });
    }

    res.json({
      success: true,
      data: call,
    });
  } catch (error) {
    logger.error('Failed to get call', {
      callId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'CALL_FETCH_FAILED',
        message: 'Failed to fetch call',
      },
    });
  }
}));

/**
 * Initiate outbound call
 * POST /api/v1/calls
 */
router.post('/', [
  body('organizationId').isString().notEmpty().withMessage('Organization ID is required'),
  body('to').isString().notEmpty().withMessage('Destination phone number is required'),
  body('from').optional().isString().withMessage('Source phone number must be a string'),
  body('agentId').optional().isString().withMessage('Agent ID must be a string'),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: errors.array(),
      },
    });
  }

  try {
    const { organizationId, to, from, agentId } = req.body;

    const call = await callHandlingService.initiateCall({
      organizationId,
      to,
      from,
      agentId,
    });

    res.status(201).json({
      success: true,
      data: call,
    });
  } catch (error) {
    logger.error('Failed to initiate call', {
      error: error instanceof Error ? error.message : String(error),
      requestId: req.headers['x-request-id'],
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'CALL_INITIATE_FAILED',
        message: 'Failed to initiate call',
      },
    });
  }
}));

/**
 * End call
 * POST /api/v1/calls/:id/end
 */
router.post('/:id/end', [
  param('id').isString().notEmpty().withMessage('Call ID is required'),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid call ID',
        details: errors.array(),
      },
    });
  }

  try {
    const { id } = req.params;

    const success = await callHandlingService.endCall(id);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CALL_NOT_FOUND',
          message: 'Call not found or already ended',
        },
      });
    }

    res.json({
      success: true,
      message: 'Call ended successfully',
    });
  } catch (error) {
    logger.error('Failed to end call', {
      callId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'CALL_END_FAILED',
        message: 'Failed to end call',
      },
    });
  }
}));

/**
 * Transfer call
 * POST /api/v1/calls/:id/transfer
 */
router.post('/:id/transfer', [
  param('id').isString().notEmpty().withMessage('Call ID is required'),
  body('to').isString().notEmpty().withMessage('Transfer destination is required'),
  body('type').optional().isIn(['agent', 'queue', 'external']).withMessage('Invalid transfer type'),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: errors.array(),
      },
    });
  }

  try {
    const { id } = req.params;
    const { to, type = 'agent' } = req.body;

    const success = await callHandlingService.transferCall(id, to, type);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CALL_TRANSFER_FAILED',
          message: 'Call transfer failed',
        },
      });
    }

    res.json({
      success: true,
      message: 'Call transferred successfully',
    });
  } catch (error) {
    logger.error('Failed to transfer call', {
      callId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'CALL_TRANSFER_FAILED',
        message: 'Failed to transfer call',
      },
    });
  }
}));

/**
 * Get call recording
 * GET /api/v1/calls/:id/recording
 */
router.get('/:id/recording', [
  param('id').isString().notEmpty().withMessage('Call ID is required'),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid call ID',
        details: errors.array(),
      },
    });
  }

  try {
    const { id } = req.params;

    const recording = await callHandlingService.getCallRecording(id);

    if (!recording) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RECORDING_NOT_FOUND',
          message: 'Call recording not found',
        },
      });
    }

    res.json({
      success: true,
      data: recording,
    });
  } catch (error) {
    logger.error('Failed to get call recording', {
      callId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'RECORDING_FETCH_FAILED',
        message: 'Failed to fetch call recording',
      },
    });
  }
}));

/**
 * Get call transcription
 * GET /api/v1/calls/:id/transcription
 */
router.get('/:id/transcription', [
  param('id').isString().notEmpty().withMessage('Call ID is required'),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid call ID',
        details: errors.array(),
      },
    });
  }

  try {
    const { id } = req.params;

    const transcription = await callHandlingService.getCallTranscription(id);

    if (!transcription) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TRANSCRIPTION_NOT_FOUND',
          message: 'Call transcription not found',
        },
      });
    }

    res.json({
      success: true,
      data: transcription,
    });
  } catch (error) {
    logger.error('Failed to get call transcription', {
      callId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'TRANSCRIPTION_FETCH_FAILED',
        message: 'Failed to fetch call transcription',
      },
    });
  }
}));

export default router;
