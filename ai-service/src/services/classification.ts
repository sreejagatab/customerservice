/**
 * Message Classification Service
 * Intelligent message categorization with sentiment analysis, priority scoring, and confidence scoring
 */

import { 
  AiProcessingRequest,
  AiProcessingResponse,
  AiProcessingType,
  AiClassificationResult,
  AiSentimentResult,
  AiLanguageDetectionResult,
  AiEntityExtractionResult,
} from '@/types/ai';
import { aiProviderManager } from '@/services/ai-provider-manager';
import { BaseRepository } from '@/services/database';
import { logger, aiLogger } from '@/utils/logger';
import { AiProviderError, ValidationError } from '@/utils/errors';

export interface ClassificationRequest {
  messageId: string;
  organizationId: string;
  integrationId: string;
  messageText: string;
  messageHtml?: string;
  sender?: {
    email?: string;
    name?: string;
    userId?: string;
    tier?: string;
  };
  context?: {
    conversationHistory?: Array<{
      role: 'customer' | 'agent';
      content: string;
      timestamp: Date;
    }>;
    customerInfo?: Record<string, any>;
    organizationContext?: Record<string, any>;
  };
  options?: {
    includeEntities?: boolean;
    includeSentiment?: boolean;
    includeLanguageDetection?: boolean;
    confidenceThreshold?: number;
    preferredProvider?: string;
    preferredModel?: string;
  };
}

export interface ClassificationResult {
  messageId: string;
  classification: {
    category: string;
    subcategory?: string;
    intent: string;
    confidence: number;
    urgency: 'low' | 'normal' | 'high' | 'urgent' | 'critical';
    topics: string[];
    reasoning?: string;
    alternativeCategories?: Array<{
      category: string;
      confidence: number;
    }>;
  };
  sentiment: {
    score: number; // -1 to 1
    label: 'positive' | 'negative' | 'neutral';
    confidence: number;
    emotions?: Array<{
      emotion: string;
      score: number;
    }>;
  };
  language: {
    detected: string;
    confidence: number;
    alternatives?: Array<{
      language: string;
      confidence: number;
    }>;
  };
  entities?: Array<{
    text: string;
    label: string;
    confidence: number;
    start: number;
    end: number;
  }>;
  priority: {
    score: number; // 0-100
    level: 'low' | 'normal' | 'high' | 'urgent' | 'critical';
    factors: string[];
  };
  processingTime: number;
  cost: number;
  modelUsed: string;
  requiresHumanReview: boolean;
}

export class MessageClassificationService extends BaseRepository {
  private static instance: MessageClassificationService;

  private constructor() {
    super();
  }

  public static getInstance(): MessageClassificationService {
    if (!MessageClassificationService.instance) {
      MessageClassificationService.instance = new MessageClassificationService();
    }
    return MessageClassificationService.instance;
  }

