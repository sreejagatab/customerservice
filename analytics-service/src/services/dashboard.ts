/**
 * Dashboard Service
 * Core analytics and dashboard data processing
 */

import { DatabaseService } from './database';
import { RedisService } from './redis';
import { logger } from '@/utils/logger';
import { 
  startOfDay, 
  endOfDay, 
  subDays, 
  subHours, 
  format, 
  parseISO,
  differenceInMinutes,
  differenceInHours
} from 'date-fns';

export interface TimeRangeOptions {
  timeRange: string;
  timezone?: string;
}

export interface DashboardOverview {
  totalMessages: number;
  totalConversations: number;
  averageResponseTime: number;
  customerSatisfactionScore: number;
  aiAccuracy: number;
  activeIntegrations: number;
  trends: {
    messages: number;
    conversations: number;
    responseTime: number;
    satisfaction: number;
  };
}

export interface RealtimeMetrics {
  activeConversations: number;
  messagesPerMinute: number;
  averageResponseTime: number;
  queueDepth: number;
  aiProcessingTime: number;
  errorRate: number;
  timestamp: Date;
}

export class DashboardService {
  /**
   * Get dashboard overview with key metrics
   */
  static async getOverview(
    organizationId: string,
    options: TimeRangeOptions
  ): Promise<DashboardOverview> {
    const db = DatabaseService.getClient();
    const { startDate, endDate, previousStartDate, previousEndDate } = this.getDateRange(options);

    // Current period metrics
    const currentMetrics = await db.query(`
      SELECT 
        COUNT(DISTINCT m.id) as total_messages,
        COUNT(DISTINCT c.id) as total_conversations,
        AVG(EXTRACT(EPOCH FROM (m.created_at - c.created_at)) * 1000) as avg_response_time,
        AVG(CASE WHEN cf.rating IS NOT NULL THEN cf.rating ELSE NULL END) as avg_satisfaction,
        COUNT(DISTINCT i.id) as active_integrations
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      LEFT JOIN customer_feedback cf ON c.id = cf.conversation_id
      LEFT JOIN integrations i ON c.integration_id = i.id AND i.status = 'active'
      WHERE c.organization_id = $1 
        AND c.created_at BETWEEN $2 AND $3
    `, [organizationId, startDate, endDate]);

    // Previous period metrics for trends
    const previousMetrics = await db.query(`
      SELECT 
        COUNT(DISTINCT m.id) as total_messages,
        COUNT(DISTINCT c.id) as total_conversations,
        AVG(EXTRACT(EPOCH FROM (m.created_at - c.created_at)) * 1000) as avg_response_time,
        AVG(CASE WHEN cf.rating IS NOT NULL THEN cf.rating ELSE NULL END) as avg_satisfaction
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      LEFT JOIN customer_feedback cf ON c.id = cf.conversation_id
      WHERE c.organization_id = $1 
        AND c.created_at BETWEEN $2 AND $3
    `, [organizationId, previousStartDate, previousEndDate]);

    // AI accuracy calculation
    const aiAccuracy = await this.calculateAiAccuracy(organizationId, startDate, endDate);

    const current = currentMetrics.rows[0];
    const previous = previousMetrics.rows[0];

    return {
      totalMessages: parseInt(current.total_messages || '0'),
      totalConversations: parseInt(current.total_conversations || '0'),
      averageResponseTime: parseFloat(current.avg_response_time || '0'),
      customerSatisfactionScore: parseFloat(current.avg_satisfaction || '0'),
      aiAccuracy,
      activeIntegrations: parseInt(current.active_integrations || '0'),
      trends: {
        messages: this.calculateTrend(current.total_messages, previous.total_messages),
        conversations: this.calculateTrend(current.total_conversations, previous.total_conversations),
        responseTime: this.calculateTrend(current.avg_response_time, previous.avg_response_time, true),
        satisfaction: this.calculateTrend(current.avg_satisfaction, previous.avg_satisfaction),
      },
    };
  }

  /**
   * Get real-time metrics
   */
  static async getRealtimeMetrics(organizationId: string): Promise<RealtimeMetrics> {
    const redis = RedisService.getClient();
    const db = DatabaseService.getClient();

    // Get cached real-time data
    const cachedData = await redis.get(`realtime:${organizationId}`);
    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // Calculate real-time metrics
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);
    const fiveMinutesAgo = new Date(now.getTime() - 300000);

