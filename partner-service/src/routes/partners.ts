/**
 * Partner Management Routes
 * Handles CRUD operations for partners and partner relationships
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { PartnerManagementService } from '../../../shared/src/services/partner-management';
import { Logger } from '../../../shared/src/utils/logger';

const logger = new Logger('PartnerRoutes');

export default function createPartnerRoutes(partnerService: PartnerManagementService): Router {
  const router = Router();

  /**
   * @swagger
   * /api/v1/partners:
   *   post:
   *     summary: Create a new partner
   *     tags: [Partners]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *               - email
   *               - contactPerson
   *               - partnerType
   *             properties:
   *               name:
   *                 type: string
   *               email:
   *                 type: string
   *                 format: email
   *               contactPerson:
   *                 type: string
   *               phone:
   *                 type: string
   *               partnerType:
   *                 type: string
   *                 enum: [reseller, white_label, integration]
   *               commissionRate:
   *                 type: number
   *                 minimum: 0
   *                 maximum: 1
   *     responses:
   *       201:
   *         description: Partner created successfully
   *       400:
   *         description: Invalid input data
   *       409:
   *         description: Partner already exists
   */
  router.post('/',
    [
      body('name').isLength({ min: 2, max: 255 }).withMessage('Name must be between 2 and 255 characters'),
      body('email').isEmail().withMessage('Valid email is required'),
      body('contactPerson').isLength({ min: 2, max: 255 }).withMessage('Contact person name is required'),
      body('phone').optional().isMobilePhone('any').withMessage('Valid phone number required'),
      body('partnerType').isIn(['reseller', 'white_label', 'integration']).withMessage('Invalid partner type'),
      body('commissionRate').optional().isFloat({ min: 0, max: 1 }).withMessage('Commission rate must be between 0 and 1'),
      body('supportTier').optional().isIn(['basic', 'standard', 'premium', 'enterprise']).withMessage('Invalid support tier')
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
          });
        }

        const partner = await partnerService.createPartner(req.body);
        
        logger.info(`Partner created: ${partner.id}`, {
          organizationId: req.organizationId,
          partnerId: partner.id,
          partnerName: partner.name
        });

        res.status(201).json({
          success: true,
          data: partner
        });
      } catch (error) {
        logger.error('Error creating partner:', error);
        res.status(500).json({
          error: 'Failed to create partner',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * @swagger
   * /api/v1/partners:
   *   get:
   *     summary: List partners with pagination and filtering
   *     tags: [Partners]
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Page number
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *         description: Number of items per page
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [pending, active, suspended, terminated]
   *         description: Filter by partner status
   *       - in: query
   *         name: partnerType
   *         schema:
   *           type: string
   *           enum: [reseller, white_label, integration]
   *         description: Filter by partner type
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *         description: Search in partner name and email
   *     responses:
   *       200:
   *         description: Partners retrieved successfully
   */
  router.get('/',
    [
      query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
      query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
      query('status').optional().isIn(['pending', 'active', 'suspended', 'terminated']).withMessage('Invalid status'),
      query('partnerType').optional().isIn(['reseller', 'white_label', 'integration']).withMessage('Invalid partner type')
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
          });
        }

        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const filters = {
          status: req.query.status,
          partnerType: req.query.partnerType,
          search: req.query.search
        };

        const result = await partnerService.listPartners(page, limit, filters);

        res.json({
          success: true,
          data: result.partners,
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            pages: Math.ceil(result.total / result.limit)
          }
        });
      } catch (error) {
        logger.error('Error listing partners:', error);
        res.status(500).json({
          error: 'Failed to list partners',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * @swagger
   * /api/v1/partners/{partnerId}:
   *   get:
   *     summary: Get partner by ID
   *     tags: [Partners]
   *     parameters:
   *       - in: path
   *         name: partnerId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Partner retrieved successfully
   *       404:
   *         description: Partner not found
   */
  router.get('/:partnerId',
    [
      param('partnerId').isUUID().withMessage('Valid partner ID is required')
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
          });
        }

        const partner = await partnerService.getPartner(req.params.partnerId);
        
        if (!partner) {
          return res.status(404).json({
            error: 'Partner not found',
            message: 'The specified partner does not exist'
          });
        }

        res.json({
          success: true,
          data: partner
        });
      } catch (error) {
        logger.error('Error getting partner:', error);
        res.status(500).json({
          error: 'Failed to get partner',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * @swagger
   * /api/v1/partners/{partnerId}:
   *   put:
   *     summary: Update partner
   *     tags: [Partners]
   *     parameters:
   *       - in: path
   *         name: partnerId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               email:
   *                 type: string
   *                 format: email
   *               contactPerson:
   *                 type: string
   *               phone:
   *                 type: string
   *               status:
   *                 type: string
   *                 enum: [pending, active, suspended, terminated]
   *               commissionRate:
   *                 type: number
   *                 minimum: 0
   *                 maximum: 1
   *     responses:
   *       200:
   *         description: Partner updated successfully
   *       404:
   *         description: Partner not found
   */
  router.put('/:partnerId',
    [
      param('partnerId').isUUID().withMessage('Valid partner ID is required'),
      body('name').optional().isLength({ min: 2, max: 255 }).withMessage('Name must be between 2 and 255 characters'),
      body('email').optional().isEmail().withMessage('Valid email is required'),
      body('contactPerson').optional().isLength({ min: 2, max: 255 }).withMessage('Contact person name is required'),
      body('phone').optional().isMobilePhone('any').withMessage('Valid phone number required'),
      body('status').optional().isIn(['pending', 'active', 'suspended', 'terminated']).withMessage('Invalid status'),
      body('commissionRate').optional().isFloat({ min: 0, max: 1 }).withMessage('Commission rate must be between 0 and 1')
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
          });
        }

        const partner = await partnerService.updatePartner(req.params.partnerId, req.body);
        
        logger.info(`Partner updated: ${partner.id}`, {
          organizationId: req.organizationId,
          partnerId: partner.id,
          changes: Object.keys(req.body)
        });

        res.json({
          success: true,
          data: partner
        });
      } catch (error) {
        logger.error('Error updating partner:', error);
        
        if (error instanceof Error && error.message === 'Partner not found') {
          return res.status(404).json({
            error: 'Partner not found',
            message: 'The specified partner does not exist'
          });
        }

        res.status(500).json({
          error: 'Failed to update partner',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * @swagger
   * /api/v1/partners/{partnerId}/organizations:
   *   post:
   *     summary: Associate organization with partner
   *     tags: [Partners]
   *     parameters:
   *       - in: path
   *         name: partnerId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - organizationId
   *               - relationshipType
   *             properties:
   *               organizationId:
   *                 type: string
   *                 format: uuid
   *               relationshipType:
   *                 type: string
   *                 enum: [managed, referred, white_label]
   *               commissionOverride:
   *                 type: number
   *                 minimum: 0
   *                 maximum: 1
   *               supportLevel:
   *                 type: string
   *                 enum: [basic, standard, premium, enterprise]
   *     responses:
   *       201:
   *         description: Organization associated successfully
   */
  router.post('/:partnerId/organizations',
    [
      param('partnerId').isUUID().withMessage('Valid partner ID is required'),
      body('organizationId').isUUID().withMessage('Valid organization ID is required'),
      body('relationshipType').isIn(['managed', 'referred', 'white_label']).withMessage('Invalid relationship type'),
      body('commissionOverride').optional().isFloat({ min: 0, max: 1 }).withMessage('Commission override must be between 0 and 1'),
      body('supportLevel').optional().isIn(['basic', 'standard', 'premium', 'enterprise']).withMessage('Invalid support level')
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
          });
        }

        const { organizationId, relationshipType, commissionOverride, supportLevel } = req.body;
        
        const association = await partnerService.associateOrganization(
          req.params.partnerId,
          organizationId,
          relationshipType,
          {
            commissionOverride,
            supportLevel
          }
        );

        logger.info(`Organization associated with partner`, {
          partnerId: req.params.partnerId,
          organizationId,
          relationshipType
        });

        res.status(201).json({
          success: true,
          data: association
        });
      } catch (error) {
        logger.error('Error associating organization with partner:', error);
        res.status(500).json({
          error: 'Failed to associate organization',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * @swagger
   * /api/v1/partners/{partnerId}/dashboard:
   *   get:
   *     summary: Get partner dashboard data
   *     tags: [Partners]
   *     parameters:
   *       - in: path
   *         name: partnerId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Dashboard data retrieved successfully
   */
  router.get('/:partnerId/dashboard',
    [
      param('partnerId').isUUID().withMessage('Valid partner ID is required')
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
          });
        }

        const dashboardData = await partnerService.getPartnerDashboard(req.params.partnerId);

        res.json({
          success: true,
          data: dashboardData
        });
      } catch (error) {
        logger.error('Error getting partner dashboard:', error);
        res.status(500).json({
          error: 'Failed to get dashboard data',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  return router;
}
