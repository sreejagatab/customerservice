/**
 * Analytics and Reporting Service
 * Aggregates data from all services and generates comprehensive reports
 */

import { config } from '@/config';
import { logger } from '@/utils/logger';
import { redis } from '@/services/redis';
import axios from 'axios';

export interface AnalyticsMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  dimensions: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface AnalyticsReport {
  id: string;
  name: string;
  type: 'dashboard' | 'scheduled' | 'custom';
  organizationId?: string;
  timeRange: {
    start: Date;
    end: Date;
    granularity: 'hour' | 'day' | 'week' | 'month';
  };
  metrics: {
    messages: MessageMetrics;
    notifications: NotificationMetrics;
    users: UserMetrics;
    performance: PerformanceMetrics;
    costs: CostMetrics;
    satisfaction: SatisfactionMetrics;
  };
  generatedAt: Date;
  generatedBy?: string;
}

export interface MessageMetrics {
  totalMessages: number;
  inboundMessages: number;
  outboundMessages: number;
  averageResponseTime: number;
  resolutionRate: number;
  escalationRate: number;
  aiHandledPercentage: number;
  topChannels: Array<{ channel: string; count: number; percentage: number }>;
  topCategories: Array<{ category: string; count: number; percentage: number }>;
  hourlyDistribution: Array<{ hour: number; count: number }>;
  dailyTrend: Array<{ date: string; count: number; responseTime: number }>;
}

export interface NotificationMetrics {
  totalNotifications: number;
  emailNotifications: number;
  smsNotifications: number;
  pushNotifications: number;
  inAppNotifications: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  unsubscribeRate: number;
  averageDeliveryTime: number;
  failureReasons: Array<{ reason: string; count: number; percentage: number }>;
  channelPerformance: Array<{ channel: string; sent: number; delivered: number; rate: number }>;
}

export interface UserMetrics {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  userGrowthRate: number;
  averageSessionDuration: number;
  userRetentionRate: number;
  topUserActions: Array<{ action: string; count: number }>;
  usersByRole: Array<{ role: string; count: number }>;
  loginFrequency: Array<{ date: string; logins: number; uniqueUsers: number }>;
}

export interface PerformanceMetrics {
  averageResponseTime: number;
  throughput: number;
  errorRate: number;
  uptime: number;
  memoryUsage: number;
  cpuUsage: number;
  diskUsage: number;
  networkLatency: number;
  serviceHealth: Array<{ service: string; status: string; responseTime: number }>;
  slowestEndpoints: Array<{ endpoint: string; averageTime: number; callCount: number }>;
}

export interface CostMetrics {
  totalCost: number;
  messagingCosts: number;
  notificationCosts: number;
  infrastructureCosts: number;
  aiProcessingCosts: number;
  costPerMessage: number;
  costPerUser: number;
  monthlyTrend: Array<{ month: string; cost: number; usage: number }>;
  costBreakdown: Array<{ category: string; amount: number; percentage: number }>;
}

export interface SatisfactionMetrics {
  averageRating: number;
  totalRatings: number;
  ratingDistribution: Array<{ rating: number; count: number; percentage: number }>;
  npsScore: number;
  csatScore: number;
  firstContactResolution: number;
  customerEffortScore: number;
  feedbackTrends: Array<{ date: string; rating: number; count: number }>;
}

