/**
 * Response Generation Service Unit Tests
 */

import { responseGenerationService } from '@/services/response-generation';
import { aiProviderManager } from '@/services/ai-provider-manager';
import { performanceMonitoringService } from '@/services/performance-monitoring';

// Mock dependencies
jest.mock('@/services/ai-provider-manager');
jest.mock('@/services/performance-monitoring');

describe('ResponseGenerationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateResponse', () => {
    it('should generate a response successfully', async () => {
      const mockAiResponse = {
        result: {
          content: 'Thank you for contacting us. I can help you check your order status.',
          confidence: 0.9,
          reasoning: 'Generated helpful response',
          suggestedActions: ['Request order number'],
          requiresHumanReview: false,
        },
        cost: { totalCost: 0.005 },
        performance: { latency: 2000 },
        metadata: { model: 'gpt-3.5-turbo' },
      };

      (aiProviderManager.processRequest as jest.Mock).mockResolvedValue(mockAiResponse);

      const request = {
        ...testUtils.createMockMessage(),
        conversationContext: testUtils.createMockConversationContext(),
        organizationContext: testUtils.createMockOrganizationContext(),
      };

      const result = await responseGenerationService.generateResponse(request);

      expect(result).toBeValidResponseResult();
      expect(result.response.content).toContain('Thank you for contacting us');
      expect(result.response.confidence).toBe(0.9);
      expect(result.qualityScore).toBeGreaterThan(0);
    });

    it('should handle knowledge base integration', async () => {
      const mockAiResponse = {
        result: {
          content: 'Based on our return policy, you can return items within 30 days.',
          confidence: 0.85,
          suggestedActions: ['Check return policy'],
          requiresHumanReview: false,
        },
        cost: { totalCost: 0.005 },
        performance: { latency: 2000 },
        metadata: { model: 'gpt-3.5-turbo' },
      };

      (aiProviderManager.processRequest as jest.Mock).mockResolvedValue(mockAiResponse);

      const request = {
        ...testUtils.createMockMessage(),
        messageText: 'Can I return this item?',
        conversationContext: testUtils.createMockConversationContext(),
        organizationContext: {
          ...testUtils.createMockOrganizationContext(),
          knowledgeBase: [
            {
              id: 'kb-return-policy',
              title: 'Return Policy',
              content: '30-day return policy for all items',
              category: 'returns',
              tags: ['return', 'policy', 'refund'],
            },
          ],
        },
      };

      const result = await responseGenerationService.generateResponse(request);

      expect(result.knowledgeBaseUsed).toHaveLength(1);
      expect(result.knowledgeBaseUsed[0].title).toBe('Return Policy');
      expect(result.response.content).toContain('30 days');
    });

    it('should apply brand voice guidelines', async () => {
      const mockAiResponse = {
        result: {
          content: 'Happy to help! Thanks for reaching out to us.',
          confidence: 0.9,
          suggestedActions: [],
          requiresHumanReview: false,
        },
        cost: { totalCost: 0.005 },
        performance: { latency: 2000 },
        metadata: { model: 'gpt-3.5-turbo' },
      };

      (aiProviderManager.processRequest as jest.Mock).mockResolvedValue(mockAiResponse);

      const request = {
        ...testUtils.createMockMessage(),
        conversationContext: testUtils.createMockConversationContext(),
        organizationContext: {
          ...testUtils.createMockOrganizationContext(),
          brandVoice: {
            tone: 'friendly' as const,
            style: 'Casual and approachable',
            preferredPhrases: ['Happy to help!', 'Thanks for reaching out'],
            doNotUse: ['Unfortunately', 'I apologize'],
          },
        },
      };

      const result = await responseGenerationService.generateResponse(request);

      expect(result.response.content).toContain('Happy to help!');
      expect(result.response.content).not.toContain('Unfortunately');
    });

    it('should handle translation when needed', async () => {
      const mockAiResponse = {
        result: {
          content: 'Thank you for your message.',
          confidence: 0.9,
          suggestedActions: [],
          requiresHumanReview: false,
        },
        cost: { totalCost: 0.005 },
        performance: { latency: 2000 },
        metadata: { model: 'gpt-3.5-turbo' },
      };

      const mockTranslationResponse = {
        result: {
          translatedText: 'Gracias por tu mensaje.',
          sourceLanguage: 'en',
          targetLanguage: 'es',
          confidence: 0.95,
        },
        cost: { totalCost: 0.002 },
        performance: { latency: 1000 },
        metadata: { model: 'gpt-3.5-turbo' },
      };

      (aiProviderManager.processRequest as jest.Mock)
        .mockResolvedValueOnce(mockAiResponse)
        .mockResolvedValueOnce(mockTranslationResponse);

      const request = {
        ...testUtils.createMockMessage(),
        conversationContext: {
          ...testUtils.createMockConversationContext(),
          customerInfo: {
            ...testUtils.createMockConversationContext().customerInfo,
            language: 'en',
          },
        },
        organizationContext: testUtils.createMockOrganizationContext(),
        options: {
          targetLanguage: 'es',
        },
      };

      const result = await responseGenerationService.generateResponse(request);

      expect(result.translation).toBeDefined();
      expect(result.translation?.translatedContent).toBe('Gracias por tu mensaje.');
      expect(result.translation?.targetLanguage).toBe('es');
    });

    it('should calculate quality score correctly', async () => {
      const mockAiResponse = {
        result: {
          content: 'Comprehensive response with helpful information and clear next steps.',
          confidence: 0.95,
          suggestedActions: ['Check order status', 'Contact support'],
          requiresHumanReview: false,
        },
        cost: { totalCost: 0.005 },
        performance: { latency: 2000 },
        metadata: { model: 'gpt-3.5-turbo' },
      };

      (aiProviderManager.processRequest as jest.Mock).mockResolvedValue(mockAiResponse);

      const request = {
        ...testUtils.createMockMessage(),
        conversationContext: {
          ...testUtils.createMockConversationContext(),
          customerInfo: {
            ...testUtils.createMockConversationContext().customerInfo,
            tier: 'premium',
          },
        },
        organizationContext: {
          ...testUtils.createMockOrganizationContext(),
          knowledgeBase: [
            {
              id: 'kb-1',
              title: 'FAQ',
              content: 'Helpful information',
              category: 'general',
              tags: ['faq'],
            },
          ],
        },
      };

      const result = await responseGenerationService.generateResponse(request);

      expect(result.qualityScore).toBeGreaterThan(80);
    });

    it('should validate required fields', async () => {
      const invalidRequest = {
        messageId: '',
        organizationId: 'test-org',
        messageText: 'Hello',
        conversationContext: testUtils.createMockConversationContext(),
        organizationContext: testUtils.createMockOrganizationContext(),
      };

      await expect(responseGenerationService.generateResponse(invalidRequest as any))
        .rejects.toThrow('messageId is required');
    });

    it('should require organization business info', async () => {
      const invalidRequest = {
        ...testUtils.createMockMessage(),
        conversationContext: testUtils.createMockConversationContext(),
        organizationContext: {
          businessInfo: {},
          policies: {},
        },
      };

      await expect(responseGenerationService.generateResponse(invalidRequest as any))
        .rejects.toThrow('organizationContext.businessInfo.name is required');
    });
  });

  describe('generateResponseAlternatives', () => {
    it('should generate multiple response alternatives', async () => {
      const mockAiResponse1 = {
        result: {
          content: 'Thank you for your message. How can I help you today?',
          confidence: 0.9,
          suggestedActions: [],
          requiresHumanReview: false,
        },
        cost: { totalCost: 0.005 },
        performance: { latency: 2000 },
        metadata: { model: 'gpt-3.5-turbo' },
      };

      const mockAiResponse2 = {
        result: {
          content: 'Hello! I\'m here to assist you. What can I do for you?',
          confidence: 0.85,
          suggestedActions: [],
          requiresHumanReview: false,
        },
        cost: { totalCost: 0.005 },
        performance: { latency: 2000 },
        metadata: { model: 'gpt-3.5-turbo' },
      };

      (aiProviderManager.processRequest as jest.Mock)
        .mockResolvedValueOnce(mockAiResponse1)
        .mockResolvedValueOnce(mockAiResponse2);

      const request = {
        ...testUtils.createMockMessage(),
        conversationContext: testUtils.createMockConversationContext(),
        organizationContext: testUtils.createMockOrganizationContext(),
      };

      const results = await responseGenerationService.generateResponseAlternatives(request, 2);

      expect(results).toHaveLength(2);
      expect(results[0]).toBeValidResponseResult();
      expect(results[1]).toBeValidResponseResult();
      expect(results[0].response.content).not.toBe(results[1].response.content);
    });
  });

  describe('knowledge base relevance', () => {
    it('should find relevant knowledge base articles', async () => {
      const knowledgeBase = [
        {
          id: 'kb-1',
          title: 'Order Status FAQ',
          content: 'How to check your order status and tracking information',
          category: 'orders',
          tags: ['order', 'status', 'tracking'],
        },
        {
          id: 'kb-2',
          title: 'Return Policy',
          content: 'Information about returns and refunds',
          category: 'returns',
          tags: ['return', 'refund', 'policy'],
        },
        {
          id: 'kb-3',
          title: 'Shipping Information',
          content: 'Shipping times and costs',
          category: 'shipping',
          tags: ['shipping', 'delivery'],
        },
      ];

      const classification = {
        category: 'inquiry',
        intent: 'check_order',
        topics: ['order', 'status'],
      };

      const relevantKnowledge = await (responseGenerationService as any).findRelevantKnowledge(
        'I want to check my order status',
        classification,
        knowledgeBase
      );

      expect(relevantKnowledge).toHaveLength(1);
      expect(relevantKnowledge[0].title).toBe('Order Status FAQ');
      expect(relevantKnowledge[0].relevanceScore).toBeGreaterThan(0);
    });
  });

  describe('performance tracking', () => {
    it('should record performance metrics', async () => {
      const mockAiResponse = {
        result: {
          content: 'Test response',
          confidence: 0.9,
          suggestedActions: [],
          requiresHumanReview: false,
        },
        cost: { totalCost: 0.005 },
        performance: { latency: 2000 },
        metadata: { model: 'gpt-3.5-turbo' },
      };

      (aiProviderManager.processRequest as jest.Mock).mockResolvedValue(mockAiResponse);

      const request = {
        ...testUtils.createMockMessage(),
        conversationContext: testUtils.createMockConversationContext(),
        organizationContext: testUtils.createMockOrganizationContext(),
      };

      await responseGenerationService.generateResponse(request);

      expect(performanceMonitoringService.recordMetrics).toHaveBeenCalledWith(
        request.organizationId,
        'system',
        expect.objectContaining({
          latency: expect.any(Number),
          cost: expect.any(Number),
          quality: expect.any(Number),
        }),
        expect.objectContaining({
          operation: 'response_generation',
          messageId: request.messageId,
        })
      );
    });
  });
});
