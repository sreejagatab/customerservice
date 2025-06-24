/**
 * Message Classification Service Unit Tests
 */

import { messageClassificationService } from '@/services/classification';
import { aiProviderManager } from '@/services/ai-provider-manager';
import { performanceMonitoringService } from '@/services/performance-monitoring';

// Mock dependencies
jest.mock('@/services/ai-provider-manager');
jest.mock('@/services/performance-monitoring');

describe('MessageClassificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('classifyMessage', () => {
    it('should classify a message successfully', async () => {
      // Mock AI provider response
      const mockAiResponse = {
        result: {
          category: 'inquiry',
          subcategory: 'order_status',
          intent: 'check_order',
          confidence: 0.85,
          urgency: 'normal',
          topics: ['order', 'status'],
          reasoning: 'Customer asking about order status',
          alternativeCategories: [],
        },
        cost: { totalCost: 0.002 },
        performance: { latency: 1500 },
        metadata: { model: 'gpt-3.5-turbo' },
      };

      (aiProviderManager.processRequest as jest.Mock).mockResolvedValue(mockAiResponse);

      const request = testUtils.createMockMessage();
      const result = await messageClassificationService.classifyMessage(request);

      expect(result).toBeValidClassificationResult();
      expect(result.classification.category).toBe('inquiry');
      expect(result.classification.confidence).toBe(0.85);
      expect(result.sentiment).toBeDefined();
      expect(result.language).toBeDefined();
      expect(result.priority).toBeDefined();
    });

    it('should handle classification errors gracefully', async () => {
      (aiProviderManager.processRequest as jest.Mock).mockRejectedValue(
        new Error('AI provider error')
      );

      const request = testUtils.createMockMessage();

      await expect(messageClassificationService.classifyMessage(request))
        .rejects.toThrow('AI provider error');
    });

    it('should validate required fields', async () => {
      const invalidRequest = {
        messageId: '',
        organizationId: 'test-org',
        messageText: '',
      };

      await expect(messageClassificationService.classifyMessage(invalidRequest as any))
        .rejects.toThrow('messageId is required');
    });

    it('should calculate priority correctly', async () => {
      const mockAiResponse = {
        result: {
          category: 'complaint',
          intent: 'escalate',
          confidence: 0.9,
          urgency: 'urgent',
          topics: ['billing', 'refund'],
        },
        cost: { totalCost: 0.002 },
        performance: { latency: 1500 },
        metadata: { model: 'gpt-3.5-turbo' },
      };

      (aiProviderManager.processRequest as jest.Mock).mockResolvedValue(mockAiResponse);

      const request = {
        ...testUtils.createMockMessage(),
        sender: { tier: 'premium' },
      };

      const result = await messageClassificationService.classifyMessage(request);

      expect(result.priority.level).toBe('urgent');
      expect(result.priority.score).toBeGreaterThan(75);
      expect(result.requiresHumanReview).toBe(true);
    });

    it('should handle batch classification', async () => {
      const mockAiResponse = {
        result: {
          category: 'inquiry',
          intent: 'general',
          confidence: 0.8,
          urgency: 'normal',
          topics: [],
        },
        cost: { totalCost: 0.002 },
        performance: { latency: 1500 },
        metadata: { model: 'gpt-3.5-turbo' },
      };

      (aiProviderManager.processRequest as jest.Mock).mockResolvedValue(mockAiResponse);

      const requests = [
        testUtils.createMockMessage(),
        { ...testUtils.createMockMessage(), messageId: 'test-2' },
        { ...testUtils.createMockMessage(), messageId: 'test-3' },
      ];

      const results = await messageClassificationService.classifyMessages(requests);

      expect(results).toHaveLength(3);
      expect(results[0]).toBeValidClassificationResult();
      expect(aiProviderManager.processRequest).toHaveBeenCalledTimes(9); // 3 messages × 3 operations each
    });
  });

  describe('getClassificationStats', () => {
    it('should return classification statistics', async () => {
      const mockStats = {
        totalClassifications: 100,
        categoryBreakdown: { inquiry: 50, complaint: 30, compliment: 20 },
        urgencyBreakdown: { normal: 70, high: 20, urgent: 10 },
        sentimentBreakdown: { positive: 40, neutral: 40, negative: 20 },
        averageConfidence: 0.85,
        averageProcessingTime: 1500,
        totalCost: 0.50,
      };

      // Mock database query
      jest.spyOn(messageClassificationService as any, 'query').mockResolvedValue({
        rows: [
          {
            total_classifications: 100,
            avg_confidence: 0.85,
            avg_processing_time: 1500,
            total_cost: 0.50,
            category: 'inquiry',
            urgency: 'normal',
            sentiment_label: 'neutral',
          },
        ],
      });

      jest.spyOn(messageClassificationService as any, 'aggregateStats').mockReturnValue(mockStats);

      const stats = await messageClassificationService.getClassificationStats('test-org', 'day');

      expect(stats).toMatchObject({
        totalClassifications: expect.any(Number),
        categoryBreakdown: expect.any(Object),
        urgencyBreakdown: expect.any(Object),
        sentimentBreakdown: expect.any(Object),
        averageConfidence: expect.any(Number),
        averageProcessingTime: expect.any(Number),
        totalCost: expect.any(Number),
      });
    });
  });

  describe('priority calculation', () => {
    it('should assign high priority to premium customers', () => {
      const classification = {
        category: 'inquiry',
        urgency: 'normal' as const,
        confidence: 0.8,
      };

      const sentiment = {
        score: 0.1,
        label: 'neutral' as const,
        confidence: 0.8,
      };

      const sender = { tier: 'premium' };

      const priority = (messageClassificationService as any).calculatePriority(
        classification,
        sentiment,
        sender
      );

      expect(priority.level).toBe('high');
      expect(priority.factors).toContain('premium customer');
    });

    it('should assign critical priority for urgent complaints', () => {
      const classification = {
        category: 'complaint',
        urgency: 'urgent' as const,
        confidence: 0.9,
      };

      const sentiment = {
        score: -0.8,
        label: 'negative' as const,
        confidence: 0.9,
      };

      const priority = (messageClassificationService as any).calculatePriority(
        classification,
        sentiment
      );

      expect(priority.level).toBe('critical');
      expect(priority.score).toBeGreaterThan(90);
    });

    it('should assign low priority for positive compliments', () => {
      const classification = {
        category: 'compliment',
        urgency: 'low' as const,
        confidence: 0.9,
      };

      const sentiment = {
        score: 0.8,
        label: 'positive' as const,
        confidence: 0.9,
      };

      const priority = (messageClassificationService as any).calculatePriority(
        classification,
        sentiment
      );

      expect(priority.level).toBe('low');
      expect(priority.score).toBeLessThan(40);
    });
  });

  describe('validation', () => {
    it('should validate message text length', async () => {
      const request = {
        ...testUtils.createMockMessage(),
        messageText: 'a'.repeat(50001), // Exceeds 50,000 character limit
      };

      await expect(messageClassificationService.classifyMessage(request))
        .rejects.toThrow('messageText is too long');
    });

    it('should require organizationId', async () => {
      const request = {
        ...testUtils.createMockMessage(),
        organizationId: '',
      };

      await expect(messageClassificationService.classifyMessage(request))
        .rejects.toThrow('organizationId is required');
    });

    it('should require non-empty messageText', async () => {
      const request = {
        ...testUtils.createMockMessage(),
        messageText: '   ',
      };

      await expect(messageClassificationService.classifyMessage(request))
        .rejects.toThrow('messageText is required and cannot be empty');
    });
  });

  describe('performance tracking', () => {
    it('should record performance metrics', async () => {
      const mockAiResponse = {
        result: {
          category: 'inquiry',
          confidence: 0.85,
          urgency: 'normal',
        },
        cost: { totalCost: 0.002 },
        performance: { latency: 1500 },
        metadata: { model: 'gpt-3.5-turbo' },
      };

      (aiProviderManager.processRequest as jest.Mock).mockResolvedValue(mockAiResponse);

      const request = testUtils.createMockMessage();
      await messageClassificationService.classifyMessage(request);

      expect(performanceMonitoringService.recordMetrics).toHaveBeenCalledWith(
        request.organizationId,
        'system',
        expect.objectContaining({
          latency: expect.any(Number),
          cost: expect.any(Number),
          accuracy: expect.any(Number),
        }),
        expect.objectContaining({
          operation: 'classification',
          messageId: request.messageId,
        })
      );
    });
  });
});