    const metrics = await db.query(`
      SELECT 
        COUNT(DISTINCT CASE WHEN c.status IN ('open', 'in_progress') THEN c.id END) as active_conversations,
        COUNT(DISTINCT CASE WHEN m.created_at >= $2 THEN m.id END) as messages_last_minute,
        AVG(CASE WHEN m.created_at >= $3 THEN 
          EXTRACT(EPOCH FROM (m.processed_at - m.created_at)) * 1000 
        END) as avg_response_time,
        COUNT(DISTINCT CASE WHEN ae.status = 'queued' THEN ae.id END) as queue_depth,
        AVG(CASE WHEN ae.created_at >= $3 THEN ae.processing_time_ms END) as ai_processing_time,
        COUNT(DISTINCT CASE WHEN ae.status = 'failed' AND ae.created_at >= $3 THEN ae.id END)::float / 
        NULLIF(COUNT(DISTINCT CASE WHEN ae.created_at >= $3 THEN ae.id END), 0) as error_rate
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      LEFT JOIN analytics_events ae ON c.organization_id = ae.organization_id
      WHERE c.organization_id = $1
    `, [organizationId, oneMinuteAgo, fiveMinutesAgo]);

    const result = metrics.rows[0];
    const realtimeData: RealtimeMetrics = {
      activeConversations: parseInt(result.active_conversations || '0'),
      messagesPerMinute: parseInt(result.messages_last_minute || '0'),
      averageResponseTime: parseFloat(result.avg_response_time || '0'),
      queueDepth: parseInt(result.queue_depth || '0'),
      aiProcessingTime: parseFloat(result.ai_processing_time || '0'),
      errorRate: parseFloat(result.error_rate || '0'),
      timestamp: now,
    };

    // Cache for 30 seconds
    await redis.setex(`realtime:${organizationId}`, 30, JSON.stringify(realtimeData));

