/**
 * Cost Optimization Engine
 * Advanced cost optimization with predictive analytics and budget management
 */

import { BaseRepository } from '@/services/database';
import { logger, costLogger } from '@/utils/logger';
import { AiProvider, AiProcessingType } from '@/types/ai';
import { performanceMonitoringService } from '@/services/performance-monitoring';

export interface CostOptimizationRule {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  type: 'provider_selection' | 'model_selection' | 'batch_optimization' | 'time_based' | 'budget_limit';
  conditions: {
    operationType?: AiProcessingType[];
    messageVolume?: { min?: number; max?: number };
    timeOfDay?: { start: string; end: string };
    urgencyLevel?: string[];
    customerTier?: string[];
    costThreshold?: number;
    accuracyThreshold?: number;
  };
  actions: {
    preferredProviders?: AiProvider[];
    preferredModels?: string[];
    maxCostPerRequest?: number;
    batchSize?: number;
    delayProcessing?: boolean;
    requireApproval?: boolean;
  };
  priority: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetAlert {
  id: string;
  organizationId: string;
  type: 'daily' | 'weekly' | 'monthly' | 'yearly';
  threshold: number; // Percentage of budget
  currentSpend: number;
  budgetLimit: number;
  alertLevel: 'warning' | 'critical' | 'exceeded';
  message: string;
  triggeredAt: Date;
}

export interface CostPrediction {
  organizationId: string;
  period: 'day' | 'week' | 'month';
  predictedCost: number;
  confidence: number;
  factors: Array<{
    factor: string;
    impact: number;
    description: string;
  }>;
  recommendations: string[];
  generatedAt: Date;
}

export interface CostOptimizationReport {
  organizationId: string;
  period: { start: Date; end: Date };
  totalCost: number;
  potentialSavings: number;
  actualSavings: number;
  optimizationRate: number;
  breakdown: {
    byProvider: Record<string, { cost: number; savings: number }>;
    byModel: Record<string, { cost: number; savings: number }>;
    byOperation: Record<string, { cost: number; savings: number }>;
  };
  recommendations: Array<{
    type: string;
    description: string;
    potentialSavings: number;
    effort: 'low' | 'medium' | 'high';
    priority: number;
  }>;
}

export class CostOptimizationService extends BaseRepository {
  private static instance: CostOptimizationService;

  private constructor() {
    super();
  }

  public static getInstance(): CostOptimizationService {
    if (!CostOptimizationService.instance) {
      CostOptimizationService.instance = new CostOptimizationService();
    }
    return CostOptimizationService.instance;
  }

  /**
   * Create cost optimization rule
   */
  public async createOptimizationRule(rule: Omit<CostOptimizationRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = `cost_rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await this.query(`
      INSERT INTO cost_optimization_rules (
        id, organization_id, name, description, rule_type,
        conditions, actions, priority, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      id,
      rule.organizationId,
      rule.name,
      rule.description,
      rule.type,
      JSON.stringify(rule.conditions),
      JSON.stringify(rule.actions),
      rule.priority,
      rule.isActive,
    ]);

    logger.info('Cost optimization rule created', {
      id,
      organizationId: rule.organizationId,
      name: rule.name,
      type: rule.type,
    });

    return id;
  }

  /**
   * Get optimization rules for an organization
   */
  public async getOptimizationRules(organizationId: string, isActive?: boolean): Promise<CostOptimizationRule[]> {
    let query = `
      SELECT 
        id, organization_id as "organizationId", name, description,
        rule_type as "type", conditions, actions, priority, is_active as "isActive",
        created_at as "createdAt", updated_at as "updatedAt"
      FROM cost_optimization_rules
      WHERE organization_id = $1
    `;

    const params: any[] = [organizationId];

    if (isActive !== undefined) {
      query += ` AND is_active = $2`;
      params.push(isActive);
    }

    query += ` ORDER BY priority ASC, created_at DESC`;

    const result = await this.query(query, params);
    return result.rows.map(row => ({
      ...row,
      conditions: row.conditions || {},
      actions: row.actions || {},
    }));
  }

