/**
 * White-Label Branding Routes
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { logger } from '@universal-ai-cs/shared';

const router = Router();

/**
 * Get partner branding configuration
 * GET /api/v1/branding/:partnerId
 */
router.get('/:partnerId',
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

      // Mock branding data - in production, fetch from database
      const branding = {
        partnerId,
        companyInfo: {
          name: 'Partner Company',
          logo: 'https://example.com/logo.png',
          website: 'https://partner.com',
          supportEmail: 'support@partner.com',
        },
        theme: {
          primaryColor: '#007bff',
          secondaryColor: '#6c757d',
          backgroundColor: '#ffffff',
          textColor: '#212529',
          fontFamily: 'Inter, sans-serif',
        },
        customization: {
          hideOriginalBranding: true,
          customPoweredBy: 'Powered by Partner Company',
          customDomain: 'app.partner.com',
          customEmailDomain: 'partner.com',
        },
        assets: {
          favicon: 'https://example.com/favicon.ico',
          loginBackground: 'https://example.com/login-bg.jpg',
          emailHeader: 'https://example.com/email-header.png',
        },
      };

      res.json({
        success: true,
        data: branding,
      });
    } catch (error) {
      logger.error('Error getting partner branding', {
        partnerId: req.params.partnerId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get partner branding',
      });
    }
  }
);

/**
 * Update partner branding configuration
 * PUT /api/v1/branding/:partnerId
 */
router.put('/:partnerId',
  param('partnerId').isUUID().withMessage('Invalid partner ID'),
  body('companyInfo.name').optional().isString().withMessage('Company name must be a string'),
  body('companyInfo.logo').optional().isURL().withMessage('Logo must be a valid URL'),
  body('theme.primaryColor').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Primary color must be a valid hex color'),
  body('theme.secondaryColor').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Secondary color must be a valid hex color'),
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
      const brandingData = req.body;

      // Mock update - in production, update database
      const updatedBranding = {
        partnerId,
        ...brandingData,
        updatedAt: new Date().toISOString(),
      };

      logger.info('Partner branding updated', {
        partnerId,
        updatedFields: Object.keys(brandingData),
      });

      res.json({
        success: true,
        data: updatedBranding,
        message: 'Branding configuration updated successfully',
      });
    } catch (error) {
      logger.error('Error updating partner branding', {
        partnerId: req.params.partnerId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        success: false,
        error: 'Failed to update partner branding',
      });
    }
  }
);

/**
 * Upload branding asset
 * POST /api/v1/branding/:partnerId/assets
 */
router.post('/:partnerId/assets',
  param('partnerId').isUUID().withMessage('Invalid partner ID'),
  body('assetType').isIn(['logo', 'favicon', 'loginBackground', 'emailHeader']).withMessage('Invalid asset type'),
  body('assetUrl').isURL().withMessage('Asset URL must be valid'),
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
      const { assetType, assetUrl } = req.body;

      // Mock asset upload - in production, handle file upload and storage
      const asset = {
        id: `asset_${Date.now()}`,
        partnerId,
        type: assetType,
        url: assetUrl,
        uploadedAt: new Date().toISOString(),
      };

      logger.info('Branding asset uploaded', {
        partnerId,
        assetType,
        assetId: asset.id,
      });

      res.json({
        success: true,
        data: asset,
        message: 'Asset uploaded successfully',
      });
    } catch (error) {
      logger.error('Error uploading branding asset', {
        partnerId: req.params.partnerId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        success: false,
        error: 'Failed to upload asset',
      });
    }
  }
);

/**
 * Preview branding configuration
 * GET /api/v1/branding/:partnerId/preview
 */
router.get('/:partnerId/preview',
  param('partnerId').isUUID().withMessage('Invalid partner ID'),
  query('theme').optional().isIn(['light', 'dark']).withMessage('Invalid theme'),
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
      const { theme = 'light' } = req.query;

      // Mock preview generation - in production, generate actual preview
      const preview = {
        partnerId,
        theme,
        previewUrl: `https://preview.example.com/${partnerId}?theme=${theme}`,
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      };

      res.json({
        success: true,
        data: preview,
      });
    } catch (error) {
      logger.error('Error generating branding preview', {
        partnerId: req.params.partnerId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        success: false,
        error: 'Failed to generate preview',
      });
    }
  }
);

/**
 * Reset branding to defaults
 * POST /api/v1/branding/:partnerId/reset
 */
router.post('/:partnerId/reset',
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

      // Mock reset - in production, reset to default branding
      const defaultBranding = {
        partnerId,
        companyInfo: {
          name: '',
          logo: '',
          website: '',
          supportEmail: '',
        },
        theme: {
          primaryColor: '#007bff',
          secondaryColor: '#6c757d',
          backgroundColor: '#ffffff',
          textColor: '#212529',
          fontFamily: 'Inter, sans-serif',
        },
        customization: {
          hideOriginalBranding: false,
          customPoweredBy: '',
          customDomain: '',
          customEmailDomain: '',
        },
        resetAt: new Date().toISOString(),
      };

      logger.info('Partner branding reset to defaults', { partnerId });

      res.json({
        success: true,
        data: defaultBranding,
        message: 'Branding reset to defaults successfully',
      });
    } catch (error) {
      logger.error('Error resetting partner branding', {
        partnerId: req.params.partnerId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        success: false,
        error: 'Failed to reset branding',
      });
    }
  }
);

export default router;
