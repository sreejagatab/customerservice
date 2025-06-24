/**
 * Cost Optimization Service Unit Tests
 */

import { costOptimizationService } from '@/services/cost-optimization';
import { AiProcessingType, AiProvider } from '@/types/ai';

describe('CostOptimizationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createOptimizationRule', () => {
    it('should create a cost optimization rule', async () => {
      const rule = {
        organizationId: 'test-org',
        name: 'High Volume Optimization',
        description: 'Use cheaper models for high volume requests',
        type: 'model_selection' as const,
        conditions: {
          operationType: [AiProcessingType.CLASSIFY_MESSAGE],
          messageVolume: { min: 100 },
        },
        actions: {
          preferredModels: ['gpt-3.5-turbo'],
          maxCostPerRequest: 0.001,
        },
        priority: 1,
        isActive: true,
      };

      // Mock database query
      jest.spyOn(costOptimizationService as any, 'query').mockResolvedValue({ rows: [] });

      const id = await costOptimizationService.createOptimizationRule(rule);

      expect(id).toMatch(/^cost_rule_/);
      expect(costOptimizationService['query']).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO cost_optimization_rules'),
        expect.arrayContaining([
          id,
          rule.organizationId,
          rule.name,
          rule.description,
          rule.type,
          JSON.stringify(rule.conditions),
          JSON.stringify(rule.actions),
          rule.priority,
          rule.isActive,
        ])
      );
    });
  });

  describe('optimizeRequest', () => {
    beforeEach(() => {
      // Mock getOptimizationRules
      jest.spyOn(costOptimizationService, 'getOptimizationRules').mockResolvedValue([
        {
          id: 'rule-1',
          organizationId: 'test-org',
          name: 'Premium Customer Rule',
          description: 'Use best models for premium customers',
          type: 'provider_selection',
          conditions: {
            customerTier: ['premium'],
          },
          actions: {
            preferredProviders: [AiProvider.OPENAI],
            preferredModels: ['gpt-4'],
          },
          priority: 1,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'rule-2',
          organizationId: 'test-org',
          name: 'Cost Limit Rule',
          description: 'Limit costs for high volume',
          type: 'budget_limit',
          conditions: {
            messageVolume: { min: 50 },
          },
          actions: {
            maxCostPerRequest: 0.005,
            requireApproval: true,
          },
          priority: 2,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    });

    it('should apply optimization rules for premium customers', async () => {
      const result = await costOptimizationService.optimizeRequest(
        'test-org',
        AiProcessingType.GENERATE_RESPONSE,
        {
          customerTier: 'premium',
          estimatedCost: 0.01,
        }
      );

      expect(result.allowRequest).toBe(true);
      expect(result.recommendedProvider).toBe(AiProvider.OPENAI);
      expect(result.recommendedModel).toBe('gpt-4');
      expect(result.optimizations).toHaveLength(2);
      expect(result.optimizations[0].rule).toBe('Premium Customer Rule');
    });

    it('should apply cost limits for high volume requests', async () => {
      const result = await costOptimizationService.optimizeRequest(
        'test-org',
        AiProcessingType.CLASSIFY_MESSAGE,
        {
          messageVolume: 100,
          estimatedCost: 0.01,
        }
      );

      expect(result.allowRequest).toBe(true);
      expect(result.maxCostLimit).toBe(0.005);
      expect(result.requiresApproval).toBe(true);
      expect(result.optimizations.some(opt => opt.rule === 'Cost Limit Rule')).toBe(true);
    });

    it('should not apply rules when conditions are not met', async () => {
      const result = await costOptimizationService.optimizeRequest(
        'test-org',
        AiProcessingType.ANALYZE_SENTIMENT,
        {
          customerTier: 'standard',
          messageVolume: 10,
        }
      );

      expect(result.allowRequest).toBe(true);
      expect(result.recommendedProvider).toBeUndefined();
      expect(result.optimizations).toHaveLength(0);
    });
  });

  describe('generateCostPrediction', () => {
    beforeEach(() => {
      // Mock historical data
      jest.spyOn(costOptimizationService as any, 'getHistoricalCostData').mockResolvedValue([
        { date: new Date('2024-01-01'), cost: 10 },
        { date: new Date('2024-01-02'), cost: 12 },
        { date: new Date('2024-01-03'), cost: 11 },
        { date: new Date('2024-01-04'), cost: 15 },
        { date: new Date('2024-01-05'), cost: 13 },
      ]);
    });

    it('should generate cost prediction with trend analysis', async () => {
      const prediction = await costOptimizationService.generateCostPrediction(
        'test-org',
        'day'
      );

      expect(prediction).toMatchObject({
        organizationId: 'test-org',
        period: 'day',
        predictedCost: expect.any(Number),
        confidence: expect.any(Number),
        factors: expect.any(Array),
        recommendations: expect.any(Array),
        generatedAt: expect.any(Date),
      });

      expect(prediction.confidence).toBeGreaterThan(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
      expect(prediction.predictedCost).toBeGreaterThan(0);
    });

    it('should include trend factors in prediction', async () => {
      const prediction = await costOptimizationService.generateCostPrediction(
        'test-org',
        'week'
      );

      expect(prediction.factors.some(f => f.factor === 'trend')).toBe(true);
    });

    it('should generate recommendations based on predicted cost', async () => {
      const prediction = await costOptimizationService.generateCostPrediction(
        'test-org',
        'month'
      );

      expect(prediction.recommendations).toBeInstanceOf(Array);
      if (prediction.predictedCost > 50) {
        expect(prediction.recommendations.some(r => 
          r.includes('cost controls') || r.includes('optimize')
        )).toBe(true);
      }
    });
  });

  describe('checkBudgetAlerts', () => {
    beforeEach(() => {
      // Mock budget configurations
      jest.spyOn(costOptimizationService as any, 'getBudgetConfigurations').mockResolvedValue([
        {
          period: 'daily',
          limit: 100,
          warningThreshold: 80,
          criticalThreshold: 95,
        },
        {
          period: 'monthly',
          limit: 2000,
          warningThreshold: 75,
          criticalThreshold: 90,
        },
      ]);

      // Mock current spend
      jest.spyOn(costOptimizationService as any, 'getCurrentSpend')
        .mockResolvedValueOnce(85) // Daily spend: 85% of budget
        .mockResolvedValueOnce(1900); // Monthly spend: 95% of budget

      // Mock store alert
      jest.spyOn(costOptimizationService as any, 'storeBudgetAlert').mockResolvedValue(undefined);
    });

    it('should generate budget alerts when thresholds are exceeded', async () => {
      const alerts = await costOptimizationService.checkBudgetAlerts('test-org');

      expect(alerts).toHaveLength(2);
      
      // Daily alert (85% > 80% warning threshold)
      expect(alerts[0]).toMatchObject({
        type: 'daily',
        alertLevel: 'warning',
        threshold: 85,
        currentSpend: 85,
        budgetLimit: 100,
      });

      // Monthly alert (95% > 90% critical threshold)
      expect(alerts[1]).toMatchObject({
        type: 'monthly',
        alertLevel: 'critical',
        threshold: 95,
        currentSpend: 1900,
        budgetLimit: 2000,
      });
    });

    it('should generate exceeded alert when budget is over 100%', async () => {
      jest.spyOn(costOptimizationService as any, 'getCurrentSpend')
        .mockResolvedValueOnce(110); // 110% of daily budget

      const alerts = await costOptimizationService.checkBudgetAlerts('test-org');

      expect(alerts[0].alertLevel).toBe('exceeded');
      expect(alerts[0].threshold).toBe(110);
    });
  });

  describe('generateOptimizationReport', () => {
    beforeEach(() => {
      // Mock cost data
      jest.spyOn(costOptimizationService as any, 'getCostDataForPeriod').mockResolvedValue([
        {
          provider_id: 'openai',
          model_id: 'gpt-4',
          operation_type: 'classification',
          actual_cost: 50,
          request_count: 100,
          potential_savings: 10,
          actual_savings: 5,
        },
        {
          provider_id: 'anthropic',
          model_id: 'claude-3-sonnet',
          operation_type: 'response_generation',
          actual_cost: 75,
          request_count: 150,
          potential_savings: 15,
          actual_savings: 8,
        },
      ]);
    });

    it('should generate comprehensive optimization report', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const report = await costOptimizationService.generateOptimizationReport(
        'test-org',
        startDate,
        endDate
      );

      expect(report).toMatchObject({
        organizationId: 'test-org',
        period: { start: startDate, end: endDate },
        totalCost: 125, // 50 + 75
        potentialSavings: 25, // 10 + 15
        actualSavings: 13, // 5 + 8
        optimizationRate: expect.any(Number),
        breakdown: {
          byProvider: expect.any(Object),
          byModel: expect.any(Object),
          byOperation: expect.any(Object),
        },
        recommendations: expect.any(Array),
      });

      expect(report.optimizationRate).toBeCloseTo(10.4, 1); // (13/125) * 100
    });

    it('should include breakdown by provider, model, and operation', async () => {
      const report = await costOptimizationService.generateOptimizationReport(
        'test-org',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(report.breakdown.byProvider).toHaveProperty('openai');
      expect(report.breakdown.byProvider).toHaveProperty('anthropic');
      expect(report.breakdown.byModel).toHaveProperty('gpt-4');
      expect(report.breakdown.byModel).toHaveProperty('claude-3-sonnet');
      expect(report.breakdown.byOperation).toHaveProperty('classification');
      expect(report.breakdown.byOperation).toHaveProperty('response_generation');
    });

    it('should generate optimization recommendations', async () => {
      const report = await costOptimizationService.generateOptimizationReport(
        'test-org',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(report.recommendations).toBeInstanceOf(Array);
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations[0]).toMatchObject({
        type: expect.any(String),
        description: expect.any(String),
        potentialSavings: expect.any(Number),
        effort: expect.stringMatching(/^(low|medium|high)$/),
        priority: expect.any(Number),
      });
    });
  });

  describe('rule condition evaluation', () => {
    it('should evaluate operation type conditions', () => {
      const conditions = {
        operationType: [AiProcessingType.CLASSIFY_MESSAGE, AiProcessingType.ANALYZE_SENTIMENT],
      };

      const matches1 = (costOptimizationService as any).evaluateRuleConditions(
        conditions,
        AiProcessingType.CLASSIFY_MESSAGE,
        {}
      );

      const matches2 = (costOptimizationService as any).evaluateRuleConditions(
        conditions,
        AiProcessingType.GENERATE_RESPONSE,
        {}
      );

      expect(matches1).toBe(true);
      expect(matches2).toBe(false);
    });

    it('should evaluate message volume conditions', () => {
      const conditions = {
        messageVolume: { min: 50, max: 200 },
      };

      const matches1 = (costOptimizationService as any).evaluateRuleConditions(
        conditions,
        AiProcessingType.CLASSIFY_MESSAGE,
        { messageVolume: 100 }
      );

      const matches2 = (costOptimizationService as any).evaluateRuleConditions(
        conditions,
        AiProcessingType.CLASSIFY_MESSAGE,
        { messageVolume: 25 }
      );

      const matches3 = (costOptimizationService as any).evaluateRuleConditions(
        conditions,
        AiProcessingType.CLASSIFY_MESSAGE,
        { messageVolume: 250 }
      );

      expect(matches1).toBe(true);
      expect(matches2).toBe(false);
      expect(matches3).toBe(false);
    });

    it('should evaluate customer tier conditions', () => {
      const conditions = {
        customerTier: ['premium', 'enterprise'],
      };

      const matches1 = (costOptimizationService as any).evaluateRuleConditions(
        conditions,
        AiProcessingType.CLASSIFY_MESSAGE,
        { customerTier: 'premium' }
      );

      const matches2 = (costOptimizationService as any).evaluateRuleConditions(
        conditions,
        AiProcessingType.CLASSIFY_MESSAGE,
        { customerTier: 'standard' }
      );

      expect(matches1).toBe(true);
      expect(matches2).toBe(false);
    });
  });
});
