/**
 * Revenue Sharing Routes
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { logger } from '@universal-ai-cs/shared';

const router = Router();

/**
 * Get partner revenue summary
 * GET /api/v1/revenue/:partnerId/summary
 */
router.get('/:partnerId/summary',
  param('partnerId').isUUID().withMessage('Invalid partner ID'),
  query('period').optional().isIn(['month', 'quarter', 'year']).withMessage('Invalid period'),
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
      const { period = 'month' } = req.query;

      // Mock revenue data - in production, fetch from database
      const revenueSummary = {
        partnerId,
        period,
        totalRevenue: 125000.00,
        commission: 25000.00,
        commissionRate: 20,
        bonuses: 2500.00,
        deductions: 500.00,
        netPayout: 27000.00,
        customerCount: 45,
        averageRevenuePerCustomer: 2777.78,
        growth: {
          revenue: 15.5,
          customers: 12.3,
          commission: 18.2,
        },
        breakdown: {
          subscription: 85000.00,
          usage: 30000.00,
          oneTime: 10000.00,
        },
        topCustomers: [
          { organizationId: 'org_1', name: 'Customer A', revenue: 15000.00 },
          { organizationId: 'org_2', name: 'Customer B', revenue: 12000.00 },
          { organizationId: 'org_3', name: 'Customer C', revenue: 10000.00 },
        ],
      };

      res.json({
        success: true,
        data: revenueSummary,
      });
    } catch (error) {
      logger.error('Error getting revenue summary', {
        partnerId: req.params.partnerId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get revenue summary',
      });
    }
  }
);

/**
 * Get commission calculations
 * GET /api/v1/revenue/:partnerId/commissions
 */
router.get('/:partnerId/commissions',
  param('partnerId').isUUID().withMessage('Invalid partner ID'),
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date'),
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
      const { startDate, endDate } = req.query;

      // Mock commission data - in production, calculate from database
      const commissions = [
        {
          id: 'comm_1',
          organizationId: 'org_1',
          organizationName: 'Customer A',
          period: '2024-01',
          revenue: 15000.00,
          commissionRate: 20,
          baseCommission: 3000.00,
          bonuses: 300.00,
          deductions: 0.00,
          finalCommission: 3300.00,
          status: 'calculated',
          calculatedAt: '2024-01-31T23:59:59Z',
        },
        {
          id: 'comm_2',
          organizationId: 'org_2',
          organizationName: 'Customer B',
          period: '2024-01',
          revenue: 12000.00,
          commissionRate: 20,
          baseCommission: 2400.00,
          bonuses: 240.00,
          deductions: 50.00,
          finalCommission: 2590.00,
          status: 'paid',
          calculatedAt: '2024-01-31T23:59:59Z',
          paidAt: '2024-02-05T10:00:00Z',
        },
      ];

      const summary = {
        totalCommissions: commissions.reduce((sum, c) => sum + c.finalCommission, 0),
        totalBonuses: commissions.reduce((sum, c) => sum + c.bonuses, 0),
        totalDeductions: commissions.reduce((sum, c) => sum + c.deductions, 0),
        averageCommissionRate: commissions.reduce((sum, c) => sum + c.commissionRate, 0) / commissions.length,
        count: commissions.length,
      };

      res.json({
        success: true,
        data: {
          commissions,
          summary,
          period: { startDate, endDate },
        },
      });
    } catch (error) {
      logger.error('Error getting commissions', {
        partnerId: req.params.partnerId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get commissions',
      });
    }
  }
);

/**
 * Get payout history
 * GET /api/v1/revenue/:partnerId/payouts
 */
router.get('/:partnerId/payouts',
  param('partnerId').isUUID().withMessage('Invalid partner ID'),
  query('status').optional().isIn(['pending', 'processing', 'completed', 'failed']).withMessage('Invalid status'),
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
      const { status } = req.query;

      // Mock payout data - in production, fetch from database
      const payouts = [
        {
          id: 'payout_1',
          partnerId,
          period: '2024-01',
          amount: 27000.00,
          currency: 'USD',
          status: 'completed',
          method: 'bank_transfer',
          reference: 'TXN_20240205_001',
          scheduledDate: '2024-02-05T00:00:00Z',
          processedDate: '2024-02-05T10:30:00Z',
          completedDate: '2024-02-05T14:15:00Z',
          fees: 25.00,
          netAmount: 26975.00,
          breakdown: {
            commissions: 25000.00,
            bonuses: 2500.00,
            deductions: 500.00,
          },
        },
        {
          id: 'payout_2',
          partnerId,
          period: '2024-02',
          amount: 32000.00,
          currency: 'USD',
          status: 'pending',
          method: 'bank_transfer',
          scheduledDate: '2024-03-05T00:00:00Z',
          fees: 25.00,
          netAmount: 31975.00,
          breakdown: {
            commissions: 29500.00,
            bonuses: 3000.00,
            deductions: 500.00,
          },
        },
      ];

      const filteredPayouts = status ? payouts.filter(p => p.status === status) : payouts;

      const summary = {
        totalPayouts: filteredPayouts.reduce((sum, p) => sum + p.amount, 0),
        totalFees: filteredPayouts.reduce((sum, p) => sum + p.fees, 0),
        totalNet: filteredPayouts.reduce((sum, p) => sum + p.netAmount, 0),
        count: filteredPayouts.length,
        byStatus: {
          pending: payouts.filter(p => p.status === 'pending').length,
          processing: payouts.filter(p => p.status === 'processing').length,
          completed: payouts.filter(p => p.status === 'completed').length,
          failed: payouts.filter(p => p.status === 'failed').length,
        },
      };

      res.json({
        success: true,
        data: {
          payouts: filteredPayouts,
          summary,
        },
      });
    } catch (error) {
      logger.error('Error getting payouts', {
        partnerId: req.params.partnerId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get payouts',
      });
    }
  }
);

/**
 * Request payout
 * POST /api/v1/revenue/:partnerId/payouts
 */
router.post('/:partnerId/payouts',
  param('partnerId').isUUID().withMessage('Invalid partner ID'),
  body('period').isString().withMessage('Period is required'),
  body('method').isIn(['bank_transfer', 'paypal', 'stripe']).withMessage('Invalid payout method'),
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
      const { period, method, notes } = req.body;

      // Mock payout request - in production, create actual payout request
      const payoutRequest = {
        id: `payout_${Date.now()}`,
        partnerId,
        period,
        method,
        notes,
        status: 'pending',
        requestedAt: new Date().toISOString(),
        estimatedProcessingDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days
      };

      logger.info('Payout requested', {
        partnerId,
        payoutId: payoutRequest.id,
        period,
        method,
      });

      res.json({
        success: true,
        data: payoutRequest,
        message: 'Payout request submitted successfully',
      });
    } catch (error) {
      logger.error('Error requesting payout', {
        partnerId: req.params.partnerId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        success: false,
        error: 'Failed to request payout',
      });
    }
  }
);

export default router;
