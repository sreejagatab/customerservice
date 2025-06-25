/**
 * Partner Onboarding Routes
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { logger } from '@universal-ai-cs/shared';

const router = Router();

/**
 * Get onboarding status
 * GET /api/v1/onboarding/:partnerId/status
 */
router.get('/:partnerId/status',
  param('partnerId').isUUID().withMessage('Invalid partner ID'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { partnerId } = req.params;

      // Mock onboarding status - in production, fetch from database
      const onboardingStatus = {
        partnerId,
        overallProgress: 75,
        currentStep: 'integration_setup',
        completedSteps: [
          'profile_setup',
          'agreement_signing',
          'payment_setup',
        ],
        pendingSteps: [
          'integration_setup',
          'testing',
          'go_live',
        ],
        steps: {
          profile_setup: {
            name: 'Profile Setup',
            description: 'Complete your partner profile information',
            status: 'completed',
            completedAt: '2024-01-15T10:00:00Z',
            progress: 100,
            requirements: [
              { name: 'Company Information', completed: true },
              { name: 'Contact Details', completed: true },
              { name: 'Business Verification', completed: true },
            ],
          },
          agreement_signing: {
            name: 'Agreement Signing',
            description: 'Review and sign the partner agreement',
            status: 'completed',
            completedAt: '2024-01-16T14:30:00Z',
            progress: 100,
            requirements: [
              { name: 'Partner Agreement Review', completed: true },
              { name: 'Digital Signature', completed: true },
              { name: 'Terms Acceptance', completed: true },
            ],
          },
          payment_setup: {
            name: 'Payment Setup',
            description: 'Configure payment and billing information',
            status: 'completed',
            completedAt: '2024-01-17T09:15:00Z',
            progress: 100,
            requirements: [
              { name: 'Bank Account Details', completed: true },
              { name: 'Tax Information', completed: true },
              { name: 'Payment Schedule', completed: true },
            ],
          },
          integration_setup: {
            name: 'Integration Setup',
            description: 'Set up API integration and configuration',
            status: 'in_progress',
            progress: 60,
            requirements: [
              { name: 'API Keys Generated', completed: true },
              { name: 'Webhook Configuration', completed: true },
              { name: 'Test Integration', completed: false },
              { name: 'Documentation Review', completed: false },
            ],
          },
          testing: {
            name: 'Testing',
            description: 'Test your integration in sandbox environment',
            status: 'pending',
            progress: 0,
            requirements: [
              { name: 'Sandbox Testing', completed: false },
              { name: 'Error Handling', completed: false },
              { name: 'Performance Testing', completed: false },
            ],
          },
          go_live: {
            name: 'Go Live',
            description: 'Launch your integration in production',
            status: 'pending',
            progress: 0,
            requirements: [
              { name: 'Production Deployment', completed: false },
              { name: 'Monitoring Setup', completed: false },
              { name: 'Support Handoff', completed: false },
            ],
          },
        },
        estimatedCompletion: '2024-02-01T00:00:00Z',
        nextActions: [
          'Complete test integration',
          'Review API documentation',
          'Schedule testing session',
        ],
      };

      res.json({
        success: true,
        data: onboardingStatus,
      });
    } catch (error) {
      logger.error('Error getting onboarding status', {
        partnerId: req.params.partnerId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get onboarding status',
      });
    }
  }
);

/**
 * Update onboarding step
 * PUT /api/v1/onboarding/:partnerId/steps/:stepId
 */
router.put('/:partnerId/steps/:stepId',
  param('partnerId').isUUID().withMessage('Invalid partner ID'),
  param('stepId').isString().withMessage('Step ID is required'),
  body('status').optional().isIn(['pending', 'in_progress', 'completed', 'failed']).withMessage('Invalid status'),
  body('progress').optional().isInt({ min: 0, max: 100 }).withMessage('Progress must be between 0 and 100'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { partnerId, stepId } = req.params;
      const { status, progress, notes } = req.body;

      // Mock step update - in production, update database
      const updatedStep = {
        stepId,
        partnerId,
        status,
        progress,
        notes,
        updatedAt: new Date().toISOString(),
      };

      logger.info('Onboarding step updated', {
        partnerId,
        stepId,
        status,
        progress,
      });

      res.json({
        success: true,
        data: updatedStep,
        message: 'Onboarding step updated successfully',
      });
    } catch (error) {
      logger.error('Error updating onboarding step', {
        partnerId: req.params.partnerId,
        stepId: req.params.stepId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        success: false,
        error: 'Failed to update onboarding step',
      });
    }
  }
);

