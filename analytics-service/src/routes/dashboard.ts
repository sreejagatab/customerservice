/**
 * Dashboard Routes
 * Real-time analytics dashboard endpoints
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { DashboardService } from '@/services/dashboard';
import { MetricsService } from '@/services/metrics';
import { asyncHandler } from '@/utils/async-handler';
import { validateRequest } from '@/middleware/validation';
import { logger } from '@/utils/logger';

const router = Router();

// Validation schemas
const timeRangeSchema = z.object({
  query: z.object({
    timeRange: z.enum(['1h', '24h', '7d', '30d', '90d']).default('24h'),
    timezone: z.string().optional(),
  }),
});

const customRangeSchema = z.object({
  query: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    timezone: z.string().optional(),
  }),
});

/**
 * Get real-time dashboard overview
 * GET /api/v1/dashboard/overview
 */
router.get('/overview',
  validateRequest(timeRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId } = req.user!;
    const { timeRange, timezone } = req.query;

    const overview = await DashboardService.getOverview(organizationId, {
      timeRange: timeRange as string,
      timezone: timezone as string,
    });

    res.json({
      success: true,
      data: overview,
    });
  })
);

/**
 * Get real-time metrics
 * GET /api/v1/dashboard/realtime
 */
router.get('/realtime', asyncHandler(async (req: Request, res: Response) => {
  const { organizationId } = req.user!;

  const realtimeData = await DashboardService.getRealtimeMetrics(organizationId);

  res.json({
    success: true,
    data: realtimeData,
  });
}));

/**
 * Get message volume trends
 * GET /api/v1/dashboard/message-volume
 */
router.get('/message-volume',
  validateRequest(timeRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId } = req.user!;
    const { timeRange, timezone } = req.query;

    const volumeData = await DashboardService.getMessageVolumeTrends(organizationId, {
      timeRange: timeRange as string,
      timezone: timezone as string,
    });

    res.json({
      success: true,
      data: volumeData,
    });
  })
);

/**
 * Get response time analytics
 * GET /api/v1/dashboard/response-times
 */
router.get('/response-times',
  validateRequest(timeRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId } = req.user!;
    const { timeRange, timezone } = req.query;

    const responseTimeData = await DashboardService.getResponseTimeAnalytics(organizationId, {
      timeRange: timeRange as string,
      timezone: timezone as string,
    });

    res.json({
      success: true,
      data: responseTimeData,
    });
  })
);

/**
 * Get AI accuracy metrics
 * GET /api/v1/dashboard/ai-accuracy
 */
router.get('/ai-accuracy',
  validateRequest(timeRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId } = req.user!;
    const { timeRange, timezone } = req.query;

    const accuracyData = await DashboardService.getAiAccuracyMetrics(organizationId, {
      timeRange: timeRange as string,
      timezone: timezone as string,
    });

    res.json({
      success: true,
      data: accuracyData,
    });
  })
);

/**
 * Get customer satisfaction metrics
 * GET /api/v1/dashboard/satisfaction
 */
router.get('/satisfaction',
  validateRequest(timeRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId } = req.user!;
    const { timeRange, timezone } = req.query;

    const satisfactionData = await DashboardService.getCustomerSatisfactionMetrics(organizationId, {
      timeRange: timeRange as string,
      timezone: timezone as string,
    });

    res.json({
      success: true,
      data: satisfactionData,
    });
  })
);

/**
 * Get conversation flow analysis
 * GET /api/v1/dashboard/conversation-flow
 */
router.get('/conversation-flow',
  validateRequest(timeRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId } = req.user!;
    const { timeRange, timezone } = req.query;

    const flowData = await DashboardService.getConversationFlowAnalysis(organizationId, {
      timeRange: timeRange as string,
      timezone: timezone as string,
    });

    res.json({
      success: true,
      data: flowData,
    });
  })
);

/**
 * Get topic trending analysis
 * GET /api/v1/dashboard/topic-trends
 */
router.get('/topic-trends',
  validateRequest(timeRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId } = req.user!;
    const { timeRange, timezone } = req.query;

    const topicData = await DashboardService.getTopicTrends(organizationId, {
      timeRange: timeRange as string,
      timezone: timezone as string,
    });

    res.json({
      success: true,
      data: topicData,
    });
  })
);

/**
 * Get integration health status
 * GET /api/v1/dashboard/integration-health
 */
router.get('/integration-health', asyncHandler(async (req: Request, res: Response) => {
  const { organizationId } = req.user!;

  const healthData = await DashboardService.getIntegrationHealth(organizationId);

  res.json({
    success: true,
    data: healthData,
  });
}));

/**
 * Get ROI calculations
 * GET /api/v1/dashboard/roi
 */
router.get('/roi',
  validateRequest(timeRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId } = req.user!;
    const { timeRange, timezone } = req.query;

    const roiData = await DashboardService.getROICalculations(organizationId, {
      timeRange: timeRange as string,
      timezone: timezone as string,
    });

    res.json({
      success: true,
      data: roiData,
    });
  })
);

/**
 * Get performance comparison (Team vs AI)
 * GET /api/v1/dashboard/performance-comparison
 */
router.get('/performance-comparison',
  validateRequest(timeRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId } = req.user!;
    const { timeRange, timezone } = req.query;

    const comparisonData = await DashboardService.getPerformanceComparison(organizationId, {
      timeRange: timeRange as string,
      timezone: timezone as string,
    });

    res.json({
      success: true,
      data: comparisonData,
    });
  })
);

/**
 * Get cost analysis
 * GET /api/v1/dashboard/cost-analysis
 */
router.get('/cost-analysis',
  validateRequest(timeRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId } = req.user!;
    const { timeRange, timezone } = req.query;

    const costData = await DashboardService.getCostAnalysis(organizationId, {
      timeRange: timeRange as string,
      timezone: timezone as string,
    });

    res.json({
      success: true,
      data: costData,
    });
  })
);

/**
 * Export dashboard data
 * POST /api/v1/dashboard/export
 */
router.post('/export',
  validateRequest(z.object({
    body: z.object({
      format: z.enum(['csv', 'xlsx', 'pdf']),
      sections: z.array(z.string()),
      timeRange: z.string(),
      timezone: z.string().optional(),
    }),
  })),
  asyncHandler(async (req: Request, res: Response) => {
    const { organizationId } = req.user!;
    const { format, sections, timeRange, timezone } = req.body;

    const exportData = await DashboardService.exportDashboardData(organizationId, {
      format,
      sections,
      timeRange,
      timezone,
    });

    res.setHeader('Content-Type', exportData.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename}"`);
    res.send(exportData.data);
  })
);

export default router;
