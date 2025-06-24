/**
 * Response Generation Engine
 * Context-aware response generation with company knowledge base integration and multi-language support
 */

import { 
  AiProcessingRequest,
  AiProcessingResponse,
  AiProcessingType,
  AiGenerationResult,
  AiTranslationResult,
} from '@/types/ai';
import { aiProviderManager } from '@/services/ai-provider-manager';
import { messageClassificationService, ClassificationResult } from '@/services/classification';
import { BaseRepository } from '@/services/database';
import { logger, aiLogger } from '@/utils/logger';
import { ValidationError } from '@/utils/errors';

export interface ResponseGenerationRequest {
  messageId: string;
  organizationId: string;
  integrationId: string;
  messageText: string;
  messageHtml?: string;
  classification?: ClassificationResult['classification'];
  conversationContext: {
    history: Array<{
      role: 'customer' | 'agent';
      content: string;
      timestamp: Date;
      messageId?: string;
    }>;
    customerInfo?: {
      id?: string;
      name?: string;
      email?: string;
      tier?: string;
      language?: string;
      timezone?: string;
      previousInteractions?: number;
      satisfactionScore?: number;
      customFields?: Record<string, any>;
    };
  };
  organizationContext: {
    businessInfo: {
      name: string;
      industry?: string;
      businessType?: string;
      website?: string;
      supportHours?: string;
    };
    policies: {
      returnPolicy?: string;
      shippingPolicy?: string;
      privacyPolicy?: string;
      termsOfService?: string;
      customPolicies?: Record<string, string>;
    };
    knowledgeBase?: Array<{
      id: string;
      title: string;
      content: string;
      category: string;
      tags: string[];
      relevanceScore?: number;
    }>;
    brandVoice?: {
      tone: 'professional' | 'friendly' | 'casual' | 'formal';
      style: string;
      doNotUse?: string[];
      preferredPhrases?: string[];
    };
  };
  options?: {
    tone?: 'professional' | 'friendly' | 'casual' | 'formal';
    length?: 'short' | 'medium' | 'long';
    includeReasoning?: boolean;
    targetLanguage?: string;
    includeAlternatives?: boolean;
    maxAlternatives?: number;
    preferredProvider?: string;
    preferredModel?: string;
    customInstructions?: string;
  };
}

export interface ResponseGenerationResult {
  messageId: string;
  response: {
    content: string;
    confidence: number;
    reasoning?: string;
    suggestedActions: string[];
    requiresHumanReview: boolean;
    alternatives?: string[];
  };
  knowledgeBaseUsed: Array<{
    id: string;
    title: string;
    relevanceScore: number;
  }>;
  translation?: {
    originalLanguage: string;
    targetLanguage: string;
    translatedContent: string;
    confidence: number;
  };
  processingTime: number;
  cost: number;
  modelUsed: string;
  qualityScore: number;
}

export class ResponseGenerationService extends BaseRepository {
  private static instance: ResponseGenerationService;

  private constructor() {
    super();
  }

  public static getInstance(): ResponseGenerationService {
    if (!ResponseGenerationService.instance) {
      ResponseGenerationService.instance = new ResponseGenerationService();
    }
    return ResponseGenerationService.instance;
  }