  /**
   * Apply cost optimization rules to a request
   */
  public async optimizeRequest(
    organizationId: string,
    operationType: AiProcessingType,
    context: {
      messageVolume?: number;
      urgencyLevel?: string;
      customerTier?: string;
      estimatedCost?: number;
      timeOfDay?: string;
    }
  ): Promise<{
    allowRequest: boolean;
    optimizations: Array<{
      rule: string;
      action: string;
      impact: string;
    }>;
    recommendedProvider?: AiProvider;
    recommendedModel?: string;
    maxCostLimit?: number;
    requiresApproval?: boolean;
  }> {
    const rules = await this.getOptimizationRules(organizationId, true);
    const optimizations: Array<{ rule: string; action: string; impact: string }> = [];
    
    let allowRequest = true;
    let recommendedProvider: AiProvider | undefined;
    let recommendedModel: string | undefined;
    let maxCostLimit: number | undefined;
    let requiresApproval = false;

    // Apply rules in priority order
    for (const rule of rules) {
      const matches = this.evaluateRuleConditions(rule.conditions, operationType, context);
      
      if (matches) {
        // Apply rule actions
        if (rule.actions.preferredProviders && rule.actions.preferredProviders.length > 0) {
          recommendedProvider = rule.actions.preferredProviders[0];
          optimizations.push({
            rule: rule.name,
            action: `Use preferred provider: ${recommendedProvider}`,
            impact: 'Cost optimization',
          });
        }

        if (rule.actions.preferredModels && rule.actions.preferredModels.length > 0) {
          recommendedModel = rule.actions.preferredModels[0];
          optimizations.push({
            rule: rule.name,
            action: `Use preferred model: ${recommendedModel}`,
            impact: 'Cost optimization',
          });
        }

        if (rule.actions.maxCostPerRequest !== undefined) {
          maxCostLimit = rule.actions.maxCostPerRequest;
          optimizations.push({
            rule: rule.name,
            action: `Apply cost limit: $${maxCostLimit}`,
            impact: 'Budget control',
          });
        }

        if (rule.actions.requireApproval) {
          requiresApproval = true;
          optimizations.push({
            rule: rule.name,
            action: 'Require approval',
            impact: 'Budget control',
          });
        }

        if (rule.actions.delayProcessing) {
          allowRequest = false;
          optimizations.push({
            rule: rule.name,
            action: 'Delay processing',
            impact: 'Cost reduction',
          });
        }
      }
    }

    return {
      allowRequest,
      optimizations,
      recommendedProvider,
      recommendedModel,
      maxCostLimit,
      requiresApproval,
    };
  }

  /**
   * Generate cost predictions
   */
  public async generateCostPrediction(
    organizationId: string,
    period: 'day' | 'week' | 'month'
  ): Promise<CostPrediction> {
    // Get historical data
    const historicalData = await this.getHistoricalCostData(organizationId, period);
    
    // Calculate trend and seasonality
    const trend = this.calculateTrend(historicalData);
    const seasonality = this.calculateSeasonality(historicalData, period);
    
    // Predict based on trend and seasonality
    const basePrediction = trend.slope * this.getPeriodMultiplier(period) + trend.intercept;
    const seasonalAdjustment = seasonality.factor;
    const predictedCost = Math.max(0, basePrediction * seasonalAdjustment);
    
    // Calculate confidence based on data variance
    const confidence = Math.max(0.5, Math.min(0.95, 1 - trend.variance));
    
    // Identify factors
    const factors = this.identifyPredictionFactors(historicalData, trend, seasonality);
    
    // Generate recommendations
    const recommendations = this.generateCostRecommendations(predictedCost, historicalData);

    return {
      organizationId,
      period,
      predictedCost,
      confidence,
      factors,
      recommendations,
      generatedAt: new Date(),
    };
  }