/**
 * Get onboarding checklist
 * GET /api/v1/onboarding/:partnerId/checklist
 */
router.get('/:partnerId/checklist',
  param('partnerId').isUUID().withMessage('Invalid partner ID'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { partnerId } = req.params;

      // Mock checklist - in production, fetch from database
      const checklist = {
        partnerId,
        categories: [
          {
            name: 'Business Setup',
            items: [
              { id: 'business_info', name: 'Business Information', completed: true, required: true },
              { id: 'legal_docs', name: 'Legal Documentation', completed: true, required: true },
              { id: 'insurance', name: 'Insurance Verification', completed: false, required: false },
            ],
          },
          {
            name: 'Technical Setup',
            items: [
              { id: 'api_access', name: 'API Access Setup', completed: true, required: true },
              { id: 'webhook_config', name: 'Webhook Configuration', completed: true, required: true },
              { id: 'ssl_cert', name: 'SSL Certificate', completed: false, required: true },
              { id: 'monitoring', name: 'Monitoring Setup', completed: false, required: false },
            ],
          },
          {
            name: 'Compliance',
            items: [
              { id: 'data_privacy', name: 'Data Privacy Agreement', completed: true, required: true },
              { id: 'security_review', name: 'Security Review', completed: false, required: true },
              { id: 'gdpr_compliance', name: 'GDPR Compliance', completed: false, required: true },
            ],
          },
          {
            name: 'Marketing',
            items: [
              { id: 'branding_assets', name: 'Branding Assets', completed: false, required: false },
              { id: 'marketing_materials', name: 'Marketing Materials', completed: false, required: false },
              { id: 'case_studies', name: 'Case Studies', completed: false, required: false },
            ],
          },
        ],
        summary: {
          totalItems: 12,
          completedItems: 5,
          requiredItems: 8,
          completedRequiredItems: 4,
          completionPercentage: 41.7,
          requiredCompletionPercentage: 50.0,
        },
      };

      res.json({
        success: true,
        data: checklist,
      });
    } catch (error) {
      logger.error('Error getting onboarding checklist', {
        partnerId: req.params.partnerId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get onboarding checklist',
      });
    }
  }
);

/**
 * Schedule onboarding session
 * POST /api/v1/onboarding/:partnerId/sessions
 */
router.post('/:partnerId/sessions',
  param('partnerId').isUUID().withMessage('Invalid partner ID'),
  body('type').isIn(['kickoff', 'technical', 'training', 'go_live']).withMessage('Invalid session type'),
  body('preferredDate').isISO8601().withMessage('Invalid preferred date'),
  body('timezone').isString().withMessage('Timezone is required'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { partnerId } = req.params;
      const { type, preferredDate, timezone, notes, attendees } = req.body;

      // Mock session scheduling - in production, integrate with calendar system
      const session = {
        id: `session_${Date.now()}`,
        partnerId,
        type,
        preferredDate,
        timezone,
        notes,
        attendees: attendees || [],
        status: 'scheduled',
        scheduledAt: new Date().toISOString(),
        meetingLink: `https://meet.example.com/partner-${partnerId}-${type}`,
        calendarInvite: `https://calendar.example.com/invite/${Date.now()}`,
      };

      logger.info('Onboarding session scheduled', {
        partnerId,
        sessionId: session.id,
        type,
        preferredDate,
      });

      res.json({
        success: true,
        data: session,
        message: 'Onboarding session scheduled successfully',
      });
    } catch (error) {
      logger.error('Error scheduling onboarding session', {
        partnerId: req.params.partnerId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        success: false,
        error: 'Failed to schedule onboarding session',
      });
    }
  }
);

export default router;
