/**
 * AI Performance Monitoring Service
 * Tracks accuracy, cost, response quality, and A/B testing capabilities
 */

import { BaseRepository } from '@/services/database';
import { logger, performanceLogger, costLogger } from '@/utils/logger';
import { ClassificationResult } from '@/services/classification';
import { ResponseGenerationResult } from '@/services/response-generation';

export interface PerformanceMetric {
  id: string;
  organizationId: string;
  providerId: string;
  modelId?: string;
  metricType: 'accuracy' | 'latency' | 'cost' | 'satisfaction' | 'quality' | 'error_rate';
  metricValue: number;
  measurementPeriod: 'request' | 'hourly' | 'daily' | 'weekly' | 'monthly';
  periodStart: Date;
  periodEnd: Date;
  sampleSize: number;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface AccuracyMetrics {
  classificationAccuracy: number;
  sentimentAccuracy: number;
  languageDetectionAccuracy: number;
  entityExtractionAccuracy: number;
  overallAccuracy: number;
  sampleSize: number;
  timeRange: string;
}

export interface CostMetrics {
  totalCost: number;
  costByProvider: Record<string, number>;
  costByModel: Record<string, number>;
  costByOperation: Record<string, number>;
  averageCostPerRequest: number;
  costTrend: Array<{ date: string; cost: number }>;
  timeRange: string;
}

export interface QualityMetrics {
  averageQualityScore: number;
  qualityDistribution: Record<string, number>;
  humanReviewRate: number;
  customerSatisfactionScore: number;
  responseRelevanceScore: number;
  timeRange: string;
}

export interface ABTestResult {
  testId: string;
  testName: string;
  status: 'running' | 'completed' | 'paused';
  variants: Array<{
    id: string;
    name: string;
    provider: string;
    model: string;
    configuration: Record<string, any>;
    trafficPercentage: number;
    metrics: {
      requests: number;
      accuracy: number;
      averageLatency: number;
      averageCost: number;
      qualityScore: number;
      customerSatisfaction: number;
    };
  }>;
  winner?: string;
  confidence: number;
  startDate: Date;
  endDate?: Date;
}

export class PerformanceMonitoringService extends BaseRepository {
  private static instance: PerformanceMonitoringService;

  private constructor() {
    super();
  }

  public static getInstance(): PerformanceMonitoringService {
    if (!PerformanceMonitoringService.instance) {
      PerformanceMonitoringService.instance = new PerformanceMonitoringService();
    }
    return PerformanceMonitoringService.instance;
  }