  /**
   * Check budget alerts
   */
  public async checkBudgetAlerts(organizationId: string): Promise<BudgetAlert[]> {
    const alerts: BudgetAlert[] = [];
    
    // Get budget configurations
    const budgets = await this.getBudgetConfigurations(organizationId);
    
    for (const budget of budgets) {
      const currentSpend = await this.getCurrentSpend(organizationId, budget.period);
      const percentage = (currentSpend / budget.limit) * 100;
      
      let alertLevel: BudgetAlert['alertLevel'] | null = null;
      
      if (percentage >= 100) {
        alertLevel = 'exceeded';
      } else if (percentage >= budget.criticalThreshold) {
        alertLevel = 'critical';
      } else if (percentage >= budget.warningThreshold) {
        alertLevel = 'warning';
      }
      
      if (alertLevel) {
        alerts.push({
          id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          organizationId,
          type: budget.period,
          threshold: percentage,
          currentSpend,
          budgetLimit: budget.limit,
          alertLevel,
          message: this.generateAlertMessage(alertLevel, percentage, budget.period),
          triggeredAt: new Date(),
        });
      }
    }
    
    // Store alerts
    for (const alert of alerts) {
      await this.storeBudgetAlert(alert);
    }
    
    return alerts;
  }

  /**
   * Generate comprehensive cost optimization report
   */
  public async generateOptimizationReport(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CostOptimizationReport> {
    // Get cost data for the period
    const costData = await this.getCostDataForPeriod(organizationId, startDate, endDate);

    // Calculate total cost and savings
    const totalCost = costData.reduce((sum, item) => sum + item.actualCost, 0);
    const potentialSavings = costData.reduce((sum, item) => sum + (item.potentialSavings || 0), 0);
    const actualSavings = costData.reduce((sum, item) => sum + (item.actualSavings || 0), 0);

    const optimizationRate = totalCost > 0 ? (actualSavings / totalCost) * 100 : 0;

    // Generate breakdown by provider, model, and operation
    const breakdown = this.generateCostBreakdown(costData);

    // Generate recommendations
    const recommendations = this.generateOptimizationRecommendations(costData, breakdown);

    return {
      organizationId,
      period: { start: startDate, end: endDate },
      totalCost,
      potentialSavings,
      actualSavings,
      optimizationRate,
      breakdown,
      recommendations,
    };
  }

  // Helper methods
  private evaluateRuleConditions(
    conditions: CostOptimizationRule['conditions'],
    operationType: AiProcessingType,
    context: any
  ): boolean {
    // Check operation type
    if (conditions.operationType && !conditions.operationType.includes(operationType)) {
      return false;
    }

    // Check message volume
    if (conditions.messageVolume && context.messageVolume !== undefined) {
      const { min, max } = conditions.messageVolume;
      if (min !== undefined && context.messageVolume < min) return false;
      if (max !== undefined && context.messageVolume > max) return false;
    }

    // Check time of day
    if (conditions.timeOfDay && context.timeOfDay) {
      const currentTime = context.timeOfDay;
      const { start, end } = conditions.timeOfDay;
      if (currentTime < start || currentTime > end) return false;
    }

    // Check urgency level
    if (conditions.urgencyLevel && context.urgencyLevel) {
      if (!conditions.urgencyLevel.includes(context.urgencyLevel)) return false;
    }

    // Check customer tier
    if (conditions.customerTier && context.customerTier) {
      if (!conditions.customerTier.includes(context.customerTier)) return false;
    }

    // Check cost threshold
    if (conditions.costThreshold && context.estimatedCost !== undefined) {
      if (context.estimatedCost > conditions.costThreshold) return false;
    }

    return true;
  }

  private async getHistoricalCostData(organizationId: string, period: string): Promise<Array<{ date: Date; cost: number }>> {
    const days = period === 'day' ? 30 : period === 'week' ? 84 : 365; // 30 days, 12 weeks, or 12 months

    const result = await this.query(`
      SELECT
        DATE_TRUNC('${period === 'day' ? 'day' : period === 'week' ? 'week' : 'month'}', created_at) as date,
        SUM(total_cost) as cost
      FROM ai_cost_tracking
      WHERE organization_id = $1
        AND created_at > NOW() - INTERVAL '${days} days'
      GROUP BY DATE_TRUNC('${period === 'day' ? 'day' : period === 'week' ? 'week' : 'month'}', created_at)
      ORDER BY date
    `, [organizationId]);

    return result.rows.map(row => ({
      date: row.date,
      cost: parseFloat(row.cost),
    }));
  }

  private calculateTrend(data: Array<{ date: Date; cost: number }>): { slope: number; intercept: number; variance: number } {
    if (data.length < 2) {
      return { slope: 0, intercept: 0, variance: 1 };
    }

    const n = data.length;
    const sumX = data.reduce((sum, _, i) => sum + i, 0);
    const sumY = data.reduce((sum, item) => sum + item.cost, 0);
    const sumXY = data.reduce((sum, item, i) => sum + (i * item.cost), 0);
    const sumXX = data.reduce((sum, _, i) => sum + (i * i), 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate variance
    const predictions = data.map((_, i) => slope * i + intercept);
    const variance = data.reduce((sum, item, i) => sum + Math.pow(item.cost - predictions[i], 2), 0) / n;
    const normalizedVariance = variance / (sumY / n); // Normalize by mean

    return { slope, intercept, variance: normalizedVariance };
  }

  private calculateSeasonality(data: Array<{ date: Date; cost: number }>, period: string): { factor: number } {
    // Simple seasonality calculation - in production, use more sophisticated methods
    if (data.length < 4) {
      return { factor: 1 };
    }

    const recentData = data.slice(-4); // Last 4 periods
    const olderData = data.slice(0, -4);

    const recentAvg = recentData.reduce((sum, item) => sum + item.cost, 0) / recentData.length;
    const olderAvg = olderData.reduce((sum, item) => sum + item.cost, 0) / olderData.length;

    const factor = olderAvg > 0 ? recentAvg / olderAvg : 1;

    return { factor: Math.max(0.5, Math.min(2, factor)) }; // Clamp between 0.5 and 2
  }

  private getPeriodMultiplier(period: string): number {
    return period === 'day' ? 1 : period === 'week' ? 7 : 30;
  }

  private identifyPredictionFactors(
    historicalData: Array<{ date: Date; cost: number }>,
    trend: any,
    seasonality: any
  ): Array<{ factor: string; impact: number; description: string }> {
    const factors = [];

    if (Math.abs(trend.slope) > 0.01) {
      factors.push({
        factor: 'trend',
        impact: trend.slope,
        description: trend.slope > 0 ? 'Increasing cost trend' : 'Decreasing cost trend',
      });
    }

    if (Math.abs(seasonality.factor - 1) > 0.1) {
      factors.push({
        factor: 'seasonality',
        impact: seasonality.factor - 1,
        description: seasonality.factor > 1 ? 'Seasonal increase expected' : 'Seasonal decrease expected',
      });
    }

    if (trend.variance > 0.5) {
      factors.push({
        factor: 'volatility',
        impact: trend.variance,
        description: 'High cost volatility detected',
      });
    }

    return factors;
  }

  private generateCostRecommendations(predictedCost: number, historicalData: Array<{ date: Date; cost: number }>): string[] {
    const recommendations = [];
    const avgCost = historicalData.reduce((sum, item) => sum + item.cost, 0) / historicalData.length;

    if (predictedCost > avgCost * 1.2) {
      recommendations.push('Consider implementing stricter cost controls');
      recommendations.push('Review and optimize high-cost AI operations');
    }

    if (predictedCost > avgCost * 1.5) {
      recommendations.push('Set up budget alerts for early warning');
      recommendations.push('Consider using more cost-effective AI models');
    }

    return recommendations;
  }

  private async getBudgetConfigurations(organizationId: string): Promise<Array<{
    period: 'daily' | 'weekly' | 'monthly' | 'yearly';
    limit: number;
    warningThreshold: number;
    criticalThreshold: number;
  }>> {
    const result = await this.query(`
      SELECT period_type as period, budget_limit as "limit",
             warning_threshold as "warningThreshold", critical_threshold as "criticalThreshold"
      FROM budget_configurations
      WHERE organization_id = $1 AND is_active = true
    `, [organizationId]);

    return result.rows;
  }

  private async getCurrentSpend(organizationId: string, period: string): Promise<number> {
    const timeFilter = this.getTimeFilterForPeriod(period);

    const result = await this.query(`
      SELECT COALESCE(SUM(total_cost), 0) as total
      FROM ai_cost_tracking
      WHERE organization_id = $1 AND created_at > NOW() - INTERVAL '${timeFilter}'
    `, [organizationId]);

    return parseFloat(result.rows[0].total);
  }

  private getTimeFilterForPeriod(period: string): string {
    const filters = {
      daily: '1 day',
      weekly: '1 week',
      monthly: '1 month',
      yearly: '1 year',
    };
    return filters[period as keyof typeof filters] || '1 day';
  }

  private generateAlertMessage(level: string, percentage: number, period: string): string {
    const messages = {
      warning: `Warning: ${percentage.toFixed(1)}% of ${period} budget used`,
      critical: `Critical: ${percentage.toFixed(1)}% of ${period} budget used`,
      exceeded: `Budget exceeded: ${percentage.toFixed(1)}% of ${period} budget used`,
    };
    return messages[level as keyof typeof messages] || 'Budget alert';
  }

  private async storeBudgetAlert(alert: BudgetAlert): Promise<void> {
    await this.query(`
      INSERT INTO budget_alerts (
        id, organization_id, alert_type, threshold_percentage,
        current_spend, budget_limit, alert_level, message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      alert.id,
      alert.organizationId,
      alert.type,
      alert.threshold,
      alert.currentSpend,
      alert.budgetLimit,
      alert.alertLevel,
      alert.message,
    ]);
  }

  private async getCostDataForPeriod(organizationId: string, startDate: Date, endDate: Date): Promise<any[]> {
    const result = await this.query(`
      SELECT
        provider_id, model_id, operation_type,
        SUM(total_cost) as actual_cost,
        COUNT(*) as request_count
      FROM ai_cost_tracking
      WHERE organization_id = $1
        AND created_at BETWEEN $2 AND $3
      GROUP BY provider_id, model_id, operation_type
    `, [organizationId, startDate, endDate]);

    return result.rows;
  }

  private generateCostBreakdown(costData: any[]): CostOptimizationReport['breakdown'] {
    const byProvider: Record<string, { cost: number; savings: number }> = {};
    const byModel: Record<string, { cost: number; savings: number }> = {};
    const byOperation: Record<string, { cost: number; savings: number }> = {};

    for (const item of costData) {
      // By provider
      if (!byProvider[item.provider_id]) {
        byProvider[item.provider_id] = { cost: 0, savings: 0 };
      }
      byProvider[item.provider_id].cost += item.actual_cost;

      // By model
      if (!byModel[item.model_id]) {
        byModel[item.model_id] = { cost: 0, savings: 0 };
      }
      byModel[item.model_id].cost += item.actual_cost;

      // By operation
      if (!byOperation[item.operation_type]) {
        byOperation[item.operation_type] = { cost: 0, savings: 0 };
      }
      byOperation[item.operation_type].cost += item.actual_cost;
    }

    return { byProvider, byModel, byOperation };
  }

  private generateOptimizationRecommendations(costData: any[], breakdown: any): CostOptimizationReport['recommendations'] {
    const recommendations = [];

    // Find highest cost areas
    const sortedProviders = Object.entries(breakdown.byProvider)
      .sort(([,a], [,b]) => (b as any).cost - (a as any).cost);

    if (sortedProviders.length > 0) {
      const [topProvider, topProviderData] = sortedProviders[0];
      recommendations.push({
        type: 'provider_optimization',
        description: `Optimize usage of ${topProvider} (highest cost provider)`,
        potentialSavings: (topProviderData as any).cost * 0.15, // Estimate 15% savings
        effort: 'medium' as const,
        priority: 1,
      });
    }

    return recommendations;
  }
}

// Export singleton instance
export const costOptimizationService = CostOptimizationService.getInstance();
export default CostOptimizationService;