  /**
   * Generate a context-aware response to a customer message
   */
  public async generateResponse(request: ResponseGenerationRequest): Promise<ResponseGenerationResult> {
    const startTime = Date.now();
    
    try {
      this.validateRequest(request);

      // Enhance knowledge base with relevant information
      const enhancedKnowledgeBase = await this.findRelevantKnowledge(
        request.messageText,
        request.classification,
        request.organizationContext.knowledgeBase || []
      );

      // Build comprehensive AI request
      const aiRequest = this.buildAiRequest(request, enhancedKnowledgeBase);

      // Generate response
      const response = await aiProviderManager.processRequest(aiRequest);
      const generationResult = response.result as AiGenerationResult;

      // Handle translation if needed
      let translation: ResponseGenerationResult['translation'];
      if (request.options?.targetLanguage && 
          request.options.targetLanguage !== (request.conversationContext.customerInfo?.language || 'en')) {
        translation = await this.translateResponse(
          generationResult.content,
          request.conversationContext.customerInfo?.language || 'en',
          request.options.targetLanguage
        );
      }

      // Generate alternatives if requested
      let alternatives: string[] = [];
      if (request.options?.includeAlternatives) {
        alternatives = await this.generateAlternatives(
          aiRequest,
          request.options.maxAlternatives || 2
        );
      }

      // Calculate quality score
      const qualityScore = this.calculateQualityScore(
        generationResult,
        request,
        enhancedKnowledgeBase
      );

      const result: ResponseGenerationResult = {
        messageId: request.messageId,
        response: {
          content: generationResult.content,
          confidence: generationResult.confidence,
          reasoning: generationResult.reasoning,
          suggestedActions: generationResult.suggestedActions || [],
          requiresHumanReview: generationResult.requiresHumanReview,
          alternatives,
        },
        knowledgeBaseUsed: enhancedKnowledgeBase.map(kb => ({
          id: kb.id,
          title: kb.title,
          relevanceScore: kb.relevanceScore || 0,
        })),
        translation,
        processingTime: Date.now() - startTime,
        cost: response.cost.totalCost,
        modelUsed: response.metadata.model,
        qualityScore,
      };

      // Store response result
      await this.storeResponseResult(result);

      // Log successful generation
      aiLogger.info('Response generated successfully', {
        messageId: request.messageId,
        organizationId: request.organizationId,
        confidence: generationResult.confidence,
        qualityScore,
        knowledgeBaseItems: enhancedKnowledgeBase.length,
        processingTime: result.processingTime,
        cost: result.cost,
      });

      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Response generation failed', {
        messageId: request.messageId,
        organizationId: request.organizationId,
        error: error instanceof Error ? error.message : String(error),
        processingTime,
      });

