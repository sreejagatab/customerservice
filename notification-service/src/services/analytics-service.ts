/**
 * Notification Analytics Service
 * Tracks notification metrics, delivery rates, and performance analytics
 */

import { config } from '@/config';
import { logger } from '@/utils/logger';
import { redis } from '@/services/redis';

export interface NotificationMetrics {
  organizationId: string;
  date: string; // YYYY-MM-DD format
  channel: 'email' | 'sms' | 'push' | 'in_app' | 'webhook';
  sent: number;
  delivered: number;
  failed: number;
  opened?: number;
  clicked?: number;
  unsubscribed?: number;
  bounced?: number;
  complained?: number;
  avgDeliveryTime: number;
  totalCost: number;
}

export interface AnalyticsReport {
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalSent: number;
    totalDelivered: number;
    totalFailed: number;
    deliveryRate: number;
    avgDeliveryTime: number;
    totalCost: number;
  };
  byChannel: {
    [channel: string]: {
      sent: number;
      delivered: number;
      failed: number;
      deliveryRate: number;
      avgDeliveryTime: number;
      cost: number;
    };
  };
  byDay: Array<{
    date: string;
    sent: number;
    delivered: number;
    failed: number;
    deliveryRate: number;
  }>;
  topFailureReasons: Array<{
    reason: string;
    count: number;
    percentage: number;
  }>;
}

export interface DeliveryEvent {
  notificationId: string;
  organizationId: string;
  recipientId: string;
  channel: 'email' | 'sms' | 'push' | 'in_app' | 'webhook';
  event: 'sent' | 'delivered' | 'failed' | 'opened' | 'clicked' | 'unsubscribed' | 'bounced' | 'complained';
  timestamp: Date;
  deliveryTime?: number;
  cost?: number;
  errorReason?: string;
  metadata?: Record<string, any>;
}

export class NotificationAnalyticsService {
  private static instance: NotificationAnalyticsService;

  private constructor() {}

  public static getInstance(): NotificationAnalyticsService {
    if (!NotificationAnalyticsService.instance) {
      NotificationAnalyticsService.instance = new NotificationAnalyticsService();
    }
    return NotificationAnalyticsService.instance;
  }