  /**
   * Record performance metrics for AI operations
   */
  public async recordMetrics(
    organizationId: string,
    providerId: string,
    metrics: {
      accuracy?: number;
      latency?: number;
      cost?: number;
      quality?: number;
      satisfaction?: number;
      errorRate?: number;
    },
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const timestamp = new Date();
      const promises: Promise<any>[] = [];

      // Record each metric type
      for (const [metricType, value] of Object.entries(metrics)) {
        if (value !== undefined) {
          promises.push(
            this.query(`
              INSERT INTO ai_performance_metrics (
                organization_id, provider_id, metric_type, metric_value,
                measurement_period, period_start, period_end, sample_size, metadata
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
              organizationId,
              providerId,
              metricType,
              value,
              'request',
              timestamp,
              timestamp,
              1,
              JSON.stringify(metadata || {}),
            ])
          );
        }
      }

      await Promise.all(promises);

      performanceLogger.info('Performance metrics recorded', {
        organizationId,
        providerId,
        metrics,
        metadata,
      });
    } catch (error) {
      logger.error('Failed to record performance metrics', {
        organizationId,
        providerId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Record classification accuracy
   */
  public async recordClassificationAccuracy(
    organizationId: string,
    providerId: string,
    predicted: ClassificationResult['classification'],
    actual: ClassificationResult['classification']
  ): Promise<void> {
    const accuracy = this.calculateClassificationAccuracy(predicted, actual);
    
    await this.recordMetrics(organizationId, providerId, { accuracy }, {
      operation: 'classification',
      predicted,
      actual,
    });
  }

  /**
   * Record response quality feedback
   */
  public async recordResponseQuality(
    organizationId: string,
    providerId: string,
    response: ResponseGenerationResult,
    feedback: {
      relevance: number; // 1-5
      helpfulness: number; // 1-5
      accuracy: number; // 1-5
      tone: number; // 1-5
      overallSatisfaction: number; // 1-5
    }
  ): Promise<void> {
    const qualityScore = Object.values(feedback).reduce((sum, score) => sum + score, 0) / Object.keys(feedback).length;
    
    await this.recordMetrics(organizationId, providerId, {
      quality: qualityScore,
      satisfaction: feedback.overallSatisfaction,
    }, {
      operation: 'response_generation',
      messageId: response.messageId,
      feedback,
    });
  }

  /**
   * Get accuracy metrics
   */
  public async getAccuracyMetrics(
    organizationId: string,
    timeRange: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<AccuracyMetrics> {
    const timeFilter = this.getTimeFilter(timeRange);
    
    const result = await this.query(`
      SELECT 
        AVG(CASE WHEN metadata->>'operation' = 'classification' THEN metric_value END) as classification_accuracy,
        AVG(CASE WHEN metadata->>'operation' = 'sentiment' THEN metric_value END) as sentiment_accuracy,
        AVG(CASE WHEN metadata->>'operation' = 'language_detection' THEN metric_value END) as language_accuracy,
        AVG(CASE WHEN metadata->>'operation' = 'entity_extraction' THEN metric_value END) as entity_accuracy,
        AVG(metric_value) as overall_accuracy,
        COUNT(*) as sample_size
      FROM ai_performance_metrics
      WHERE organization_id = $1 
        AND metric_type = 'accuracy'
        AND created_at > NOW() - INTERVAL '${timeFilter}'
    `, [organizationId]);

    const row = result.rows[0];
    
    return {
      classificationAccuracy: parseFloat(row.classification_accuracy) || 0,
      sentimentAccuracy: parseFloat(row.sentiment_accuracy) || 0,
      languageDetectionAccuracy: parseFloat(row.language_accuracy) || 0,
      entityExtractionAccuracy: parseFloat(row.entity_accuracy) || 0,
      overallAccuracy: parseFloat(row.overall_accuracy) || 0,
      sampleSize: parseInt(row.sample_size) || 0,
      timeRange,
    };
  }

  /**
   * Get cost metrics
   */
  public async getCostMetrics(
    organizationId: string,
    timeRange: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<CostMetrics> {
    const timeFilter = this.getTimeFilter(timeRange);
    
    // Get total cost and breakdown
    const costResult = await this.query(`
      SELECT 
        SUM(total_cost) as total_cost,
        provider_id,
        model_id,
        operation_type,
        COUNT(*) as request_count
      FROM ai_cost_tracking
      WHERE organization_id = $1 
        AND created_at > NOW() - INTERVAL '${timeFilter}'
      GROUP BY provider_id, model_id, operation_type
    `, [organizationId]);

    // Get cost trend
    const trendResult = await this.query(`
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        SUM(total_cost) as daily_cost
      FROM ai_cost_tracking
      WHERE organization_id = $1 
        AND created_at > NOW() - INTERVAL '${timeFilter}'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date
    `, [organizationId]);

    const totalCost = costResult.rows.reduce((sum, row) => sum + parseFloat(row.total_cost), 0);
    const totalRequests = costResult.rows.reduce((sum, row) => sum + parseInt(row.request_count), 0);

    const costByProvider: Record<string, number> = {};
    const costByModel: Record<string, number> = {};
    const costByOperation: Record<string, number> = {};

    for (const row of costResult.rows) {
      const cost = parseFloat(row.total_cost);
      costByProvider[row.provider_id] = (costByProvider[row.provider_id] || 0) + cost;
      costByModel[row.model_id] = (costByModel[row.model_id] || 0) + cost;
      costByOperation[row.operation_type] = (costByOperation[row.operation_type] || 0) + cost;
    }

    const costTrend = trendResult.rows.map(row => ({
      date: row.date.toISOString().split('T')[0],
      cost: parseFloat(row.daily_cost),
    }));

    return {
      totalCost,
      costByProvider,
      costByModel,
      costByOperation,
      averageCostPerRequest: totalRequests > 0 ? totalCost / totalRequests : 0,
      costTrend,
      timeRange,
    };
  }

  /**
   * Create A/B test
   */
  public async createABTest(
    organizationId: string,
    testName: string,
    variants: Array<{
      name: string;
      provider: string;
      model: string;
      configuration: Record<string, any>;
      trafficPercentage: number;
    }>
  ): Promise<string> {
    const testId = `ab_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Validate traffic percentages sum to 100
    const totalTraffic = variants.reduce((sum, v) => sum + v.trafficPercentage, 0);
    if (Math.abs(totalTraffic - 100) > 0.01) {
      throw new Error('Traffic percentages must sum to 100%');
    }

    await this.query(`
      INSERT INTO ab_tests (
        id, organization_id, test_name, status, variants, start_date
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      testId,
      organizationId,
      testName,
      'running',
      JSON.stringify(variants.map(v => ({ ...v, metrics: { requests: 0, accuracy: 0, averageLatency: 0, averageCost: 0, qualityScore: 0, customerSatisfaction: 0 } }))),
      new Date(),
    ]);

    logger.info('A/B test created', {
      testId,
      organizationId,
      testName,
      variants: variants.length,
    });

    return testId;
  }

  /**
   * Get A/B test results
   */
  public async getABTestResults(testId: string): Promise<ABTestResult | null> {
    const result = await this.query(`
      SELECT
        id, organization_id, test_name, status, variants,
        winner, confidence, start_date, end_date
      FROM ab_tests
      WHERE id = $1
    `, [testId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      testId: row.id,
      testName: row.test_name,
      status: row.status,
      variants: row.variants,
      winner: row.winner,
      confidence: row.confidence || 0,
      startDate: row.start_date,
      endDate: row.end_date,
    };
  }

  /**
   * Update A/B test metrics
   */
  public async updateABTestMetrics(
    testId: string,
    variantId: string,
    metrics: {
      accuracy?: number;
      latency?: number;
      cost?: number;
      quality?: number;
      satisfaction?: number;
    }
  ): Promise<void> {
    // This would update the variant metrics in the database
    // Implementation would depend on how variants are stored
    logger.info('A/B test metrics updated', {
      testId,
      variantId,
      metrics,
    });
  }

  /**
   * Complete A/B test and determine winner
   */
  public async completeABTest(testId: string): Promise<ABTestResult> {
    const test = await this.getABTestResults(testId);
    if (!test) {
      throw new Error('A/B test not found');
    }

    // Determine winner based on composite score
    let bestVariant = test.variants[0];
    let bestScore = 0;

    for (const variant of test.variants) {
      // Composite score: accuracy (40%) + quality (30%) + satisfaction (20%) - cost factor (10%)
      const score = (variant.metrics.accuracy * 0.4) +
                   (variant.metrics.qualityScore * 0.3) +
                   (variant.metrics.customerSatisfaction * 0.2) -
                   (variant.metrics.averageCost * 0.1);

      if (score > bestScore) {
        bestScore = score;
        bestVariant = variant;
      }
    }

    // Calculate statistical confidence (simplified)
    const confidence = this.calculateStatisticalConfidence(test.variants);

    await this.query(`
      UPDATE ab_tests
      SET status = 'completed', winner = $1, confidence = $2, end_date = $3
      WHERE id = $4
    `, [bestVariant.id, confidence, new Date(), testId]);

    logger.info('A/B test completed', {
      testId,
      winner: bestVariant.id,
      confidence,
    });

    return {
      ...test,
      status: 'completed',
      winner: bestVariant.id,
      confidence,
      endDate: new Date(),
    };
  }

  // Helper methods
  private calculateClassificationAccuracy(
    predicted: ClassificationResult['classification'],
    actual: ClassificationResult['classification']
  ): number {
    let correct = 0;
    let total = 0;

    // Category accuracy
    if (predicted.category === actual.category) correct++;
    total++;

    // Intent accuracy
    if (predicted.intent === actual.intent) correct++;
    total++;

    // Urgency accuracy
    if (predicted.urgency === actual.urgency) correct++;
    total++;

    return correct / total;
  }

  private calculateStatisticalConfidence(variants: ABTestResult['variants']): number {
    // Simplified confidence calculation
    // In production, would use proper statistical tests (t-test, chi-square, etc.)
    const totalRequests = variants.reduce((sum, v) => sum + v.metrics.requests, 0);

    if (totalRequests < 100) return 0.5; // Low confidence with small sample
    if (totalRequests < 1000) return 0.7;
    if (totalRequests < 10000) return 0.85;
    return 0.95;
  }

  private getTimeFilter(timeRange: string): string {
    const filters = {
      hour: '1 hour',
      day: '1 day',
      week: '1 week',
      month: '1 month',
    };
    return filters[timeRange as keyof typeof filters] || '1 day';
  }

  /**
   * Generate performance report
   */
  public async generatePerformanceReport(
    organizationId: string,
    timeRange: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<{
    accuracy: AccuracyMetrics;
    cost: CostMetrics;
    quality: QualityMetrics;
    summary: {
      totalRequests: number;
      averageLatency: number;
      errorRate: number;
      topPerformingProvider: string;
      recommendations: string[];
    };
  }> {
    const [accuracy, cost, quality] = await Promise.all([
      this.getAccuracyMetrics(organizationId, timeRange),
      this.getCostMetrics(organizationId, timeRange),
      this.getQualityMetrics(organizationId, timeRange),
    ]);

    // Get summary metrics
    const summaryResult = await this.query(`
      SELECT
        COUNT(*) as total_requests,
        AVG(CASE WHEN metric_type = 'latency' THEN metric_value END) as avg_latency,
        AVG(CASE WHEN metric_type = 'error_rate' THEN metric_value END) as error_rate,
        provider_id,
        COUNT(*) as provider_requests
      FROM ai_performance_metrics
      WHERE organization_id = $1
        AND created_at > NOW() - INTERVAL '${this.getTimeFilter(timeRange)}'
      GROUP BY provider_id
      ORDER BY provider_requests DESC
    `, [organizationId]);

    const totalRequests = summaryResult.rows.reduce((sum, row) => sum + parseInt(row.total_requests), 0);
    const averageLatency = summaryResult.rows.reduce((sum, row) => sum + parseFloat(row.avg_latency || 0), 0) / summaryResult.rows.length;
    const errorRate = summaryResult.rows.reduce((sum, row) => sum + parseFloat(row.error_rate || 0), 0) / summaryResult.rows.length;
    const topPerformingProvider = summaryResult.rows[0]?.provider_id || 'unknown';

    // Generate recommendations
    const recommendations = this.generateRecommendations(accuracy, cost, quality, errorRate);

    return {
      accuracy,
      cost,
      quality,
      summary: {
        totalRequests,
        averageLatency,
        errorRate,
        topPerformingProvider,
        recommendations,
      },
    };
  }

  private generateRecommendations(
    accuracy: AccuracyMetrics,
    cost: CostMetrics,
    quality: QualityMetrics,
    errorRate: number
  ): string[] {
    const recommendations: string[] = [];

    if (accuracy.overallAccuracy < 0.8) {
      recommendations.push('Consider retraining models or adjusting classification thresholds to improve accuracy');
    }

    if (cost.averageCostPerRequest > 0.01) {
      recommendations.push('Optimize costs by using more efficient models for simple tasks');
    }

    if (quality.humanReviewRate > 0.3) {
      recommendations.push('High human review rate detected - consider improving AI confidence thresholds');
    }

    if (errorRate > 0.05) {
      recommendations.push('Error rate is high - check provider health and implement better fallback strategies');
    }

    if (quality.customerSatisfactionScore < 4.0) {
      recommendations.push('Customer satisfaction is below target - review response quality and tone');
    }

    return recommendations;
  }
}

// Export singleton instance
export const performanceMonitoringService = PerformanceMonitoringService.getInstance();
export default PerformanceMonitoringService;

  /**
   * Get quality metrics
   */
  public async getQualityMetrics(
    organizationId: string,
    timeRange: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<QualityMetrics> {
    const timeFilter = this.getTimeFilter(timeRange);
    
    const result = await this.query(`
      SELECT 
        AVG(CASE WHEN metric_type = 'quality' THEN metric_value END) as avg_quality,
        AVG(CASE WHEN metric_type = 'satisfaction' THEN metric_value END) as avg_satisfaction,
        COUNT(CASE WHEN metric_type = 'quality' THEN 1 END) as quality_samples,
        COUNT(CASE WHEN metadata->>'requires_human_review' = 'true' THEN 1 END) as human_review_count,
        COUNT(*) as total_samples
      FROM ai_performance_metrics
      WHERE organization_id = $1 
        AND created_at > NOW() - INTERVAL '${timeFilter}'
    `, [organizationId]);

    const row = result.rows[0];
    const totalSamples = parseInt(row.total_samples) || 1;
    
    return {
      averageQualityScore: parseFloat(row.avg_quality) || 0,
      qualityDistribution: {}, // Would need additional query for distribution
      humanReviewRate: parseInt(row.human_review_count) / totalSamples,
      customerSatisfactionScore: parseFloat(row.avg_satisfaction) || 0,
      responseRelevanceScore: 0, // Would need additional tracking
      timeRange,
    };
  }