    return realtimeData;
  }

  /**
   * Get message volume trends
   */
  static async getMessageVolumeTrends(
    organizationId: string,
    options: TimeRangeOptions
  ): Promise<Array<{ timestamp: Date; messages: number; conversations: number }>> {
    const db = DatabaseService.getClient();
    const { startDate, endDate } = this.getDateRange(options);
    const interval = this.getTimeInterval(options.timeRange);

    const result = await db.query(`
      SELECT 
        date_trunc($4, m.created_at) as timestamp,
        COUNT(m.id) as messages,
        COUNT(DISTINCT c.id) as conversations
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.organization_id = $1 
        AND m.created_at BETWEEN $2 AND $3
      GROUP BY date_trunc($4, m.created_at)
      ORDER BY timestamp
    `, [organizationId, startDate, endDate, interval]);

    return result.rows.map(row => ({
      timestamp: row.timestamp,
      messages: parseInt(row.messages),
      conversations: parseInt(row.conversations),
    }));
  }

  /**
   * Get response time analytics
   */
  static async getResponseTimeAnalytics(
    organizationId: string,
    options: TimeRangeOptions
  ): Promise<{
    average: number;
    median: number;
    p95: number;
    trends: Array<{ timestamp: Date; avgResponseTime: number; medianResponseTime: number }>;
  }> {
    const db = DatabaseService.getClient();
    const { startDate, endDate } = this.getDateRange(options);
    const interval = this.getTimeInterval(options.timeRange);

    // Overall statistics
    const stats = await db.query(`
      SELECT 
        AVG(EXTRACT(EPOCH FROM (m.processed_at - m.created_at)) * 1000) as average,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (m.processed_at - m.created_at)) * 1000) as median,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (m.processed_at - m.created_at)) * 1000) as p95
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.organization_id = $1 
        AND m.created_at BETWEEN $2 AND $3
        AND m.processed_at IS NOT NULL
    `, [organizationId, startDate, endDate]);

    // Trends over time
    const trends = await db.query(`
      SELECT 
        date_trunc($4, m.created_at) as timestamp,
        AVG(EXTRACT(EPOCH FROM (m.processed_at - m.created_at)) * 1000) as avg_response_time,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (m.processed_at - m.created_at)) * 1000) as median_response_time
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.organization_id = $1 
        AND m.created_at BETWEEN $2 AND $3
        AND m.processed_at IS NOT NULL
      GROUP BY date_trunc($4, m.created_at)
      ORDER BY timestamp
    `, [organizationId, startDate, endDate, interval]);

    const statsRow = stats.rows[0];
    return {
      average: parseFloat(statsRow.average || '0'),
      median: parseFloat(statsRow.median || '0'),
      p95: parseFloat(statsRow.p95 || '0'),
      trends: trends.rows.map(row => ({
        timestamp: row.timestamp,
        avgResponseTime: parseFloat(row.avg_response_time || '0'),
        medianResponseTime: parseFloat(row.median_response_time || '0'),
      })),
    };
  }

  /**
   * Get AI accuracy metrics
   */
  static async getAiAccuracyMetrics(
    organizationId: string,
    options: TimeRangeOptions
  ): Promise<{
    overall: number;
    byCategory: Array<{ category: string; accuracy: number; count: number }>;
    trends: Array<{ timestamp: Date; accuracy: number }>;
  }> {
    const db = DatabaseService.getClient();
    const { startDate, endDate } = this.getDateRange(options);
    const interval = this.getTimeInterval(options.timeRange);

    // Overall accuracy
    const overall = await this.calculateAiAccuracy(organizationId, startDate, endDate);

    // Accuracy by category
    const byCategory = await db.query(`
      SELECT 
        ae.event_data->>'category' as category,
        AVG(CASE WHEN ae.event_data->>'accuracy' IS NOT NULL 
            THEN (ae.event_data->>'accuracy')::float 
            ELSE NULL END) as accuracy,
        COUNT(*) as count
      FROM analytics_events ae
      WHERE ae.organization_id = $1 
        AND ae.event_type = 'ai_classification'
        AND ae.created_at BETWEEN $2 AND $3
        AND ae.event_data->>'category' IS NOT NULL
      GROUP BY ae.event_data->>'category'
      ORDER BY count DESC
    `, [organizationId, startDate, endDate]);

    // Accuracy trends
    const trends = await db.query(`
      SELECT 
        date_trunc($4, ae.created_at) as timestamp,
        AVG(CASE WHEN ae.event_data->>'accuracy' IS NOT NULL 
            THEN (ae.event_data->>'accuracy')::float 
            ELSE NULL END) as accuracy
      FROM analytics_events ae
      WHERE ae.organization_id = $1 
        AND ae.event_type = 'ai_classification'
        AND ae.created_at BETWEEN $2 AND $3
      GROUP BY date_trunc($4, ae.created_at)
      ORDER BY timestamp
    `, [organizationId, startDate, endDate, interval]);

    return {
      overall,
      byCategory: byCategory.rows.map(row => ({
        category: row.category,
        accuracy: parseFloat(row.accuracy || '0'),
        count: parseInt(row.count),
      })),
      trends: trends.rows.map(row => ({
        timestamp: row.timestamp,
        accuracy: parseFloat(row.accuracy || '0'),
      })),
    };
  }

  /**
   * Get customer satisfaction metrics
   */
  static async getCustomerSatisfactionMetrics(
    organizationId: string,
    options: TimeRangeOptions
  ): Promise<{
    averageRating: number;
    totalResponses: number;
    distribution: Array<{ rating: number; count: number; percentage: number }>;
    trends: Array<{ timestamp: Date; averageRating: number; responseCount: number }>;
  }> {
    const db = DatabaseService.getClient();
    const { startDate, endDate } = this.getDateRange(options);
    const interval = this.getTimeInterval(options.timeRange);

    // Overall satisfaction
    const overall = await db.query(`
      SELECT 
        AVG(cf.rating) as average_rating,
        COUNT(cf.id) as total_responses
      FROM customer_feedback cf
      JOIN conversations c ON cf.conversation_id = c.id
      WHERE c.organization_id = $1 
        AND cf.created_at BETWEEN $2 AND $3
    `, [organizationId, startDate, endDate]);

    // Rating distribution
    const distribution = await db.query(`
      SELECT 
        cf.rating,
        COUNT(*) as count,
        COUNT(*)::float / SUM(COUNT(*)) OVER () * 100 as percentage
      FROM customer_feedback cf
      JOIN conversations c ON cf.conversation_id = c.id
      WHERE c.organization_id = $1 
        AND cf.created_at BETWEEN $2 AND $3
      GROUP BY cf.rating
      ORDER BY cf.rating
    `, [organizationId, startDate, endDate]);

    // Satisfaction trends
    const trends = await db.query(`
      SELECT 
        date_trunc($4, cf.created_at) as timestamp,
        AVG(cf.rating) as average_rating,
        COUNT(cf.id) as response_count
      FROM customer_feedback cf
      JOIN conversations c ON cf.conversation_id = c.id
      WHERE c.organization_id = $1 
        AND cf.created_at BETWEEN $2 AND $3
      GROUP BY date_trunc($4, cf.created_at)
      ORDER BY timestamp
    `, [organizationId, startDate, endDate, interval]);

    const overallRow = overall.rows[0];
    return {
      averageRating: parseFloat(overallRow.average_rating || '0'),
      totalResponses: parseInt(overallRow.total_responses || '0'),
      distribution: distribution.rows.map(row => ({
        rating: parseInt(row.rating),
        count: parseInt(row.count),
        percentage: parseFloat(row.percentage || '0'),
      })),
      trends: trends.rows.map(row => ({
        timestamp: row.timestamp,
        averageRating: parseFloat(row.average_rating || '0'),
        responseCount: parseInt(row.response_count || '0'),
      })),
    };
  }

  // Helper methods
  private static getDateRange(options: TimeRangeOptions) {
    const now = new Date();
    let startDate: Date;
    let endDate = now;

    switch (options.timeRange) {
      case '1h':
        startDate = subHours(now, 1);
        break;
      case '24h':
        startDate = subHours(now, 24);
        break;
      case '7d':
        startDate = subDays(now, 7);
        break;
      case '30d':
        startDate = subDays(now, 30);
        break;
      case '90d':
        startDate = subDays(now, 90);
        break;
      default:
        startDate = subDays(now, 1);
    }

    // Calculate previous period for trend comparison
    const periodLength = endDate.getTime() - startDate.getTime();
    const previousEndDate = new Date(startDate.getTime());
    const previousStartDate = new Date(startDate.getTime() - periodLength);

    return { startDate, endDate, previousStartDate, previousEndDate };
  }

  private static getTimeInterval(timeRange: string): string {
    switch (timeRange) {
      case '1h':
        return 'minute';
      case '24h':
        return 'hour';
      case '7d':
        return 'day';
      case '30d':
      case '90d':
        return 'day';
      default:
        return 'hour';
    }
  }

  private static calculateTrend(current: any, previous: any, inverse = false): number {
    const curr = parseFloat(current || '0');
    const prev = parseFloat(previous || '0');
    
    if (prev === 0) return curr > 0 ? 100 : 0;
    
    const trend = ((curr - prev) / prev) * 100;
    return inverse ? -trend : trend;
  }

  private static async calculateAiAccuracy(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    const db = DatabaseService.getClient();
    
    const result = await db.query(`
      SELECT AVG(CASE WHEN ae.event_data->>'accuracy' IS NOT NULL 
                      THEN (ae.event_data->>'accuracy')::float 
                      ELSE NULL END) as accuracy
      FROM analytics_events ae
      WHERE ae.organization_id = $1 
        AND ae.event_type = 'ai_classification'
        AND ae.created_at BETWEEN $2 AND $3
    `, [organizationId, startDate, endDate]);

    return parseFloat(result.rows[0]?.accuracy || '0');
  }

  // Additional methods for other dashboard features would be implemented here...
  static async getConversationFlowAnalysis(organizationId: string, options: TimeRangeOptions) {
    // Implementation for conversation flow analysis
    return { flows: [], patterns: [] };
  }

  static async getTopicTrends(organizationId: string, options: TimeRangeOptions) {
    // Implementation for topic trending
    return { topics: [], trends: [] };
  }

  static async getIntegrationHealth(organizationId: string) {
    // Implementation for integration health monitoring
    return { integrations: [], overall: 'healthy' };
  }

  static async getROICalculations(organizationId: string, options: TimeRangeOptions) {
    // Implementation for ROI calculations
    return { roi: 0, savings: 0, efficiency: 0 };
  }

  static async getPerformanceComparison(organizationId: string, options: TimeRangeOptions) {
    // Implementation for team vs AI performance comparison
    return { team: {}, ai: {}, comparison: {} };
  }

  static async getCostAnalysis(organizationId: string, options: TimeRangeOptions) {
    // Implementation for cost analysis
    return { totalCost: 0, breakdown: [], trends: [] };
  }

  static async exportDashboardData(organizationId: string, options: any) {
    // Implementation for data export
    return { data: Buffer.from(''), mimeType: 'text/csv', filename: 'dashboard.csv' };
  }
}