  /**
   * Classify a message with comprehensive analysis
   */
  public async classifyMessage(request: ClassificationRequest): Promise<ClassificationResult> {
    const startTime = Date.now();
    
    try {
      this.validateRequest(request);

      // Build AI processing request
      const aiRequest: AiProcessingRequest = {
        type: AiProcessingType.CLASSIFY_MESSAGE,
        input: {
          text: request.messageText,
          html: request.messageHtml,
        },
        context: {
          conversationHistory: request.context?.conversationHistory,
          customerInfo: this.buildCustomerInfo(request),
          organizationInfo: request.context?.organizationContext,
        },
        options: {
          preferredProvider: request.options?.preferredProvider,
          preferredModel: request.options?.preferredModel,
          confidenceThreshold: request.options?.confidenceThreshold || 0.7,
          includeReasoning: true,
        },
        organizationId: request.organizationId,
      };

      // Perform parallel AI operations
      const [
        classificationResponse,
        sentimentResponse,
        languageResponse,
        entitiesResponse
      ] = await Promise.allSettled([
        aiProviderManager.processRequest(aiRequest),
        this.analyzeSentiment(aiRequest),
        this.detectLanguage(aiRequest),
        request.options?.includeEntities ? this.extractEntities(aiRequest) : null,
      ]);

      // Process results
      const classification = this.extractClassification(classificationResponse);
      const sentiment = this.extractSentiment(sentimentResponse);
      const language = this.extractLanguage(languageResponse);
      const entities = this.extractEntities(entitiesResponse);

      // Calculate priority score
      const priority = this.calculatePriority(
        classification,
        sentiment,
        request.sender,
        request.context
      );

      // Determine if human review is required
      const requiresHumanReview = this.shouldRequireHumanReview(
        classification,
        sentiment,
        priority,
        request
      );

      // Calculate total cost and processing time
      const processingTime = Date.now() - startTime;
      const totalCost = this.calculateTotalCost([
        classificationResponse,
        sentimentResponse,
        languageResponse,
        entitiesResponse
      ]);

      const result: ClassificationResult = {
        messageId: request.messageId,
        classification,
        sentiment,
        language,
        entities,
        priority,
        processingTime,
        cost: totalCost,
        modelUsed: this.getModelUsed(classificationResponse),
        requiresHumanReview,
      };

      // Store classification result
      await this.storeClassificationResult(result);

      // Log successful classification
      aiLogger.info('Message classified successfully', {
        messageId: request.messageId,
        organizationId: request.organizationId,
        category: classification.category,
        urgency: classification.urgency,
        sentiment: sentiment.label,
        priority: priority.level,
        processingTime,
        cost: totalCost,
      });

      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Message classification failed', {
        messageId: request.messageId,
        organizationId: request.organizationId,
        error: error instanceof Error ? error.message : String(error),
        processingTime,
      });

