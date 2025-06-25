/**
 * Feature Toggle Service
 * Manages feature flags, A/B testing, gradual rollouts, and tenant-specific features
 */

import { config } from '@/config';
import { logger } from '@/utils/logger';
import { redis } from '@/services/redis';

export interface FeatureFlag {
  id: string;
  name: string;
  key: string;
  description: string;
  type: 'boolean' | 'string' | 'number' | 'json';
  category: 'core' | 'experimental' | 'premium' | 'enterprise' | 'deprecated';
  status: 'active' | 'inactive' | 'archived';
  defaultValue: any;
  variations: Array<{
    id: string;
    name: string;
    value: any;
    description?: string;
    weight?: number;
  }>;
  targeting: {
    enabled: boolean;
    rules: Array<{
      id: string;
      name: string;
      conditions: Array<{
        attribute: string;
        operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'in' | 'not_in' | 'greater_than' | 'less_than' | 'matches_regex';
        value: any;
      }>;
      variation: string;
      rolloutPercentage?: number;
    }>;
    fallthrough: {
      variation: string;
      rolloutPercentage?: number;
    };
  };
  prerequisites: Array<{
    flagKey: string;
    variation: string;
  }>;
  environments: Record<string, {
    enabled: boolean;
    defaultValue: any;
    targeting: FeatureFlag['targeting'];
  }>;
  metadata: {
    tags: string[];
    owner: string;
    maintainer: string;
    documentation?: string;
    jiraTicket?: string;
    rolloutDate?: Date;
    deprecationDate?: Date;
  };
  analytics: {
    trackEvents: boolean;
    customEvents: string[];
  };
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface FeatureEvaluation {
  flagKey: string;
  value: any;
  variation: string;
  reason: 'targeting' | 'fallthrough' | 'prerequisite_failed' | 'flag_off' | 'default';
  ruleId?: string;
  prerequisiteFailures?: string[];
  timestamp: Date;
}

export interface EvaluationContext {
  tenantId?: string;
  organizationId?: string;
  userId?: string;
  userType?: 'admin' | 'user' | 'guest';
  tier?: 'basic' | 'professional' | 'enterprise' | 'white_label';
  country?: string;
  region?: string;
  browser?: string;
  device?: string;
  version?: string;
  beta?: boolean;
  custom?: Record<string, any>;
}

export interface ABTest {
  id: string;
  name: string;
  description: string;
  flagKey: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'archived';
  hypothesis: string;
  successMetrics: Array<{
    name: string;
    type: 'conversion' | 'engagement' | 'revenue' | 'retention';
    goal: 'increase' | 'decrease';
    target?: number;
  }>;
  variations: Array<{
    id: string;
    name: string;
    description: string;
    allocation: number; // Percentage
    flagValue: any;
  }>;
  targeting: {
    audience: {
      percentage: number;
      rules: Array<{
        attribute: string;
        operator: string;
        value: any;
      }>;
    };
    exclusions: Array<{
      attribute: string;
      operator: string;
      value: any;
    }>;
  };
  schedule: {
    startDate: Date;
    endDate?: Date;
    duration?: number; // days
  };
  results: {
    participants: number;
    conversions: Record<string, number>;
    metrics: Record<string, {
      variation: string;
      value: number;
      confidence: number;
      significance: number;
    }>;
    winner?: string;
    confidence?: number;
  };
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface FeatureUsage {
  flagKey: string;
  tenantId?: string;
  organizationId?: string;
  userId?: string;
  variation: string;
  value: any;
  context: EvaluationContext;
  timestamp: Date;
  sessionId?: string;
  requestId?: string;
}

export interface FeatureAnalytics {
  flagKey: string;
  timeRange: { start: Date; end: Date };
  metrics: {
    totalEvaluations: number;
    uniqueUsers: number;
    uniqueTenants: number;
    variationDistribution: Record<string, {
      count: number;
      percentage: number;
    }>;
    evaluationsByTime: Array<{
      timestamp: Date;
      count: number;
      variations: Record<string, number>;
    }>;
    topTenants: Array<{
      tenantId: string;
      evaluations: number;
      variations: Record<string, number>;
    }>;
    errorRate: number;
    averageResponseTime: number;
  };
  abTestResults?: {
    testId: string;
    participants: number;
    conversions: Record<string, number>;
    significance: number;
    confidence: number;
  };
}

export class FeatureToggleService {
  private static instance: FeatureToggleService;
  private flagCache: Map<string, FeatureFlag> = new Map();
  private evaluationCache: Map<string, FeatureEvaluation> = new Map();
  private usageBuffer: FeatureUsage[] = [];

  private constructor() {
    this.loadFeatureFlags();
    this.startUsageTracking();
    this.startCacheRefresh();
  }

