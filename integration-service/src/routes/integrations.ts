/**
 * Integration management routes
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';
import { 
  validateBody, 
  validateParams, 
  validateQuery,
  integrationSchemas,
  commonSchemas,
  validateUuidParam 
} from '../middleware/validation';
import { integrationRepo } from '../services/database';
import { integrationManager } from '../services/integration-manager';
import { queueService, JobType } from '../services/queue';
import { integrationLogger } from '../utils/logger';

const router = Router();

// Get all integrations for the organization
router.get('/',
  validateQuery(integrationSchemas.integrationFilters),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { type, provider, status, search, page = 1, limit = 20 } = req.query as any;
    const offset = (page - 1) * limit;

    const result = await integrationRepo.getIntegrations(req.organizationId!, {
      type,
      provider,
      status,
      search,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: {
        integrations: result.rows,
        pagination: {
          page,
          limit,
          total: result.rowCount || 0,
          pages: Math.ceil((result.rowCount || 0) / limit),
        },
      },
    });
  })
);

// Get a specific integration
router.get('/:id',
  validateUuidParam,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    
    const result = await integrationRepo.getIntegration(id, req.organizationId!);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Integration not found',
      });
    }

    // Remove sensitive credentials from response
    const integration = result.rows[0];
    delete integration.credentials;

    res.json({
      success: true,
      data: integration,
    });
  })
);

// Create a new integration
router.post('/',
  validateBody(integrationSchemas.createIntegration),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const integrationData = {
      ...req.body,
      organizationId: req.organizationId!,
    };

    // Create in database
    const result = await integrationRepo.createIntegration(integrationData);
    const integration = result.rows[0];

    // Initialize the integration connector
    try {
      await integrationManager.createIntegration({
        id: integration.id,
        organizationId: integration.organization_id,
        name: integration.name,
        type: integration.type,
        provider: integration.provider,
        config: integration.config,
        credentials: req.body.credentials || {},
        webhookUrl: integration.webhook_url,
      });

      integrationLogger.info('Integration created successfully', {
        integrationId: integration.id,
        provider: integration.provider,
        organizationId: req.organizationId,
      });

      res.status(201).json({
        success: true,
        data: {
          id: integration.id,
          name: integration.name,
          type: integration.type,
          provider: integration.provider,
          status: integration.status,
          createdAt: integration.created_at,
        },
      });
    } catch (error: any) {
      // If connector initialization fails, update status in database
      await integrationRepo.updateIntegration(integration.id, req.organizationId!, {
        status: 'error',
        lastError: error.message,
        lastErrorAt: new Date(),
      });

      throw error;
    }
  })
);

// Update an integration
router.put('/:id',
  validateUuidParam,
  validateBody(integrationSchemas.updateIntegration),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const updates = req.body;

    // Update in database
    const result = await integrationRepo.updateIntegration(id, req.organizationId!, updates);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Integration not found',
      });
    }

    // Update the integration connector if it exists
    try {
      await integrationManager.updateIntegration(id, updates);
    } catch (error) {
      integrationLogger.warn('Failed to update integration connector:', error);
      // Continue with response even if connector update fails
    }

    const integration = result.rows[0];
    
    res.json({
      success: true,
      data: {
        id: integration.id,
        name: integration.name,
        type: integration.type,
        provider: integration.provider,
        status: integration.status,
        updatedAt: integration.updated_at,
      },
    });
  })
);

// Delete an integration
router.delete('/:id',
  validateUuidParam,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;

    // Delete from integration manager first
    try {
      await integrationManager.deleteIntegration(id);
    } catch (error) {
      integrationLogger.warn('Failed to delete integration connector:', error);
      // Continue with database deletion even if connector deletion fails
    }

    // Delete from database
    const result = await integrationRepo.deleteIntegration(id, req.organizationId!);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Integration not found',
      });
    }

    res.json({
      success: true,
      message: 'Integration deleted successfully',
    });
  })
);

// Test an integration
router.post('/:id/test',
  validateUuidParam,
  validateBody(integrationSchemas.testIntegration),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { testType } = req.body;

    // Check if integration exists
    const integrationResult = await integrationRepo.getIntegration(id, req.organizationId!);
    if (integrationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Integration not found',
      });
    }

    try {
      let testResult;

      switch (testType) {
        case 'connection':
          testResult = await integrationManager.testIntegration(id);
          break;
        
        case 'auth':
          const connector = integrationManager.getIntegration(id);
          if (!connector) {
            throw new Error('Integration connector not found');
          }
          testResult = await connector.validateAuth(integrationResult.rows[0].credentials);
          break;
        
        default:
          testResult = await integrationManager.testIntegration(id);
      }

      res.json({
        success: true,
        data: {
          testType,
          result: testResult,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: `Integration test failed: ${error.message}`,
        testType,
        timestamp: new Date().toISOString(),
      });
    }
  })
);

// Sync an integration
router.post('/:id/sync',
  validateUuidParam,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;

    // Check if integration exists
    const integrationResult = await integrationRepo.getIntegration(id, req.organizationId!);
    if (integrationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Integration not found',
      });
    }

    const integration = integrationResult.rows[0];

    // Queue sync job
    const job = await queueService.addSyncJob({
      integrationId: id,
      organizationId: req.organizationId!,
      syncType: 'incremental' as const,
      lastSyncAt: integration.last_sync_at,
    });

    res.json({
      success: true,
      data: {
        jobId: job.id,
        message: 'Sync job queued successfully',
        estimatedDuration: '1-5 minutes',
      },
    });
  })
);

// Get integration messages
router.get('/:id/messages',
  validateUuidParam,
  validateQuery(commonSchemas.pagination),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { limit = 20, since, before } = req.query as any;

    // Check if integration exists
    const integrationResult = await integrationRepo.getIntegration(id, req.organizationId!);
    if (integrationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Integration not found',
      });
    }

    try {
      const connector = integrationManager.getIntegration(id);
      if (!connector || !connector.fetchMessages) {
        return res.status(400).json({
          success: false,
          error: 'Integration does not support message fetching',
        });
      }

      const messages = await connector.fetchMessages({
        limit,
        since: since ? new Date(since) : undefined,
        before: before ? new Date(before) : undefined,
      });

      res.json({
        success: true,
        data: {
          messages,
          count: messages.length,
        },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: `Failed to fetch messages: ${error.message}`,
      });
    }
  })
);

// Send a message through an integration
router.post('/:id/messages',
  validateUuidParam,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const messageData = req.body;

    // Check if integration exists
    const integrationResult = await integrationRepo.getIntegration(id, req.organizationId!);
    if (integrationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Integration not found',
      });
    }

    // Queue email sending job
    const job = await queueService.addEmailJob({
      integrationId: id,
      organizationId: req.organizationId!,
      ...messageData,
    });

    res.json({
      success: true,
      data: {
        jobId: job.id,
        message: 'Message queued for sending',
      },
    });
  })
);

export default router;