export interface DashboardWidget {
  id: string;
  type: 'metric' | 'chart' | 'table' | 'gauge' | 'heatmap';
  title: string;
  description?: string;
  position: { x: number; y: number; width: number; height: number };
  config: {
    metricName?: string;
    chartType?: 'line' | 'bar' | 'pie' | 'area';
    timeRange?: string;
    filters?: Record<string, any>;
    aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  };
  refreshInterval: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomDashboard {
  id: string;
  name: string;
  description?: string;
  organizationId: string;
  isPublic: boolean;
  widgets: DashboardWidget[];
  layout: {
    columns: number;
    rows: number;
  };
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export class AnalyticsService {
  private static instance: AnalyticsService;

  private constructor() {}

  public static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  /**
   * Generate comprehensive analytics report
   */
  public async generateReport(
    organizationId: string,
    timeRange: AnalyticsReport['timeRange'],
    reportType: AnalyticsReport['type'] = 'custom',
    generatedBy?: string
  ): Promise<AnalyticsReport> {
    try {
      const reportId = this.generateReportId();
      
      logger.info('Generating analytics report', {
        reportId,
        organizationId,
        timeRange,
        reportType,
        generatedBy,
      });

      // Aggregate metrics from all services
      const [
        messageMetrics,
        notificationMetrics,
        userMetrics,
        performanceMetrics,
        costMetrics,
        satisfactionMetrics,
      ] = await Promise.all([
        this.aggregateMessageMetrics(organizationId, timeRange),
        this.aggregateNotificationMetrics(organizationId, timeRange),
        this.aggregateUserMetrics(organizationId, timeRange),
        this.aggregatePerformanceMetrics(organizationId, timeRange),
        this.aggregateCostMetrics(organizationId, timeRange),
        this.aggregateSatisfactionMetrics(organizationId, timeRange),
      ]);

      const report: AnalyticsReport = {
        id: reportId,
        name: `Analytics Report - ${new Date().toISOString().split('T')[0]}`,
        type: reportType,
        organizationId,
        timeRange,
        metrics: {
          messages: messageMetrics,
          notifications: notificationMetrics,
          users: userMetrics,
          performance: performanceMetrics,
          costs: costMetrics,
          satisfaction: satisfactionMetrics,
        },
        generatedAt: new Date(),
        generatedBy,
      };

      // Cache the report
      await this.cacheReport(report);

      logger.info('Analytics report generated successfully', {
        reportId,
        organizationId,
        generatedAt: report.generatedAt,
      });

      return report;
    } catch (error) {
      logger.error('Error generating analytics report', {
        organizationId,
        timeRange,
        reportType,
        generatedBy,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Aggregate message metrics from message service
   */
  private async aggregateMessageMetrics(
    organizationId: string,
    timeRange: AnalyticsReport['timeRange']
  ): Promise<MessageMetrics> {
    try {
      const response = await axios.get(`${config.services.message.url}/api/v1/analytics`, {
        params: {
          organizationId,
          startDate: timeRange.start.toISOString(),
          endDate: timeRange.end.toISOString(),
          granularity: timeRange.granularity,
        },
        headers: {
          'Authorization': `Bearer ${config.services.message.apiKey}`,
        },
        timeout: 30000,
      });

      const data = response.data.data;
      
      return {
        totalMessages: data.summary.totalMessages || 0,
        inboundMessages: data.summary.inboundMessages || 0,
        outboundMessages: data.summary.outboundMessages || 0,
        averageResponseTime: data.summary.averageResponseTime || 0,
        resolutionRate: data.summary.resolutionRate || 0,
        escalationRate: data.summary.escalationRate || 0,
        aiHandledPercentage: data.summary.aiHandledPercentage || 0,
        topChannels: data.topChannels || [],
        topCategories: data.topCategories || [],
        hourlyDistribution: data.hourlyDistribution || [],
        dailyTrend: data.dailyTrend || [],
      };
    } catch (error) {
      logger.error('Error aggregating message metrics', {
        organizationId,
        timeRange,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return this.getDefaultMessageMetrics();
    }
  }

  /**
   * Aggregate notification metrics from notification service
   */
  private async aggregateNotificationMetrics(
    organizationId: string,
    timeRange: AnalyticsReport['timeRange']
  ): Promise<NotificationMetrics> {
    try {
      const response = await axios.get(`${config.services.notification.url}/api/v1/analytics`, {
        params: {
          organizationId,
          startDate: timeRange.start.toISOString(),
          endDate: timeRange.end.toISOString(),
          granularity: timeRange.granularity,
        },
        headers: {
          'Authorization': `Bearer ${config.services.notification.apiKey}`,
        },
        timeout: 30000,
      });

      const data = response.data.data;
      
      return {
        totalNotifications: data.summary.totalSent || 0,
        emailNotifications: data.byChannel.email?.sent || 0,
        smsNotifications: data.byChannel.sms?.sent || 0,
        pushNotifications: data.byChannel.push?.sent || 0,
        inAppNotifications: data.byChannel.in_app?.sent || 0,
        deliveryRate: data.summary.deliveryRate || 0,
        openRate: data.summary.openRate || 0,
        clickRate: data.summary.clickRate || 0,
        unsubscribeRate: data.summary.unsubscribeRate || 0,
        averageDeliveryTime: data.summary.avgDeliveryTime || 0,
        failureReasons: data.topFailureReasons || [],
        channelPerformance: Object.entries(data.byChannel || {}).map(([channel, metrics]: [string, any]) => ({
          channel,
          sent: metrics.sent || 0,
          delivered: metrics.delivered || 0,
          rate: metrics.deliveryRate || 0,
        })),
      };
    } catch (error) {
      logger.error('Error aggregating notification metrics', {
        organizationId,
        timeRange,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return this.getDefaultNotificationMetrics();
    }
  }

  /**
   * Aggregate user metrics
   */
  private async aggregateUserMetrics(
    organizationId: string,
    timeRange: AnalyticsReport['timeRange']
  ): Promise<UserMetrics> {
    try {
      // TODO: Implement user metrics aggregation from database
      
      return {
        totalUsers: 0,
        activeUsers: 0,
        newUsers: 0,
        userGrowthRate: 0,
        averageSessionDuration: 0,
        userRetentionRate: 0,
        topUserActions: [],
        usersByRole: [],
        loginFrequency: [],
      };
    } catch (error) {
      logger.error('Error aggregating user metrics', {
        organizationId,
        timeRange,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return this.getDefaultUserMetrics();
    }
  }

  /**
   * Aggregate performance metrics
   */
  private async aggregatePerformanceMetrics(
    organizationId: string,
    timeRange: AnalyticsReport['timeRange']
  ): Promise<PerformanceMetrics> {
    try {
      // Get performance data from health monitoring service
      const { healthMonitoringService } = await import('@/services/health-monitoring-service');
      const systemHealth = await healthMonitoringService.getSystemHealth();
      
      return {
        averageResponseTime: systemHealth.services.reduce((sum, s) => sum + s.responseTime, 0) / systemHealth.services.length || 0,
        throughput: 0, // TODO: Calculate from request logs
        errorRate: systemHealth.services.filter(s => s.status === 'unhealthy').length / systemHealth.services.length * 100,
        uptime: systemHealth.metrics.uptime,
        memoryUsage: systemHealth.metrics.memoryUsage,
        cpuUsage: systemHealth.metrics.cpuUsage,
        diskUsage: systemHealth.metrics.diskUsage,
        networkLatency: 0, // TODO: Calculate network latency
        serviceHealth: systemHealth.services.map(s => ({
          service: s.service,
          status: s.status,
          responseTime: s.responseTime,
        })),
        slowestEndpoints: [], // TODO: Aggregate from service logs
      };
    } catch (error) {
      logger.error('Error aggregating performance metrics', {
        organizationId,
        timeRange,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return this.getDefaultPerformanceMetrics();
    }
  }

  /**
   * Aggregate cost metrics
   */
  private async aggregateCostMetrics(
    organizationId: string,
    timeRange: AnalyticsReport['timeRange']
  ): Promise<CostMetrics> {
    try {
      // TODO: Implement cost tracking and aggregation
      
      return {
        totalCost: 0,
        messagingCosts: 0,
        notificationCosts: 0,
        infrastructureCosts: 0,
        aiProcessingCosts: 0,
        costPerMessage: 0,
        costPerUser: 0,
        monthlyTrend: [],
        costBreakdown: [],
      };
    } catch (error) {
      logger.error('Error aggregating cost metrics', {
        organizationId,
        timeRange,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return this.getDefaultCostMetrics();
    }
  }

  /**
   * Aggregate satisfaction metrics
   */
  private async aggregateSatisfactionMetrics(
    organizationId: string,
    timeRange: AnalyticsReport['timeRange']
  ): Promise<SatisfactionMetrics> {
    try {
      // TODO: Implement satisfaction metrics aggregation
      
      return {
        averageRating: 0,
        totalRatings: 0,
        ratingDistribution: [],
        npsScore: 0,
        csatScore: 0,
        firstContactResolution: 0,
        customerEffortScore: 0,
        feedbackTrends: [],
      };
    } catch (error) {
      logger.error('Error aggregating satisfaction metrics', {
        organizationId,
        timeRange,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return this.getDefaultSatisfactionMetrics();
    }
  }

  /**
   * Create custom dashboard
   */
  public async createDashboard(
    dashboard: Omit<CustomDashboard, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<CustomDashboard> {
    try {
      const customDashboard: CustomDashboard = {
        ...dashboard,
        id: this.generateDashboardId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // TODO: Save to database
      
      // Cache dashboard
      await redis.set(`dashboard:${customDashboard.id}`, customDashboard, { ttl: 3600 });

      logger.info('Custom dashboard created', {
        dashboardId: customDashboard.id,
        name: customDashboard.name,
        organizationId: customDashboard.organizationId,
        createdBy: customDashboard.createdBy,
        widgetCount: customDashboard.widgets.length,
      });

      return customDashboard;
    } catch (error) {
      logger.error('Error creating custom dashboard', {
        dashboard,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Export report data
   */
  public async exportReport(
    reportId: string,
    format: 'json' | 'csv' | 'pdf' | 'excel'
  ): Promise<{ data: string | Buffer; filename: string; mimeType: string }> {
    try {
      const report = await this.getReport(reportId);
      if (!report) {
        throw new Error('Report not found');
      }

      const timestamp = new Date().toISOString().split('T')[0];
      
      switch (format) {
        case 'json':
          return {
            data: JSON.stringify(report, null, 2),
            filename: `analytics-report-${timestamp}.json`,
            mimeType: 'application/json',
          };
          
        case 'csv':
          const csvData = this.convertReportToCSV(report);
          return {
            data: csvData,
            filename: `analytics-report-${timestamp}.csv`,
            mimeType: 'text/csv',
          };
          
        case 'pdf':
          // TODO: Implement PDF generation
          throw new Error('PDF export not yet implemented');
          
        case 'excel':
          // TODO: Implement Excel generation
          throw new Error('Excel export not yet implemented');
          
        default:
          throw new Error('Unsupported export format');
      }
    } catch (error) {
      logger.error('Error exporting report', {
        reportId,
        format,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Convert report to CSV format
   */
  private convertReportToCSV(report: AnalyticsReport): string {
    const rows = [
      ['Metric Category', 'Metric Name', 'Value', 'Unit'],
      ['Messages', 'Total Messages', report.metrics.messages.totalMessages.toString(), 'count'],
      ['Messages', 'Average Response Time', report.metrics.messages.averageResponseTime.toString(), 'ms'],
      ['Messages', 'Resolution Rate', report.metrics.messages.resolutionRate.toString(), '%'],
      ['Notifications', 'Total Notifications', report.metrics.notifications.totalNotifications.toString(), 'count'],
      ['Notifications', 'Delivery Rate', report.metrics.notifications.deliveryRate.toString(), '%'],
      ['Users', 'Total Users', report.metrics.users.totalUsers.toString(), 'count'],
      ['Users', 'Active Users', report.metrics.users.activeUsers.toString(), 'count'],
      ['Performance', 'Average Response Time', report.metrics.performance.averageResponseTime.toString(), 'ms'],
      ['Performance', 'Uptime', report.metrics.performance.uptime.toString(), 'seconds'],
      ['Costs', 'Total Cost', report.metrics.costs.totalCost.toString(), 'USD'],
      ['Satisfaction', 'Average Rating', report.metrics.satisfaction.averageRating.toString(), 'rating'],
    ];

    return rows.map(row => row.join(',')).join('\n');
  }

  /**
   * Get cached report
   */
  private async getReport(reportId: string): Promise<AnalyticsReport | null> {
    return await redis.get<AnalyticsReport>(`report:${reportId}`);
  }

  /**
   * Cache report
   */
  private async cacheReport(report: AnalyticsReport): Promise<void> {
    await redis.set(`report:${report.id}`, report, { ttl: 24 * 60 * 60 }); // 24 hours
  }

  /**
   * Default metrics for fallback
   */
  private getDefaultMessageMetrics(): MessageMetrics {
    return {
      totalMessages: 0,
      inboundMessages: 0,
      outboundMessages: 0,
      averageResponseTime: 0,
      resolutionRate: 0,
      escalationRate: 0,
      aiHandledPercentage: 0,
      topChannels: [],
      topCategories: [],
      hourlyDistribution: [],
      dailyTrend: [],
    };
  }

  private getDefaultNotificationMetrics(): NotificationMetrics {
    return {
      totalNotifications: 0,
      emailNotifications: 0,
      smsNotifications: 0,
      pushNotifications: 0,
      inAppNotifications: 0,
      deliveryRate: 0,
      openRate: 0,
      clickRate: 0,
      unsubscribeRate: 0,
      averageDeliveryTime: 0,
      failureReasons: [],
      channelPerformance: [],
    };
  }

  private getDefaultUserMetrics(): UserMetrics {
    return {
      totalUsers: 0,
      activeUsers: 0,
      newUsers: 0,
      userGrowthRate: 0,
      averageSessionDuration: 0,
      userRetentionRate: 0,
      topUserActions: [],
      usersByRole: [],
      loginFrequency: [],
    };
  }

  private getDefaultPerformanceMetrics(): PerformanceMetrics {
    return {
      averageResponseTime: 0,
      throughput: 0,
      errorRate: 0,
      uptime: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      diskUsage: 0,
      networkLatency: 0,
      serviceHealth: [],
      slowestEndpoints: [],
    };
  }

  private getDefaultCostMetrics(): CostMetrics {
    return {
      totalCost: 0,
      messagingCosts: 0,
      notificationCosts: 0,
      infrastructureCosts: 0,
      aiProcessingCosts: 0,
      costPerMessage: 0,
      costPerUser: 0,
      monthlyTrend: [],
      costBreakdown: [],
    };
  }

  private getDefaultSatisfactionMetrics(): SatisfactionMetrics {
    return {
      averageRating: 0,
      totalRatings: 0,
      ratingDistribution: [],
      npsScore: 0,
      csatScore: 0,
      firstContactResolution: 0,
      customerEffortScore: 0,
      feedbackTrends: [],
    };
  }

  /**
   * Generate unique IDs
   */
  private generateReportId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateDashboardId(): string {
    return `dashboard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const analyticsService = AnalyticsService.getInstance();