  public static getInstance(): FeatureToggleService {
    if (!FeatureToggleService.instance) {
      FeatureToggleService.instance = new FeatureToggleService();
    }
    return FeatureToggleService.instance;
  }

  /**
   * Create a new feature flag
   */
  public async createFeatureFlag(
    flagData: Omit<FeatureFlag, 'id' | 'createdAt' | 'updatedAt'>,
    createdBy: string
  ): Promise<FeatureFlag> {
    try {
      const flag: FeatureFlag = {
        ...flagData,
        id: this.generateFlagId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy,
      };

      // Validate flag data
      await this.validateFeatureFlag(flag);

      // Store flag
      await this.storeFeatureFlag(flag);

      // Cache flag
      this.flagCache.set(flag.key, flag);

      // Invalidate evaluation cache
      this.invalidateEvaluationCache(flag.key);

      logger.info('Feature flag created', {
        flagId: flag.id,
        key: flag.key,
        name: flag.name,
        type: flag.type,
        category: flag.category,
        createdBy,
      });

      return flag;
    } catch (error) {
      logger.error('Error creating feature flag', {
        flagData,
        createdBy,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Evaluate feature flag for context
   */
  public async evaluateFlag(
    flagKey: string,
    context: EvaluationContext,
    environment: string = 'production'
  ): Promise<FeatureEvaluation> {
    try {
      // Check cache first
      const cacheKey = this.generateEvaluationCacheKey(flagKey, context, environment);
      const cached = this.evaluationCache.get(cacheKey);
      if (cached && this.isCacheValid(cached)) {
        return cached;
      }

      // Get flag
      const flag = await this.getFeatureFlag(flagKey);
      if (!flag) {
        return this.createDefaultEvaluation(flagKey, 'flag_off');
      }

      // Check if flag is active
      if (flag.status !== 'active') {
        return this.createDefaultEvaluation(flagKey, 'flag_off', flag.defaultValue);
      }

      // Get environment configuration
      const envConfig = flag.environments[environment];
      if (!envConfig || !envConfig.enabled) {
        return this.createDefaultEvaluation(flagKey, 'flag_off', flag.defaultValue);
      }

      // Check prerequisites
      const prerequisiteCheck = await this.checkPrerequisites(flag, context, environment);
      if (!prerequisiteCheck.passed) {
        return {
          flagKey,
          value: flag.defaultValue,
          variation: 'default',
          reason: 'prerequisite_failed',
          prerequisiteFailures: prerequisiteCheck.failures,
          timestamp: new Date(),
        };
      }

      // Evaluate targeting rules
      const evaluation = await this.evaluateTargeting(flag, context, environment);

      // Cache evaluation
      this.evaluationCache.set(cacheKey, evaluation);

      // Track usage
      await this.trackUsage(flagKey, evaluation, context);

      return evaluation;
    } catch (error) {
      logger.error('Error evaluating feature flag', {
        flagKey,
        context,
        environment,
        error: error instanceof Error ? error.message : String(error),
      });

      return this.createDefaultEvaluation(flagKey, 'default');
    }
  }

  /**
   * Evaluate multiple flags at once
   */
  public async evaluateFlags(
    flagKeys: string[],
    context: EvaluationContext,
    environment: string = 'production'
  ): Promise<Record<string, FeatureEvaluation>> {
    try {
      const evaluations: Record<string, FeatureEvaluation> = {};

      // Evaluate flags in parallel
      const promises = flagKeys.map(async (flagKey) => {
        const evaluation = await this.evaluateFlag(flagKey, context, environment);
        return { flagKey, evaluation };
      });

      const results = await Promise.all(promises);

      for (const { flagKey, evaluation } of results) {
        evaluations[flagKey] = evaluation;
      }

      return evaluations;
    } catch (error) {
      logger.error('Error evaluating multiple feature flags', {
        flagKeys,
        context,
        environment,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return default evaluations for all flags
      const evaluations: Record<string, FeatureEvaluation> = {};
      for (const flagKey of flagKeys) {
        evaluations[flagKey] = this.createDefaultEvaluation(flagKey, 'default');
      }
      return evaluations;
    }
  }

  /**
   * Create A/B test
   */
  public async createABTest(
    testData: Omit<ABTest, 'id' | 'createdAt' | 'updatedAt' | 'results'>,
    createdBy: string
  ): Promise<ABTest> {
    try {
      const test: ABTest = {
        ...testData,
        id: this.generateTestId(),
        results: {
          participants: 0,
          conversions: {},
          metrics: {},
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy,
      };

      // Validate test data
      await this.validateABTest(test);

      // Store test
      await this.storeABTest(test);

      // Update associated feature flag
      await this.configureABTestFlag(test);

      logger.info('A/B test created', {
        testId: test.id,
        name: test.name,
        flagKey: test.flagKey,
        status: test.status,
        variations: test.variations.length,
        createdBy,
      });

      return test;
    } catch (error) {
      logger.error('Error creating A/B test', {
        testData,
        createdBy,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get feature analytics
   */
  public async getFeatureAnalytics(
    flagKey: string,
    timeRange: { start: Date; end: Date }
  ): Promise<FeatureAnalytics> {
    try {
      // TODO: Implement analytics aggregation from usage data
      
      return {
        flagKey,
        timeRange,
        metrics: {
          totalEvaluations: 0,
          uniqueUsers: 0,
          uniqueTenants: 0,
          variationDistribution: {},
          evaluationsByTime: [],
          topTenants: [],
          errorRate: 0,
          averageResponseTime: 0,
        },
      };
    } catch (error) {
      logger.error('Error getting feature analytics', {
        flagKey,
        timeRange,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update feature flag
   */
  public async updateFeatureFlag(
    flagKey: string,
    updates: Partial<FeatureFlag>,
    updatedBy: string
  ): Promise<FeatureFlag | null> {
    try {
      const flag = await this.getFeatureFlag(flagKey);
      if (!flag) {
        throw new Error('Feature flag not found');
      }

      const updatedFlag: FeatureFlag = {
        ...flag,
        ...updates,
        updatedAt: new Date(),
      };

      // Validate updates
      await this.validateFeatureFlag(updatedFlag);

      // Store updated flag
      await this.storeFeatureFlag(updatedFlag);

      // Update cache
      this.flagCache.set(flagKey, updatedFlag);

      // Invalidate evaluation cache
      this.invalidateEvaluationCache(flagKey);

      logger.info('Feature flag updated', {
        flagKey,
        updates: Object.keys(updates),
        updatedBy,
      });

      return updatedFlag;
    } catch (error) {
      logger.error('Error updating feature flag', {
        flagKey,
        updates,
        updatedBy,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Private helper methods
   */
  private async validateFeatureFlag(flag: FeatureFlag): Promise<void> {
    // TODO: Implement feature flag validation
  }

  private async validateABTest(test: ABTest): Promise<void> {
    // TODO: Implement A/B test validation
  }

  private async evaluateTargeting(
    flag: FeatureFlag,
    context: EvaluationContext,
    environment: string
  ): Promise<FeatureEvaluation> {
    const envConfig = flag.environments[environment] || flag;
    const targeting = envConfig.targeting;

    if (!targeting.enabled) {
      return {
        flagKey: flag.key,
        value: this.getVariationValue(flag, targeting.fallthrough.variation),
        variation: targeting.fallthrough.variation,
        reason: 'fallthrough',
        timestamp: new Date(),
      };
    }

    // Evaluate targeting rules
    for (const rule of targeting.rules) {
      if (await this.evaluateRule(rule, context)) {
        // Check rollout percentage
        if (rule.rolloutPercentage && rule.rolloutPercentage < 100) {
          const hash = this.hashContext(context, flag.key, rule.id);
          if (hash > rule.rolloutPercentage) {
            continue;
          }
        }

        return {
          flagKey: flag.key,
          value: this.getVariationValue(flag, rule.variation),
          variation: rule.variation,
          reason: 'targeting',
          ruleId: rule.id,
          timestamp: new Date(),
        };
      }
    }

    // Fallthrough
    const fallthrough = targeting.fallthrough;
    if (fallthrough.rolloutPercentage && fallthrough.rolloutPercentage < 100) {
      const hash = this.hashContext(context, flag.key, 'fallthrough');
      if (hash > fallthrough.rolloutPercentage) {
        return {
          flagKey: flag.key,
          value: flag.defaultValue,
          variation: 'default',
          reason: 'fallthrough',
          timestamp: new Date(),
        };
      }
    }

    return {
      flagKey: flag.key,
      value: this.getVariationValue(flag, fallthrough.variation),
      variation: fallthrough.variation,
      reason: 'fallthrough',
      timestamp: new Date(),
    };
  }

  private async evaluateRule(rule: any, context: EvaluationContext): Promise<boolean> {
    for (const condition of rule.conditions) {
      if (!this.evaluateCondition(condition, context)) {
        return false;
      }
    }
    return true;
  }

  private evaluateCondition(condition: any, context: EvaluationContext): boolean {
    const contextValue = this.getContextValue(context, condition.attribute);
    
    switch (condition.operator) {
      case 'equals':
        return contextValue === condition.value;
      case 'not_equals':
        return contextValue !== condition.value;
      case 'contains':
        return String(contextValue).includes(String(condition.value));
      case 'not_contains':
        return !String(contextValue).includes(String(condition.value));
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(contextValue);
      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(contextValue);
      case 'greater_than':
        return Number(contextValue) > Number(condition.value);
      case 'less_than':
        return Number(contextValue) < Number(condition.value);
      case 'matches_regex':
        return new RegExp(condition.value).test(String(contextValue));
      default:
        return false;
    }
  }

  private getContextValue(context: EvaluationContext, attribute: string): any {
    const parts = attribute.split('.');
    let value: any = context;
    
    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  private getVariationValue(flag: FeatureFlag, variationId: string): any {
    const variation = flag.variations.find(v => v.id === variationId);
    return variation ? variation.value : flag.defaultValue;
  }

  private hashContext(context: EvaluationContext, flagKey: string, salt: string): number {
    const key = `${context.tenantId || context.organizationId || context.userId || 'anonymous'}:${flagKey}:${salt}`;
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) % 100;
  }

  private async checkPrerequisites(
    flag: FeatureFlag,
    context: EvaluationContext,
    environment: string
  ): Promise<{ passed: boolean; failures: string[] }> {
    const failures: string[] = [];

    for (const prerequisite of flag.prerequisites) {
      const evaluation = await this.evaluateFlag(prerequisite.flagKey, context, environment);
      if (evaluation.variation !== prerequisite.variation) {
        failures.push(prerequisite.flagKey);
      }
    }

    return {
      passed: failures.length === 0,
      failures,
    };
  }

  private createDefaultEvaluation(
    flagKey: string,
    reason: FeatureEvaluation['reason'],
    value: any = false
  ): FeatureEvaluation {
    return {
      flagKey,
      value,
      variation: 'default',
      reason,
      timestamp: new Date(),
    };
  }

  private generateEvaluationCacheKey(
    flagKey: string,
    context: EvaluationContext,
    environment: string
  ): string {
    const contextKey = `${context.tenantId || ''}:${context.organizationId || ''}:${context.userId || ''}`;
    return `eval:${flagKey}:${environment}:${contextKey}`;
  }

  private isCacheValid(evaluation: FeatureEvaluation): boolean {
    const maxAge = 5 * 60 * 1000; // 5 minutes
    return Date.now() - evaluation.timestamp.getTime() < maxAge;
  }

  private invalidateEvaluationCache(flagKey: string): void {
    for (const [key, evaluation] of this.evaluationCache.entries()) {
      if (evaluation.flagKey === flagKey) {
        this.evaluationCache.delete(key);
      }
    }
  }

  private async trackUsage(
    flagKey: string,
    evaluation: FeatureEvaluation,
    context: EvaluationContext
  ): Promise<void> {
    const usage: FeatureUsage = {
      flagKey,
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      userId: context.userId,
      variation: evaluation.variation,
      value: evaluation.value,
      context,
      timestamp: new Date(),
    };

    this.usageBuffer.push(usage);
  }

  private async configureABTestFlag(test: ABTest): Promise<void> {
    // TODO: Configure feature flag for A/B test
  }

  private async getFeatureFlag(flagKey: string): Promise<FeatureFlag | null> {
    // Check cache first
    const cached = this.flagCache.get(flagKey);
    if (cached) {
      return cached;
    }

    // Load from storage
    return await this.loadFeatureFlag(flagKey);
  }

  // ID generators
  private generateFlagId(): string {
    return `flag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateTestId(): string {
    return `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async loadFeatureFlags(): Promise<void> {
    // TODO: Load feature flags from database
  }

  private startUsageTracking(): void {
    setInterval(async () => {
      if (this.usageBuffer.length > 0) {
        const batch = this.usageBuffer.splice(0, 1000);
        await this.flushUsageBatch(batch);
      }
    }, 10000); // Flush every 10 seconds
  }

  private startCacheRefresh(): void {
    setInterval(async () => {
      await this.refreshFlagCache();
    }, 60000); // Refresh every minute
  }

  private async flushUsageBatch(batch: FeatureUsage[]): Promise<void> {
    try {
      // TODO: Store usage batch in database
      logger.debug('Flushed feature usage batch', { count: batch.length });
    } catch (error) {
      logger.error('Error flushing usage batch', {
        count: batch.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async refreshFlagCache(): Promise<void> {
    try {
      // TODO: Refresh flag cache from database
      logger.debug('Refreshed feature flag cache');
    } catch (error) {
      logger.error('Error refreshing flag cache', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Storage methods
  private async storeFeatureFlag(flag: FeatureFlag): Promise<void> {
    await redis.set(`feature_flag:${flag.key}`, flag, { ttl: 24 * 60 * 60 });
  }

  private async storeABTest(test: ABTest): Promise<void> {
    await redis.set(`ab_test:${test.id}`, test, { ttl: 30 * 24 * 60 * 60 });
  }

  // Load methods
  private async loadFeatureFlag(flagKey: string): Promise<FeatureFlag | null> {
    return await redis.get<FeatureFlag>(`feature_flag:${flagKey}`);
  }
}

// Export singleton instance
export const featureToggleService = FeatureToggleService.getInstance();