      throw error;
    }
  }

  /**
   * Generate multiple response alternatives
   */
  public async generateResponseAlternatives(
    request: ResponseGenerationRequest,
    count: number = 3
  ): Promise<ResponseGenerationResult[]> {
    const promises = Array.from({ length: count }, (_, index) => {
      const modifiedRequest = {
        ...request,
        options: {
          ...request.options,
          // Vary temperature for different alternatives
          customInstructions: `${request.options?.customInstructions || ''} Generate alternative ${index + 1} with slightly different approach.`,
        },
      };
      return this.generateResponse(modifiedRequest);
    });

    const results = await Promise.allSettled(promises);
    return results
      .filter((result): result is PromiseFulfilledResult<ResponseGenerationResult> => 
        result.status === 'fulfilled'
      )
      .map(result => result.value);
  }

  /**
   * Get response generation history
   */
  public async getResponseHistory(
    messageId?: string,
    organizationId?: string,
    limit: number = 50
  ): Promise<ResponseGenerationResult[]> {
    let query = `
      SELECT 
        message_id as "messageId",
        content,
        confidence,
        reasoning,
        suggested_actions as "suggestedActions",
        requires_human_review as "requiresHumanReview",
        processing_time_ms as "processingTime",
        model_used as "modelUsed",
        tokens_used as "tokensUsed",
        cost,
        created_at as "createdAt"
      FROM ai_responses
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (messageId) {
      query += ` AND message_id = $${paramIndex++}`;
      params.push(messageId);
    }

    if (organizationId) {
      query += ` AND organization_id = $${paramIndex++}`;
      params.push(organizationId);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await this.query(query, params);
    
    return result.rows.map(row => this.mapDatabaseRowToResult(row));
  }

  /**
   * Get response generation statistics
   */
  public async getResponseStats(
    organizationId: string,
    timeRange: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<{
    totalResponses: number;
    averageConfidence: number;
    averageProcessingTime: number;
    totalCost: number;
    humanReviewRate: number;
    qualityScoreDistribution: Record<string, number>;
  }> {
    const timeFilter = this.getTimeFilter(timeRange);
    
    const result = await this.query(`
      SELECT 
        COUNT(*) as total_responses,
        AVG(confidence) as avg_confidence,
        AVG(processing_time_ms) as avg_processing_time,
        SUM(cost) as total_cost,
        AVG(CASE WHEN requires_human_review THEN 1 ELSE 0 END) as human_review_rate
      FROM ai_responses
      WHERE organization_id = $1 
        AND created_at > NOW() - INTERVAL '${timeFilter}'
    `, [organizationId]);

    const stats = result.rows[0];
    
    return {
      totalResponses: parseInt(stats.total_responses) || 0,
      averageConfidence: parseFloat(stats.avg_confidence) || 0,
      averageProcessingTime: parseFloat(stats.avg_processing_time) || 0,
      totalCost: parseFloat(stats.total_cost) || 0,
      humanReviewRate: parseFloat(stats.human_review_rate) || 0,
      qualityScoreDistribution: {}, // Would need additional query for this
    };
  }

  // Private helper methods
  private validateRequest(request: ResponseGenerationRequest): void {
    if (!request.messageId) {
      throw new ValidationError('messageId is required');
    }
    if (!request.organizationId) {
      throw new ValidationError('organizationId is required');
    }
    if (!request.messageText || request.messageText.trim().length === 0) {
      throw new ValidationError('messageText is required and cannot be empty');
    }
    if (!request.organizationContext?.businessInfo?.name) {
      throw new ValidationError('organizationContext.businessInfo.name is required');
    }
  }

  private async findRelevantKnowledge(
    messageText: string,
    classification?: ResponseGenerationRequest['classification'],
    knowledgeBase: ResponseGenerationRequest['organizationContext']['knowledgeBase'] = []
  ): Promise<Array<ResponseGenerationRequest['organizationContext']['knowledgeBase'][0] & { relevanceScore: number }>> {
    if (knowledgeBase.length === 0) {
      return [];
    }

    // Simple relevance scoring based on keyword matching
    // In production, this could use vector embeddings for better matching
    const messageWords = messageText.toLowerCase().split(/\s+/);
    const categoryKeywords = classification?.category ? [classification.category] : [];
    const intentKeywords = classification?.intent ? [classification.intent] : [];
    const topicKeywords = classification?.topics || [];

    const allKeywords = [...messageWords, ...categoryKeywords, ...intentKeywords, ...topicKeywords];

    const scoredKnowledge = knowledgeBase.map(kb => {
      let score = 0;
      const kbText = `${kb.title} ${kb.content}`.toLowerCase();

      // Keyword matching
      for (const keyword of allKeywords) {
        if (kbText.includes(keyword.toLowerCase())) {
          score += 1;
        }
      }

      // Tag matching
      for (const tag of kb.tags) {
        if (allKeywords.some(keyword => keyword.includes(tag.toLowerCase()))) {
          score += 2; // Tags are more important
        }
      }

      // Category matching
      if (classification?.category && kb.category === classification.category) {
        score += 5;
      }

      return {
        ...kb,
        relevanceScore: score,
      };
    });

    // Return top 5 most relevant items
    return scoredKnowledge
      .filter(kb => kb.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);
  }

  private buildAiRequest(
    request: ResponseGenerationRequest,
    knowledgeBase: Array<ResponseGenerationRequest['organizationContext']['knowledgeBase'][0] & { relevanceScore: number }>
  ): AiProcessingRequest {
    const { organizationContext, conversationContext, options } = request;

    // Build comprehensive context
    const organizationInfo = {
      id: request.organizationId,
      name: organizationContext.businessInfo.name,
      industry: organizationContext.businessInfo.industry,
      businessType: organizationContext.businessInfo.businessType,
      website: organizationContext.businessInfo.website,
      supportHours: organizationContext.businessInfo.supportHours,
      policies: organizationContext.policies,
      knowledgeBase: knowledgeBase.map(kb => `${kb.title}: ${kb.content}`),
      brandVoice: organizationContext.brandVoice?.style,
      customFields: {
        tone: organizationContext.brandVoice?.tone,
        doNotUse: organizationContext.brandVoice?.doNotUse,
        preferredPhrases: organizationContext.brandVoice?.preferredPhrases,
      },
    };

    return {
      type: AiProcessingType.GENERATE_RESPONSE,
      input: {
        text: request.messageText,
        html: request.messageHtml,
      },
      context: {
        conversationHistory: conversationContext.history,
        customerInfo: conversationContext.customerInfo,
        organizationInfo,
        previousClassifications: request.classification ? [request.classification] : undefined,
      },
      options: {
        preferredProvider: options?.preferredProvider,
        preferredModel: options?.preferredModel,
        maxTokens: this.getMaxTokensForLength(options?.length),
        temperature: this.getTemperatureForTone(options?.tone || organizationContext.brandVoice?.tone),
        includeReasoning: options?.includeReasoning,
        customPrompt: this.buildCustomPrompt(request, knowledgeBase),
      },
      organizationId: request.organizationId,
    };
  }

  private getMaxTokensForLength(length?: string): number {
    const lengthMap = {
      short: 200,
      medium: 500,
      long: 1000,
    };
    return lengthMap[length as keyof typeof lengthMap] || 500;
  }

  private getTemperatureForTone(tone?: string): number {
    const toneMap = {
      formal: 0.3,
      professional: 0.5,
      friendly: 0.7,
      casual: 0.8,
    };
    return toneMap[tone as keyof typeof toneMap] || 0.6;
  }

  private buildCustomPrompt(
    request: ResponseGenerationRequest,
    knowledgeBase: Array<ResponseGenerationRequest['organizationContext']['knowledgeBase'][0] & { relevanceScore: number }>
  ): string {
    let prompt = '';

    // Add brand voice instructions
    if (request.organizationContext.brandVoice) {
      const brandVoice = request.organizationContext.brandVoice;
      prompt += `Brand Voice Guidelines:\n`;
      prompt += `- Tone: ${brandVoice.tone}\n`;
      prompt += `- Style: ${brandVoice.style}\n`;

      if (brandVoice.preferredPhrases && brandVoice.preferredPhrases.length > 0) {
        prompt += `- Use these phrases when appropriate: ${brandVoice.preferredPhrases.join(', ')}\n`;
      }

      if (brandVoice.doNotUse && brandVoice.doNotUse.length > 0) {
        prompt += `- Avoid these words/phrases: ${brandVoice.doNotUse.join(', ')}\n`;
      }

      prompt += '\n';
    }

    // Add knowledge base context
    if (knowledgeBase.length > 0) {
      prompt += `Relevant Knowledge Base Information:\n`;
      knowledgeBase.forEach((kb, index) => {
        prompt += `${index + 1}. ${kb.title}\n${kb.content}\n\n`;
      });
    }

    // Add classification context
    if (request.classification) {
      prompt += `Message Classification:\n`;
      prompt += `- Category: ${request.classification.category}\n`;
      prompt += `- Intent: ${request.classification.intent}\n`;
      prompt += `- Urgency: ${request.classification.urgency}\n`;
      if (request.classification.topics.length > 0) {
        prompt += `- Topics: ${request.classification.topics.join(', ')}\n`;
      }
      prompt += '\n';
    }

    // Add customer context
    if (request.conversationContext.customerInfo) {
      const customer = request.conversationContext.customerInfo;
      prompt += `Customer Information:\n`;
      if (customer.name) prompt += `- Name: ${customer.name}\n`;
      if (customer.tier) prompt += `- Tier: ${customer.tier}\n`;
      if (customer.previousInteractions) prompt += `- Previous Interactions: ${customer.previousInteractions}\n`;
      if (customer.satisfactionScore) prompt += `- Satisfaction Score: ${customer.satisfactionScore}/10\n`;
      prompt += '\n';
    }

    // Add custom instructions
    if (request.options?.customInstructions) {
      prompt += `Additional Instructions:\n${request.options.customInstructions}\n\n`;
    }

    // Add response guidelines
    prompt += `Response Guidelines:\n`;
    prompt += `- Be helpful, accurate, and empathetic\n`;
    prompt += `- Address the customer's specific concern\n`;
    prompt += `- Use the knowledge base information when relevant\n`;
    prompt += `- Maintain the brand voice and tone\n`;
    prompt += `- Provide clear next steps when appropriate\n`;
    prompt += `- Keep the response ${request.options?.length || 'medium'} in length\n`;

    return prompt;
  }

  private async translateResponse(
    content: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<ResponseGenerationResult['translation']> {
    try {
      const translationRequest: AiProcessingRequest = {
        type: AiProcessingType.TRANSLATE_TEXT,
        input: { text: content },
        options: {
          customPrompt: targetLanguage,
        },
        organizationId: 'system', // System-level translation
      };

      const response = await aiProviderManager.processRequest(translationRequest);
      const result = response.result as AiTranslationResult;

      return {
        originalLanguage: sourceLanguage,
        targetLanguage: targetLanguage,
        translatedContent: result.translatedText,
        confidence: result.confidence,
      };
    } catch (error) {
      logger.error('Translation failed', {
        sourceLanguage,
        targetLanguage,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return original content if translation fails
      return {
        originalLanguage: sourceLanguage,
        targetLanguage: targetLanguage,
        translatedContent: content,
        confidence: 0,
      };
    }
  }

  private async generateAlternatives(
    baseRequest: AiProcessingRequest,
    count: number
  ): Promise<string[]> {
    const alternatives: string[] = [];

    for (let i = 0; i < count; i++) {
      try {
        const modifiedRequest = {
          ...baseRequest,
          options: {
            ...baseRequest.options,
            temperature: (baseRequest.options?.temperature || 0.6) + (i * 0.1),
            customPrompt: `${baseRequest.options?.customPrompt || ''}\n\nGenerate an alternative response with a slightly different approach.`,
          },
        };

        const response = await aiProviderManager.processRequest(modifiedRequest);
        const result = response.result as AiGenerationResult;

        if (result.content && result.content.trim() !== '') {
          alternatives.push(result.content.trim());
        }
      } catch (error) {
        logger.warn('Failed to generate alternative response', {
          alternativeIndex: i,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return alternatives;
  }

  private calculateQualityScore(
    result: AiGenerationResult,
    request: ResponseGenerationRequest,
    knowledgeBase: Array<any>
  ): number {
    let score = 70; // Base score

    // Confidence factor (30% weight)
    score += (result.confidence - 0.5) * 60; // Scale 0.5-1.0 to 0-30

    // Knowledge base usage factor (20% weight)
    if (knowledgeBase.length > 0) {
      score += 20;
    }

    // Response length appropriateness (10% weight)
    const responseLength = result.content.length;
    const targetLength = this.getTargetLength(request.options?.length);
    const lengthRatio = Math.min(responseLength / targetLength, targetLength / responseLength);
    score += lengthRatio * 10;

    // Customer tier factor (10% weight)
    if (request.conversationContext.customerInfo?.tier === 'enterprise' ||
        request.conversationContext.customerInfo?.tier === 'premium') {
      score += 10;
    }

    // Urgency handling factor (10% weight)
    if (request.classification?.urgency === 'urgent' || request.classification?.urgency === 'critical') {
      score += 10;
    }

    // Suggested actions factor (10% weight)
    if (result.suggestedActions && result.suggestedActions.length > 0) {
      score += 10;
    }

    // Brand voice compliance factor (10% weight)
    if (request.organizationContext.brandVoice) {
      score += 10; // Assume compliance for now
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private getTargetLength(length?: string): number {
    const lengthMap = {
      short: 300,
      medium: 800,
      long: 1500,
    };
    return lengthMap[length as keyof typeof lengthMap] || 800;
  }

  private async storeResponseResult(result: ResponseGenerationResult): Promise<void> {
    try {
      await this.query(`
        INSERT INTO ai_responses (
          message_id, organization_id, content, confidence, reasoning,
          suggested_actions, requires_human_review, processing_time_ms,
          model_used, tokens_used, cost
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (message_id, organization_id)
        DO UPDATE SET
          content = EXCLUDED.content,
          confidence = EXCLUDED.confidence,
          reasoning = EXCLUDED.reasoning,
          suggested_actions = EXCLUDED.suggested_actions,
          requires_human_review = EXCLUDED.requires_human_review,
          processing_time_ms = EXCLUDED.processing_time_ms,
          model_used = EXCLUDED.model_used,
          tokens_used = EXCLUDED.tokens_used,
          cost = EXCLUDED.cost
      `, [
        result.messageId,
        'system', // We'll need to get organization_id from somewhere
        result.response.content,
        result.response.confidence,
        result.response.reasoning,
        JSON.stringify(result.response.suggestedActions),
        result.response.requiresHumanReview,
        result.processingTime,
        result.modelUsed,
        0, // tokens_used - would need to calculate
        result.cost,
      ]);
    } catch (error) {
      logger.error('Failed to store response result', {
        messageId: result.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - response generation succeeded even if storage failed
    }
  }

  private mapDatabaseRowToResult(row: any): ResponseGenerationResult {
    return {
      messageId: row.messageId,
      response: {
        content: row.content,
        confidence: row.confidence,
        reasoning: row.reasoning,
        suggestedActions: row.suggestedActions || [],
        requiresHumanReview: row.requiresHumanReview || false,
      },
      knowledgeBaseUsed: [],
      processingTime: row.processingTime || 0,
      cost: row.cost || 0,
      modelUsed: row.modelUsed || 'unknown',
      qualityScore: 80, // Default score
    };
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
}

// Export singleton instance
export const responseGenerationService = ResponseGenerationService.getInstance();
export default ResponseGenerationService;