  /**
   * Track a delivery event
   */
  public async trackDeliveryEvent(event: DeliveryEvent): Promise<void> {
    try {
      if (!config.features.notificationAnalytics) {
        return;
      }

      const dateKey = event.timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
      const metricsKey = `metrics:${event.organizationId}:${dateKey}:${event.channel}`;
      const eventKey = `events:${event.organizationId}:${dateKey}`;

      // Update metrics counters
      await this.updateMetricsCounters(metricsKey, event);

      // Store individual event for detailed analysis
      await this.storeEvent(eventKey, event);

      // Update real-time metrics
      await this.updateRealTimeMetrics(event);

      logger.debug('Delivery event tracked', {
        notificationId: event.notificationId,
        channel: event.channel,
        event: event.event,
        organizationId: event.organizationId,
      });
    } catch (error) {
      logger.error('Failed to track delivery event', {
        notificationId: event.notificationId,
        event: event.event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get analytics report for a period
   */
  public async getAnalyticsReport(
    organizationId: string,
    startDate: Date,
    endDate: Date,
    channels?: string[]
  ): Promise<AnalyticsReport> {
    try {
      const report: AnalyticsReport = {
        period: { start: startDate, end: endDate },
        summary: {
          totalSent: 0,
          totalDelivered: 0,
          totalFailed: 0,
          deliveryRate: 0,
          avgDeliveryTime: 0,
          totalCost: 0,
        },
        byChannel: {},
        byDay: [],
        topFailureReasons: [],
      };

      // Get metrics for each day in the period
      const days = this.getDaysBetween(startDate, endDate);
      const channelsToQuery = channels || ['email', 'sms', 'push', 'in_app', 'webhook'];

      for (const day of days) {
        const dayMetrics = await this.getDayMetrics(organizationId, day, channelsToQuery);
        
        // Add to daily summary
        const dayTotal = {
          date: day,
          sent: 0,
          delivered: 0,
          failed: 0,
          deliveryRate: 0,
        };

        for (const channelMetrics of dayMetrics) {
          // Update summary
          report.summary.totalSent += channelMetrics.sent;
          report.summary.totalDelivered += channelMetrics.delivered;
          report.summary.totalFailed += channelMetrics.failed;
          report.summary.totalCost += channelMetrics.totalCost;

          // Update by channel
          if (!report.byChannel[channelMetrics.channel]) {
            report.byChannel[channelMetrics.channel] = {
              sent: 0,
              delivered: 0,
              failed: 0,
              deliveryRate: 0,
              avgDeliveryTime: 0,
              cost: 0,
            };
          }

          const channelSummary = report.byChannel[channelMetrics.channel];
          channelSummary.sent += channelMetrics.sent;
          channelSummary.delivered += channelMetrics.delivered;
          channelSummary.failed += channelMetrics.failed;
          channelSummary.cost += channelMetrics.totalCost;

          // Update day totals
          dayTotal.sent += channelMetrics.sent;
          dayTotal.delivered += channelMetrics.delivered;
          dayTotal.failed += channelMetrics.failed;
        }

        // Calculate day delivery rate
        dayTotal.deliveryRate = dayTotal.sent > 0 ? (dayTotal.delivered / dayTotal.sent) * 100 : 0;
        report.byDay.push(dayTotal);
      }

      // Calculate summary rates
      report.summary.deliveryRate = report.summary.totalSent > 0 
        ? (report.summary.totalDelivered / report.summary.totalSent) * 100 
        : 0;

      // Calculate channel delivery rates
      for (const channel in report.byChannel) {
        const channelData = report.byChannel[channel];
        channelData.deliveryRate = channelData.sent > 0 
          ? (channelData.delivered / channelData.sent) * 100 
          : 0;
      }

      // Get top failure reasons
      report.topFailureReasons = await this.getTopFailureReasons(organizationId, startDate, endDate);

      return report;
    } catch (error) {
      logger.error('Failed to generate analytics report', {
        organizationId,
        startDate,
        endDate,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get real-time metrics
   */
  public async getRealTimeMetrics(organizationId: string): Promise<{
    last24Hours: NotificationMetrics[];
    currentHour: NotificationMetrics[];
    liveStats: {
      sentLastMinute: number;
      deliveredLastMinute: number;
      failedLastMinute: number;
      avgDeliveryTime: number;
    };
  }> {
    try {
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

      // Get last 24 hours metrics
      const last24HoursMetrics = await this.getHourlyMetrics(organizationId, last24Hours, now);

      // Get current hour metrics
      const currentHourMetrics = await this.getHourlyMetrics(organizationId, currentHour, now);

      // Get live stats (last minute)
      const liveStats = await this.getLiveStats(organizationId);

      return {
        last24Hours: last24HoursMetrics,
        currentHour: currentHourMetrics,
        liveStats,
      };
    } catch (error) {
      logger.error('Failed to get real-time metrics', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get delivery performance by template
   */
  public async getTemplatePerformance(
    organizationId: string,
    templateId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    templateId: string;
    totalSent: number;
    deliveryRate: number;
    openRate?: number;
    clickRate?: number;
    unsubscribeRate?: number;
    avgDeliveryTime: number;
    performanceByChannel: Record<string, any>;
  }> {
    try {
      // TODO: Implement template-specific analytics
      return {
        templateId,
        totalSent: 0,
        deliveryRate: 0,
        avgDeliveryTime: 0,
        performanceByChannel: {},
      };
    } catch (error) {
      logger.error('Failed to get template performance', {
        organizationId,
        templateId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update metrics counters
   */
  private async updateMetricsCounters(metricsKey: string, event: DeliveryEvent): Promise<void> {
    const pipeline = redis.pipeline();

    // Increment event counter
    pipeline.hincrby(metricsKey, event.event, 1);

    // Update delivery time if provided
    if (event.deliveryTime) {
      pipeline.hincrby(metricsKey, 'total_delivery_time', event.deliveryTime);
      pipeline.hincrby(metricsKey, 'delivery_time_count', 1);
    }

    // Update cost if provided
    if (event.cost) {
      pipeline.hincrbyfloat(metricsKey, 'total_cost', event.cost);
    }

    // Set expiration (keep metrics for 90 days)
    pipeline.expire(metricsKey, 90 * 24 * 60 * 60);

    await pipeline.exec();
  }

  /**
   * Store individual event
   */
  private async storeEvent(eventKey: string, event: DeliveryEvent): Promise<void> {
    const eventData = {
      ...event,
      timestamp: event.timestamp.toISOString(),
    };

    // Store as list item
    await redis.lpush(eventKey, JSON.stringify(eventData));
    
    // Keep only last 10000 events per day
    await redis.ltrim(eventKey, 0, 9999);
    
    // Set expiration (keep events for 30 days)
    await redis.expire(eventKey, 30 * 24 * 60 * 60);
  }

  /**
   * Update real-time metrics
   */
  private async updateRealTimeMetrics(event: DeliveryEvent): Promise<void> {
    const now = new Date();
    const minuteKey = `realtime:${event.organizationId}:${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}:${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const pipeline = redis.pipeline();
    pipeline.hincrby(minuteKey, `${event.channel}_${event.event}`, 1);
    
    if (event.deliveryTime) {
      pipeline.hincrby(minuteKey, 'total_delivery_time', event.deliveryTime);
      pipeline.hincrby(minuteKey, 'delivery_time_count', 1);
    }

    // Expire after 2 hours
    pipeline.expire(minuteKey, 2 * 60 * 60);

    await pipeline.exec();
  }

  /**
   * Get metrics for a specific day
   */
  private async getDayMetrics(
    organizationId: string,
    date: string,
    channels: string[]
  ): Promise<NotificationMetrics[]> {
    const metrics: NotificationMetrics[] = [];

    for (const channel of channels) {
      const metricsKey = `metrics:${organizationId}:${date}:${channel}`;
      const data = await redis.hgetall(metricsKey);

      if (Object.keys(data).length > 0) {
        const sent = parseInt(data.sent || '0');
        const delivered = parseInt(data.delivered || '0');
        const failed = parseInt(data.failed || '0');
        const totalDeliveryTime = parseInt(data.total_delivery_time || '0');
        const deliveryTimeCount = parseInt(data.delivery_time_count || '0');
        const totalCost = parseFloat(data.total_cost || '0');

        metrics.push({
          organizationId,
          date,
          channel: channel as any,
          sent,
          delivered,
          failed,
          opened: parseInt(data.opened || '0'),
          clicked: parseInt(data.clicked || '0'),
          unsubscribed: parseInt(data.unsubscribed || '0'),
          bounced: parseInt(data.bounced || '0'),
          complained: parseInt(data.complained || '0'),
          avgDeliveryTime: deliveryTimeCount > 0 ? totalDeliveryTime / deliveryTimeCount : 0,
          totalCost,
        });
      }
    }

    return metrics;
  }

  /**
   * Get hourly metrics
   */
  private async getHourlyMetrics(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<NotificationMetrics[]> {
    // TODO: Implement hourly metrics aggregation
    return [];
  }

  /**
   * Get live stats for the last minute
   */
  private async getLiveStats(organizationId: string): Promise<{
    sentLastMinute: number;
    deliveredLastMinute: number;
    failedLastMinute: number;
    avgDeliveryTime: number;
  }> {
    const now = new Date();
    const lastMinute = new Date(now.getTime() - 60 * 1000);
    
    // Get metrics for the last minute
    const minuteKey = `realtime:${organizationId}:${lastMinute.getFullYear()}-${(lastMinute.getMonth() + 1).toString().padStart(2, '0')}-${lastMinute.getDate().toString().padStart(2, '0')}:${lastMinute.getHours().toString().padStart(2, '0')}:${lastMinute.getMinutes().toString().padStart(2, '0')}`;
    
    const data = await redis.hgetall(minuteKey);
    
    let sentLastMinute = 0;
    let deliveredLastMinute = 0;
    let failedLastMinute = 0;
    
    // Sum across all channels
    for (const key in data) {
      if (key.endsWith('_sent')) {
        sentLastMinute += parseInt(data[key]);
      } else if (key.endsWith('_delivered')) {
        deliveredLastMinute += parseInt(data[key]);
      } else if (key.endsWith('_failed')) {
        failedLastMinute += parseInt(data[key]);
      }
    }
    
    const totalDeliveryTime = parseInt(data.total_delivery_time || '0');
    const deliveryTimeCount = parseInt(data.delivery_time_count || '0');
    const avgDeliveryTime = deliveryTimeCount > 0 ? totalDeliveryTime / deliveryTimeCount : 0;

    return {
      sentLastMinute,
      deliveredLastMinute,
      failedLastMinute,
      avgDeliveryTime,
    };
  }

  /**
   * Get top failure reasons
   */
  private async getTopFailureReasons(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ reason: string; count: number; percentage: number }>> {
    try {
      // TODO: Implement failure reason analysis
      return [];
    } catch (error) {
      logger.error('Failed to get top failure reasons', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get days between two dates
   */
  private getDaysBetween(startDate: Date, endDate: Date): string[] {
    const days: string[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      days.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return days;
  }

  /**
   * Export analytics data
   */
  public async exportAnalyticsData(
    organizationId: string,
    startDate: Date,
    endDate: Date,
    format: 'csv' | 'json' = 'json'
  ): Promise<string> {
    try {
      const report = await this.getAnalyticsReport(organizationId, startDate, endDate);
      
      if (format === 'csv') {
        return this.convertToCSV(report);
      } else {
        return JSON.stringify(report, null, 2);
      }
    } catch (error) {
      logger.error('Failed to export analytics data', {
        organizationId,
        format,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Convert report to CSV format
   */
  private convertToCSV(report: AnalyticsReport): string {
    const headers = ['Date', 'Channel', 'Sent', 'Delivered', 'Failed', 'Delivery Rate'];
    const rows = [headers.join(',')];

    // Add daily data
    for (const day of report.byDay) {
      for (const channel in report.byChannel) {
        const channelData = report.byChannel[channel];
        rows.push([
          day.date,
          channel,
          channelData.sent.toString(),
          channelData.delivered.toString(),
          channelData.failed.toString(),
          channelData.deliveryRate.toFixed(2) + '%',
        ].join(','));
      }
    }

    return rows.join('\n');
  }
}

// Export singleton instance
export const analyticsService = NotificationAnalyticsService.getInstance();
