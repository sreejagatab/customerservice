/**
 * Message Routes for Message Service
 * Handles message processing, retrieval, and management endpoints
 */

import { Router, Request, Response } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { asyncHandler, ValidationError, NotFoundError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { messageRepository, MessageFilters, PaginationOptions } from '@/repositories/message.repository';
import { messageProcessor, IncomingMessage } from '@/services/message-processor';
import { redis } from '@/services/redis';
import { rateLimitConfigs } from '@/middleware/rate-limit';

const router = Router();

// Validation middleware
const validateRequest = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', { errors: errors.array() });
  }
  next();
};

// GET /api/v1/messages - List messages with pagination and filtering
router.get('/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('conversationId').optional().isUUID().withMessage('Conversation ID must be a valid UUID'),
    query('direction').optional().isIn(['inbound', 'outbound']).withMessage('Direction must be inbound or outbound'),
    query('status').optional().isIn(['received', 'processing', 'processed', 'sent', 'delivered', 'read', 'failed', 'spam']).withMessage('Invalid status'),
    query('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO 8601 date'),
    query('endDate').optional().isISO8601().withMessage('End date must be a valid ISO 8601 date'),
  ],
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 20,
      conversationId,
      direction,
      status,
      startDate,
      endDate,
    } = req.query;

    // Build filters
    const filters: MessageFilters = {};
    if (conversationId) filters.conversationId = conversationId as string;
    if (direction) filters.direction = direction as 'inbound' | 'outbound';
    if (status) filters.status = status as string;
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);

    // Build pagination
    const pagination: PaginationOptions = {
      page: Number(page),
      limit: Number(limit),
      orderBy: 'created_at',
      orderDirection: 'DESC',
    };

    logger.info('Listing messages', { filters, pagination });

    // Get messages from repository
    const result = await messageRepository.getMessages(filters, pagination);

    res.json({
      success: true,
      data: {
        messages: result.data,
        pagination: result.pagination,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/v1/messages/:id - Get specific message by ID
router.get('/:id',
  [
    param('id').isUUID().withMessage('Message ID must be a valid UUID'),
  ],
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    logger.info('Getting message', { messageId: id });

    // Try cache first
    const cacheKey = `message:${id}`;
    let message = await redis.get(cacheKey);

    if (!message) {
      // Get from database
      message = await messageRepository.getMessageById(id);

      if (!message) {
        throw new NotFoundError('Message', id);
      }

      // Cache for future requests
      await redis.set(cacheKey, message, { ttl: 3600 });
    }

    res.json({
      success: true,
      data: {
        message,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/v1/messages - Create/send new message
router.post('/',
  rateLimitConfigs.messageCreation,
  [
    body('conversationId').isUUID().withMessage('Conversation ID must be a valid UUID'),
    body('content.text').notEmpty().withMessage('Message text content is required'),
    body('content.format').optional().isIn(['text', 'html', 'markdown']).withMessage('Invalid content format'),
    body('recipient.email').optional().isEmail().withMessage('Invalid recipient email'),
    body('recipient.phone').optional().isMobilePhone('any').withMessage('Invalid recipient phone number'),
    body('attachments').optional().isArray().withMessage('Attachments must be an array'),
    body('metadata').optional().isObject().withMessage('Metadata must be an object'),
  ],
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const messageData: IncomingMessage = {
      ...req.body,
      // Extract organization and integration from headers or auth context
      organizationId: req.headers['x-organization-id'] as string || 'default-org',
      integrationId: req.headers['x-integration-id'] as string || 'default-integration',
    };

    logger.info('Creating message', {
      conversationId: messageData.conversationId,
      direction: messageData.direction,
      senderType: messageData.sender.type,
    });

    // Process the incoming message
    const result = await messageProcessor.processIncomingMessage(messageData);

    if (result.status === 'failed') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MESSAGE_PROCESSING_FAILED',
          message: 'Failed to process message',
          details: result.errors,
        },
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json({
      success: true,
      data: {
        messageId: result.messageId,
        status: result.status,
        processingTime: result.processingTime,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// PUT /api/v1/messages/:id - Update message
router.put('/:id',
  [
    param('id').isUUID().withMessage('Message ID must be a valid UUID'),
    body('status').optional().isIn(['received', 'processing', 'processed', 'sent', 'delivered', 'read', 'failed', 'spam']).withMessage('Invalid status'),
    body('metadata').optional().isObject().withMessage('Metadata must be an object'),
  ],
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData = req.body;

    logger.info('Updating message', { messageId: id, updateData });

    // Check if message exists
    const existingMessage = await messageRepository.getMessageById(id);
    if (!existingMessage) {
      throw new NotFoundError('Message', id);
    }

    // Update message
    const updatedMessage = await messageRepository.updateMessage(id, updateData);

    // Update cache
    const cacheKey = `message:${id}`;
    await redis.set(cacheKey, updatedMessage, { ttl: 3600 });

    res.json({
      success: true,
      data: {
        message: updatedMessage,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// DELETE /api/v1/messages/:id - Delete message
router.delete('/:id',
  [
    param('id').isUUID().withMessage('Message ID must be a valid UUID'),
  ],
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    logger.info('Deleting message', { messageId: id });

    // Check if message exists
    const existingMessage = await messageRepository.getMessageById(id);
    if (!existingMessage) {
      throw new NotFoundError('Message', id);
    }

    // Delete message
    const deleted = await messageRepository.deleteMessage(id);

    if (!deleted) {
      throw new Error('Failed to delete message');
    }

    // Remove from cache
    const cacheKey = `message:${id}`;
    await redis.del(cacheKey);

    res.status(204).send();
  })
);

// POST /api/v1/messages/:id/process - Process message with AI
router.post('/:id/process',
  rateLimitConfigs.aiProcessing,
  [
    param('id').isUUID().withMessage('Message ID must be a valid UUID'),
    body('forceReprocess').optional().isBoolean().withMessage('Force reprocess must be a boolean'),
    body('skipAi').optional().isBoolean().withMessage('Skip AI must be a boolean'),
  ],
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { forceReprocess = false, skipAi = false } = req.body;

    logger.info('Processing message', { messageId: id, forceReprocess, skipAi });

    const startTime = Date.now();

    // Get message
    const message = await messageRepository.getMessageById(id);
    if (!message) {
      throw new NotFoundError('Message', id);
    }

    // Check if already processed and not forcing reprocess
    if (message.status === 'processed' && !forceReprocess) {
      return res.json({
        success: true,
        data: {
          message,
          processingTime: 0,
          aiClassification: message.aiClassification,
          aiResponse: message.aiResponse,
          note: 'Message already processed',
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Update status to processing
    await messageProcessor.updateMessageStatus(id, 'processing');

    // Process with AI if not skipped
    let aiClassification = null;
    let aiResponse = null;

    if (!skipAi && message.direction === 'inbound') {
      try {
        // Call AI service for classification
        const aiResult = await callAiService(message.content.text, {
          conversationId: message.conversationId,
          organizationId: message.metadata.organizationId,
        });

        aiClassification = aiResult.classification;
        aiResponse = aiResult.response;

        // Update message with AI results
        await messageRepository.updateMessage(id, {
          aiClassification,
          aiResponse,
        });
      } catch (aiError) {
        logger.error('AI processing failed', {
          messageId: id,
          error: aiError instanceof Error ? aiError.message : String(aiError),
        });
      }
    }

    // Update status to processed
    const updatedMessage = await messageProcessor.updateMessageStatus(id, 'processed');

    const processingTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        message: updatedMessage,
        processingTime,
        aiClassification,
        aiResponse,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/v1/messages/batch - Batch process messages
router.post('/batch',
  [
    body('messageIds').isArray({ min: 1, max: 100 }).withMessage('Message IDs must be an array with 1-100 items'),
    body('messageIds.*').isUUID().withMessage('Each message ID must be a valid UUID'),
    body('operation').isIn(['process', 'reprocess', 'delete', 'mark_as_read']).withMessage('Invalid batch operation'),
  ],
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const { messageIds, operation } = req.body;

    // TODO: Implement batch processing logic
    logger.info('Batch processing messages', { messageIds, operation });

    res.json({
      success: true,
      data: {
        processed: 0,
        failed: 0,
        results: [],
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/v1/messages/:id/history - Get message processing history
router.get('/:id/history',
  [
    param('id').isUUID().withMessage('Message ID must be a valid UUID'),
  ],
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // TODO: Implement message history retrieval logic
    logger.info('Getting message history', { messageId: id });

    res.json({
      success: true,
      data: {
        history: [],
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/v1/messages/search - Search messages
router.post('/search',
  rateLimitConfigs.search,
  [
    body('query').notEmpty().withMessage('Search query is required'),
    body('filters').optional().isObject().withMessage('Filters must be an object'),
    body('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    body('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  ],
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const { query, filters = {}, page = 1, limit = 20 } = req.body;

    logger.info('Searching messages', { query, filters, page, limit });

    const startTime = Date.now();

    // Build search filters
    const searchFilters: MessageFilters = {
      ...filters,
      organizationId: req.headers['x-organization-id'] as string,
    };

    // Build pagination
    const pagination: PaginationOptions = {
      page: Number(page),
      limit: Number(limit),
      orderBy: 'created_at',
      orderDirection: 'DESC',
    };

    // Perform search
    const result = await messageRepository.searchMessages(query, searchFilters, pagination);

    const searchTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        messages: result.data,
        pagination: result.pagination,
        searchTime,
        query,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// Helper function to call AI service
async function callAiService(text: string, context: any): Promise<{ classification: any; response: any }> {
  try {
    const axios = require('axios');
    const { config } = require('@/config');

    const response = await axios.post(`${config.services.ai.url}/api/v1/classify`, {
      text,
      context,
      options: {
        includeEntities: true,
        includeSentiment: true,
        includeTopics: true,
      },
    }, {
      headers: {
        'Authorization': `Bearer ${config.services.ai.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    return {
      classification: response.data.classification,
      response: response.data.response,
    };
  } catch (error) {
    logger.error('AI service call failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export default router;