      throw error;
    }
  }

  /**
   * Batch classify multiple messages
   */
  public async classifyMessages(requests: ClassificationRequest[]): Promise<ClassificationResult[]> {
    const results: ClassificationResult[] = [];
    const batchSize = 5; // Process in batches to avoid overwhelming providers

    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const batchPromises = batch.map(request => 
        this.classifyMessage(request).catch(error => {
          logger.error('Batch classification failed for message', {
            messageId: request.messageId,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(result => result !== null) as ClassificationResult[]);
    }

    return results;
  }

  /**
   * Get classification history for a message or conversation
   */
  public async getClassificationHistory(
    messageId?: string,
    conversationId?: string,
    organizationId?: string,
    limit: number = 50
  ): Promise<ClassificationResult[]> {
    let query = `
      SELECT 
        message_id as "messageId",
        category,
        subcategory,
        intent,
        confidence,
        urgency,
        sentiment,
        language,
        topics,
        entities,
        reasoning,
        alternative_categories as "alternativeCategories",
        processing_time_ms as "processingTime",
        model_used as "modelUsed",
        created_at as "createdAt"
      FROM ai_classifications
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
   * Get classification statistics
   */
  public async getClassificationStats(
    organizationId: string,
    timeRange: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<{
    totalClassifications: number;
    categoryBreakdown: Record<string, number>;
    urgencyBreakdown: Record<string, number>;
    sentimentBreakdown: Record<string, number>;
    averageConfidence: number;
    averageProcessingTime: number;
    totalCost: number;
  }> {
    const timeFilter = this.getTimeFilter(timeRange);
    
    const result = await this.query(`
      SELECT 
        COUNT(*) as total_classifications,
        AVG(confidence) as avg_confidence,
        AVG(processing_time_ms) as avg_processing_time,
        SUM(
          CASE WHEN ar.cost IS NOT NULL THEN ar.cost ELSE 0 END
        ) as total_cost,
        category,
        urgency,
        sentiment->>'label' as sentiment_label
      FROM ai_classifications ac
      LEFT JOIN ai_responses ar ON ac.message_id = ar.message_id
      WHERE ac.organization_id = $1 
        AND ac.created_at > NOW() - INTERVAL '${timeFilter}'
      GROUP BY category, urgency, sentiment_label
    `, [organizationId]);

    return this.aggregateStats(result.rows);
  }

  // Private helper methods
  private validateRequest(request: ClassificationRequest): void {
    if (!request.messageId) {
      throw new ValidationError('messageId is required');
    }
    if (!request.organizationId) {
      throw new ValidationError('organizationId is required');
    }
    if (!request.messageText || request.messageText.trim().length === 0) {
      throw new ValidationError('messageText is required and cannot be empty');
    }
    if (request.messageText.length > 50000) {
      throw new ValidationError('messageText is too long (max 50,000 characters)');
    }
  }

  private buildCustomerInfo(request: ClassificationRequest) {
    if (!request.sender) return undefined;

    return {
      email: request.sender.email,
      name: request.sender.name,
      userId: request.sender.userId,
      tier: request.sender.tier,
      ...request.context?.customerInfo,
    };
  }

  private async analyzeSentiment(aiRequest: AiProcessingRequest): Promise<PromiseSettledResult<AiProcessingResponse>> {
    const sentimentRequest = {
      ...aiRequest,
      type: AiProcessingType.ANALYZE_SENTIMENT,
    };

    try {
      const response = await aiProviderManager.processRequest(sentimentRequest);
      return { status: 'fulfilled', value: response };
    } catch (error) {
      return { status: 'rejected', reason: error };
    }
  }

  private async detectLanguage(aiRequest: AiProcessingRequest): Promise<PromiseSettledResult<AiProcessingResponse>> {
    const languageRequest = {
      ...aiRequest,
      type: AiProcessingType.DETECT_LANGUAGE,
    };

    try {
      const response = await aiProviderManager.processRequest(languageRequest);
      return { status: 'fulfilled', value: response };
    } catch (error) {
      return { status: 'rejected', reason: error };
    }
  }

  private async extractEntities(aiRequest: AiProcessingRequest): Promise<PromiseSettledResult<AiProcessingResponse> | null> {
    if (!aiRequest) return null;

    const entitiesRequest = {
      ...aiRequest,
      type: AiProcessingType.EXTRACT_ENTITIES,
    };

    try {
      const response = await aiProviderManager.processRequest(entitiesRequest);
      return { status: 'fulfilled', value: response };
    } catch (error) {
      return { status: 'rejected', reason: error };
    }
  }

  private extractClassification(response: PromiseSettledResult<AiProcessingResponse>): ClassificationResult['classification'] {
    if (response.status === 'rejected') {
      return {
        category: 'general',
        intent: 'unknown',
        confidence: 0.5,
        urgency: 'normal',
        topics: [],
        reasoning: 'Classification failed',
      };
    }

    const result = response.value.result as AiClassificationResult;
    return {
      category: result.category,
      subcategory: result.subcategory,
      intent: result.intent,
      confidence: result.confidence,
      urgency: result.urgency,
      topics: result.topics,
      reasoning: result.reasoning,
      alternativeCategories: result.alternativeCategories,
    };
  }

  private extractSentiment(response: PromiseSettledResult<AiProcessingResponse>): ClassificationResult['sentiment'] {
    if (response.status === 'rejected') {
      return {
        score: 0,
        label: 'neutral',
        confidence: 0.5,
      };
    }

    const result = response.value.result as AiSentimentResult;
    return {
      score: result.score,
      label: result.label,
      confidence: result.confidence,
      emotions: result.emotions,
    };
  }

  private extractLanguage(response: PromiseSettledResult<AiProcessingResponse>): ClassificationResult['language'] {
    if (response.status === 'rejected') {
      return {
        detected: 'en',
        confidence: 0.5,
      };
    }

    const result = response.value.result as AiLanguageDetectionResult;
    return {
      detected: result.language,
      confidence: result.confidence,
      alternatives: result.alternatives,
    };
  }

  private extractEntities(response: PromiseSettledResult<AiProcessingResponse> | null): ClassificationResult['entities'] {
    if (!response || response.status === 'rejected') {
      return undefined;
    }

    const result = response.value.result as AiEntityExtractionResult;
    return result.entities;
  }

  private calculatePriority(
    classification: ClassificationResult['classification'],
    sentiment: ClassificationResult['sentiment'],
    sender?: ClassificationRequest['sender'],
    context?: ClassificationRequest['context']
  ): ClassificationResult['priority'] {
    let score = 50; // Base score
    const factors: string[] = [];

    // Urgency factor (40% weight)
    const urgencyScores = {
      low: 10,
      normal: 30,
      high: 60,
      urgent: 80,
      critical: 100,
    };
    const urgencyScore = urgencyScores[classification.urgency] || 30;
    score = score * 0.6 + urgencyScore * 0.4;
    factors.push(`urgency: ${classification.urgency}`);

    // Sentiment factor (20% weight)
    if (sentiment.score < -0.5) {
      score += 20;
      factors.push('negative sentiment');
    } else if (sentiment.score < -0.2) {
      score += 10;
      factors.push('slightly negative sentiment');
    }

    // Customer tier factor (20% weight)
    if (sender?.tier === 'enterprise' || sender?.tier === 'premium') {
      score += 15;
      factors.push(`${sender.tier} customer`);
    }

    // Category factor (10% weight)
    const highPriorityCategories = ['complaint', 'billing', 'technical_support', 'refund'];
    if (highPriorityCategories.includes(classification.category)) {
      score += 10;
      factors.push(`high-priority category: ${classification.category}`);
    }

    // Intent factor (10% weight)
    const urgentIntents = ['cancel_subscription', 'report_bug', 'escalate', 'legal_issue'];
    if (urgentIntents.some(intent => classification.intent.includes(intent))) {
      score += 10;
      factors.push('urgent intent detected');
    }

    // Confidence factor - reduce score for low confidence
    if (classification.confidence < 0.7) {
      score -= 10;
      factors.push('low classification confidence');
    }

    // Normalize score to 0-100
    score = Math.max(0, Math.min(100, score));

    // Determine priority level
    let level: ClassificationResult['priority']['level'];
    if (score >= 90) level = 'critical';
    else if (score >= 75) level = 'urgent';
    else if (score >= 60) level = 'high';
    else if (score >= 40) level = 'normal';
    else level = 'low';

    return {
      score: Math.round(score),
      level,
      factors,
    };
  }

  private shouldRequireHumanReview(
    classification: ClassificationResult['classification'],
    sentiment: ClassificationResult['sentiment'],
    priority: ClassificationResult['priority'],
    request: ClassificationRequest
  ): boolean {
    // High priority messages always require review
    if (priority.level === 'critical' || priority.level === 'urgent') {
      return true;
    }

    // Low confidence classifications require review
    if (classification.confidence < 0.7) {
      return true;
    }

    // Very negative sentiment requires review
    if (sentiment.score < -0.7) {
      return true;
    }

    // Premium/Enterprise customers require review
    if (request.sender?.tier === 'premium' || request.sender?.tier === 'enterprise') {
      return true;
    }

    // Sensitive categories require review
    const sensitiveCategories = ['complaint', 'legal', 'refund', 'cancel'];
    if (sensitiveCategories.includes(classification.category)) {
      return true;
    }

    return false;
  }

  private calculateTotalCost(responses: PromiseSettledResult<AiProcessingResponse>[]): number {
    return responses.reduce((total, response) => {
      if (response.status === 'fulfilled') {
        return total + response.value.cost.totalCost;
      }
      return total;
    }, 0);
  }

  private getModelUsed(response: PromiseSettledResult<AiProcessingResponse>): string {
    if (response.status === 'fulfilled') {
      return response.value.metadata.model;
    }
    return 'unknown';
  }

  private async storeClassificationResult(result: ClassificationResult): Promise<void> {
    try {
      await this.query(`
        INSERT INTO ai_classifications (
          message_id, organization_id, category, subcategory, intent,
          confidence, urgency, sentiment, language, topics, entities,
          reasoning, alternative_categories, processing_time_ms, model_used
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (message_id, organization_id)
        DO UPDATE SET
          category = EXCLUDED.category,
          subcategory = EXCLUDED.subcategory,
          intent = EXCLUDED.intent,
          confidence = EXCLUDED.confidence,
          urgency = EXCLUDED.urgency,
          sentiment = EXCLUDED.sentiment,
          language = EXCLUDED.language,
          topics = EXCLUDED.topics,
          entities = EXCLUDED.entities,
          reasoning = EXCLUDED.reasoning,
          alternative_categories = EXCLUDED.alternative_categories,
          processing_time_ms = EXCLUDED.processing_time_ms,
          model_used = EXCLUDED.model_used
      `, [
        result.messageId,
        result.classification.category, // We'll need to get this from somewhere
        result.classification.category,
        result.classification.subcategory,
        result.classification.intent,
        result.classification.confidence,
        result.classification.urgency,
        JSON.stringify(result.sentiment),
        result.language.detected,
        JSON.stringify(result.classification.topics),
        JSON.stringify(result.entities || []),
        result.classification.reasoning,
        JSON.stringify(result.classification.alternativeCategories || []),
        result.processingTime,
        result.modelUsed,
      ]);
    } catch (error) {
      logger.error('Failed to store classification result', {
        messageId: result.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - classification succeeded even if storage failed
    }
  }

  private mapDatabaseRowToResult(row: any): ClassificationResult {
    return {
      messageId: row.messageId,
      classification: {
        category: row.category,
        subcategory: row.subcategory,
        intent: row.intent,
        confidence: row.confidence,
        urgency: row.urgency,
        topics: row.topics || [],
        reasoning: row.reasoning,
        alternativeCategories: row.alternativeCategories || [],
      },
      sentiment: row.sentiment || { score: 0, label: 'neutral', confidence: 0.5 },
      language: {
        detected: row.language || 'en',
        confidence: 0.9,
      },
      entities: row.entities || [],
      priority: {
        score: 50,
        level: 'normal',
        factors: [],
      },
      processingTime: row.processingTime || 0,
      cost: 0,
      modelUsed: row.modelUsed || 'unknown',
      requiresHumanReview: false,
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

  private aggregateStats(rows: any[]): {
    totalClassifications: number;
    categoryBreakdown: Record<string, number>;
    urgencyBreakdown: Record<string, number>;
    sentimentBreakdown: Record<string, number>;
    averageConfidence: number;
    averageProcessingTime: number;
    totalCost: number;
  } {
    const stats = {
      totalClassifications: 0,
      categoryBreakdown: {} as Record<string, number>,
      urgencyBreakdown: {} as Record<string, number>,
      sentimentBreakdown: {} as Record<string, number>,
      averageConfidence: 0,
      averageProcessingTime: 0,
      totalCost: 0,
    };

    if (rows.length === 0) return stats;

    let totalConfidence = 0;
    let totalProcessingTime = 0;
    let totalCost = 0;

    for (const row of rows) {
      stats.totalClassifications += parseInt(row.total_classifications) || 0;

      // Category breakdown
      const category = row.category || 'unknown';
      stats.categoryBreakdown[category] = (stats.categoryBreakdown[category] || 0) + 1;

      // Urgency breakdown
      const urgency = row.urgency || 'normal';
      stats.urgencyBreakdown[urgency] = (stats.urgencyBreakdown[urgency] || 0) + 1;

      // Sentiment breakdown
      const sentiment = row.sentiment_label || 'neutral';
      stats.sentimentBreakdown[sentiment] = (stats.sentimentBreakdown[sentiment] || 0) + 1;

      totalConfidence += parseFloat(row.avg_confidence) || 0;
      totalProcessingTime += parseFloat(row.avg_processing_time) || 0;
      totalCost += parseFloat(row.total_cost) || 0;
    }

    stats.averageConfidence = totalConfidence / rows.length;
    stats.averageProcessingTime = totalProcessingTime / rows.length;
    stats.totalCost = totalCost;

    return stats;
  }
}

// Export singleton instance
export const messageClassificationService = MessageClassificationService.getInstance();
export default MessageClassificationService;
