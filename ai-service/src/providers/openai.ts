/**
 * OpenAI Provider Implementation
 * Supports GPT-4, GPT-3.5-turbo, and other OpenAI models
 */

import OpenAI from 'openai';
import { BaseAiProvider } from './base';
import {
  AiProvider,
  AiProviderConfig,
  AiModelConfig,
  AiCapability,
  AiModelType,
  AiProcessingRequest,
  AiClassificationResult,
  AiGenerationResult,
  AiSentimentResult,
  AiEntityExtractionResult,
  AiLanguageDetectionResult,
  AiTranslationResult,
  AiSummarizationResult,
  AiModerationResult,
} from '@/types/ai';
import { AiProviderError } from '@/utils/errors';
import { logger } from '@/utils/logger';

export class OpenAiProvider extends BaseAiProvider {
  public readonly provider = AiProvider.OPENAI;
  public readonly name = 'OpenAI';

  private client: OpenAI | null = null;

  public async initialize(config: AiProviderConfig): Promise<void> {
    try {
      this.config = config;
      
      // Initialize OpenAI client
      this.client = new OpenAI({
        apiKey: config.apiKey,
        organization: config.organizationId,
        baseURL: config.baseUrl,
      });

      // Test the connection
      await this.healthCheck();
      
      this._isInitialized = true;
      logger.info('OpenAI provider initialized', {
        provider: this.provider,
        models: config.models.length,
        organizationId: config.organizationId,
      });
    } catch (error) {
      throw new AiProviderError(
        this.provider,
        `Failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  public async healthCheck(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      // Test with a simple completion
      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5,
      });

      return response.choices.length > 0;
    } catch (error) {
      logger.error('OpenAI health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  public async getAvailableModels(): Promise<AiModelConfig[]> {
    if (!this.client) {
      throw new AiProviderError(this.provider, 'Provider not initialized');
    }

    try {
      const models = await this.client.models.list();
      
      // Filter and map to our model config format
      return models.data
        .filter(model => model.id.includes('gpt'))
        .map(model => this.mapOpenAiModel(model));
    } catch (error) {
      throw new AiProviderError(
        this.provider,
        `Failed to get models: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private mapOpenAiModel(model: any): AiModelConfig {
    // Default configurations for known OpenAI models
    const modelConfigs: Record<string, Partial<AiModelConfig>> = {
      'gpt-4': {
        displayName: 'GPT-4',
        type: AiModelType.CHAT,
        maxTokens: 8192,
        contextWindow: 8192,
        costPerInputToken: 0.00003,
        costPerOutputToken: 0.00006,
        averageLatencyMs: 2000,
        qualityScore: 95,
      },
      'gpt-4-turbo': {
        displayName: 'GPT-4 Turbo',
        type: AiModelType.CHAT,
        maxTokens: 4096,
        contextWindow: 128000,
        costPerInputToken: 0.00001,
        costPerOutputToken: 0.00003,
        averageLatencyMs: 1500,
        qualityScore: 95,
      },
      'gpt-3.5-turbo': {
        displayName: 'GPT-3.5 Turbo',
        type: AiModelType.CHAT,
        maxTokens: 4096,
        contextWindow: 16385,
        costPerInputToken: 0.0000015,
        costPerOutputToken: 0.000002,
        averageLatencyMs: 800,
        qualityScore: 85,
      },
    };

    const config = modelConfigs[model.id] || {
      displayName: model.id,
      type: AiModelType.CHAT,
      maxTokens: 4096,
      contextWindow: 4096,
      costPerInputToken: 0.000002,
      costPerOutputToken: 0.000002,
      averageLatencyMs: 1000,
      qualityScore: 80,
    };

    return {
      name: model.id,
      displayName: config.displayName!,
      type: config.type!,
      maxTokens: config.maxTokens!,
      contextWindow: config.contextWindow!,
      supportedLanguages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'],
      capabilities: [
        AiCapability.TEXT_GENERATION,
        AiCapability.CLASSIFICATION,
        AiCapability.SENTIMENT_ANALYSIS,
        AiCapability.ENTITY_EXTRACTION,
        AiCapability.LANGUAGE_DETECTION,
        AiCapability.TRANSLATION,
        AiCapability.SUMMARIZATION,
        AiCapability.FUNCTION_CALLING,
      ],
      costPerInputToken: config.costPerInputToken!,
      costPerOutputToken: config.costPerOutputToken!,
      averageLatencyMs: config.averageLatencyMs!,
      qualityScore: config.qualityScore!,
      isActive: true,
    };
  }

  // Core AI operations implementation
  protected async _classifyMessage(request: AiProcessingRequest): Promise<AiClassificationResult> {
    this.validateInitialized();
    this.validateRequest(request);

    const model = request.options?.preferredModel || 'gpt-3.5-turbo';
    const systemPrompt = this.buildClassificationPrompt(request);
    
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: request.input.text },
    ];

    // Add conversation history if available
    if (request.context?.conversationHistory) {
      const historyMessages = request.context.conversationHistory.map(msg => ({
        role: msg.role === 'customer' ? 'user' as const : 'assistant' as const,
        content: msg.content,
      }));
      messages.splice(-1, 0, ...historyMessages);
    }

    try {
      const response = await this.client!.chat.completions.create({
        model,
        messages,
        max_tokens: 500,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content received');
      }

      const result = JSON.parse(content);
      return this.parseClassificationResult(result);
    } catch (error) {
      throw new AiProviderError(
        this.provider,
        `Classification failed: ${error instanceof Error ? error.message : String(error)}`,
        500,
        model,
        'classify_message'
      );
    }
  }

  protected async _generateResponse(request: AiProcessingRequest): Promise<AiGenerationResult> {
    this.validateInitialized();
    this.validateRequest(request);

    const model = request.options?.preferredModel || 'gpt-3.5-turbo';
    const systemPrompt = this.buildResponsePrompt(request);
    
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history
    if (request.context?.conversationHistory) {
      request.context.conversationHistory.forEach(msg => {
        messages.push({
          role: msg.role === 'customer' ? 'user' : 'assistant',
          content: msg.content,
        });
      });
    }

    // Add current message
    messages.push({ role: 'user', content: request.input.text });

    try {
      const response = await this.client!.chat.completions.create({
        model,
        messages,
        max_tokens: request.options?.maxTokens || 1000,
        temperature: request.options?.temperature || 0.7,
        top_p: request.options?.topP,
        frequency_penalty: request.options?.frequencyPenalty,
        presence_penalty: request.options?.presencePenalty,
        stop: request.options?.stopSequences,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content received');
      }

      return {
        content: content.trim(),
        confidence: 0.85, // Default confidence for OpenAI
        requiresHumanReview: this.shouldRequireHumanReview(content, request),
        suggestedActions: this.extractSuggestedActions(content),
      };
    } catch (error) {
      throw new AiProviderError(
        this.provider,
        `Response generation failed: ${error instanceof Error ? error.message : String(error)}`,
        500,
        model,
        'generate_response'
      );
    }
  }

  protected async _analyzeSentiment(request: AiProcessingRequest): Promise<AiSentimentResult> {
    this.validateInitialized();
    this.validateRequest(request);

    const model = request.options?.preferredModel || 'gpt-3.5-turbo';
    const systemPrompt = `Analyze the sentiment of the following text. Return a JSON object with:
    - score: number between -1 (very negative) and 1 (very positive)
    - label: "positive", "negative", or "neutral"
    - confidence: number between 0 and 1
    - emotions: array of emotion objects with emotion name and score`;

    try {
      const response = await this.client!.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: request.input.text },
        ],
        max_tokens: 200,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content received');
      }

      const result = JSON.parse(content);
      return {
        score: result.score || 0,
        label: result.label || 'neutral',
        confidence: result.confidence || 0.8,
        emotions: result.emotions || [],
      };
    } catch (error) {
      throw new AiProviderError(
        this.provider,
        `Sentiment analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        500,
        model,
        'analyze_sentiment'
      );
    }
  }

  protected async _extractEntities(request: AiProcessingRequest): Promise<AiEntityExtractionResult> {
    this.validateInitialized();
    this.validateRequest(request);

    const model = request.options?.preferredModel || 'gpt-3.5-turbo';
    const systemPrompt = `Extract named entities from the following text. Return a JSON object with:
    - entities: array of entity objects with text, label, confidence, start, and end positions
    Common entity types: PERSON, ORGANIZATION, LOCATION, DATE, TIME, MONEY, PRODUCT, EMAIL, PHONE`;

    try {
      const response = await this.client!.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: request.input.text },
        ],
        max_tokens: 500,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content received');
      }

      const result = JSON.parse(content);
      return {
        entities: result.entities || [],
      };
    } catch (error) {
      throw new AiProviderError(
        this.provider,
        `Entity extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        500,
        model,
        'extract_entities'
      );
    }
  }

  protected async _detectLanguage(request: AiProcessingRequest): Promise<AiLanguageDetectionResult> {
    this.validateInitialized();
    this.validateRequest(request);

    const model = request.options?.preferredModel || 'gpt-3.5-turbo';
    const systemPrompt = `Detect the language of the following text. Return a JSON object with:
    - language: ISO 639-1 language code (e.g., "en", "es", "fr")
    - confidence: number between 0 and 1
    - alternatives: array of alternative language detections with language and confidence`;

    try {
      const response = await this.client!.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: request.input.text },
        ],
        max_tokens: 100,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content received');
      }

      const result = JSON.parse(content);
      return {
        language: result.language || 'en',
        confidence: result.confidence || 0.9,
        alternatives: result.alternatives || [],
      };
    } catch (error) {
      throw new AiProviderError(
        this.provider,
        `Language detection failed: ${error instanceof Error ? error.message : String(error)}`,
        500,
        model,
        'detect_language'
      );
    }
  }

  protected async _translateText(request: AiProcessingRequest): Promise<AiTranslationResult> {
    this.validateInitialized();
    this.validateRequest(request);

    const model = request.options?.preferredModel || 'gpt-3.5-turbo';
    const targetLanguage = request.options?.customPrompt || 'English';

    const systemPrompt = `Translate the following text to ${targetLanguage}. Return a JSON object with:
    - translatedText: the translated text
    - sourceLanguage: detected source language code
    - targetLanguage: target language code
    - confidence: translation confidence between 0 and 1`;

    try {
      const response = await this.client!.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: request.input.text },
        ],
        max_tokens: request.input.text.length * 2, // Allow for expansion
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content received');
      }

      const result = JSON.parse(content);
      return {
        translatedText: result.translatedText || request.input.text,
        sourceLanguage: result.sourceLanguage || 'unknown',
        targetLanguage: result.targetLanguage || 'en',
        confidence: result.confidence || 0.8,
      };
    } catch (error) {
      throw new AiProviderError(
        this.provider,
        `Translation failed: ${error instanceof Error ? error.message : String(error)}`,
        500,
        model,
        'translate_text'
      );
    }
  }

  protected async _summarizeConversation(request: AiProcessingRequest): Promise<AiSummarizationResult> {
    this.validateInitialized();
    this.validateRequest(request);

    const model = request.options?.preferredModel || 'gpt-3.5-turbo';
    const systemPrompt = `Summarize the following conversation. Return a JSON object with:
    - summary: concise summary of the conversation
    - keyPoints: array of key points discussed
    - confidence: confidence in the summary quality between 0 and 1`;

    try {
      const response = await this.client!.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: request.input.text },
        ],
        max_tokens: 500,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content received');
      }

      const result = JSON.parse(content);
      return {
        summary: result.summary || 'No summary available',
        keyPoints: result.keyPoints || [],
        confidence: result.confidence || 0.8,
      };
    } catch (error) {
      throw new AiProviderError(
        this.provider,
        `Summarization failed: ${error instanceof Error ? error.message : String(error)}`,
        500,
        model,
        'summarize_conversation'
      );
    }
  }

  protected async _moderateContent(request: AiProcessingRequest): Promise<AiModerationResult> {
    this.validateInitialized();
    this.validateRequest(request);

    try {
      // Use OpenAI's dedicated moderation endpoint
      const response = await this.client!.moderations.create({
        input: request.input.text,
      });

      const result = response.results[0];
      if (!result) {
        throw new Error('No moderation result received');
      }

      const categories = Object.entries(result.categories).map(([category, flagged]) => ({
        category,
        flagged: flagged as boolean,
        score: (result.category_scores as any)[category] || 0,
      }));

      return {
        flagged: result.flagged,
        categories,
        confidence: 0.95, // OpenAI moderation is highly reliable
      };
    } catch (error) {
      throw new AiProviderError(
        this.provider,
        `Content moderation failed: ${error instanceof Error ? error.message : String(error)}`,
        500,
        'text-moderation-latest',
        'moderate_content'
      );
    }
  }

  // Helper methods for building prompts and parsing responses
  private buildClassificationPrompt(request: AiProcessingRequest): string {
    let prompt = this.buildSystemPrompt(request, request.type);

    prompt += `\n\nClassify the message and return a JSON object with:
    - category: main category (e.g., "complaint", "inquiry", "compliment", "technical_support", "billing")
    - subcategory: specific subcategory if applicable
    - intent: customer's intent (e.g., "get_refund", "report_bug", "ask_question")
    - confidence: confidence score between 0 and 1
    - urgency: urgency level ("low", "normal", "high", "urgent", "critical")
    - topics: array of relevant topics
    - reasoning: brief explanation of the classification
    - alternativeCategories: array of alternative classifications with confidence scores`;

    return prompt;
  }

  private buildResponsePrompt(request: AiProcessingRequest): string {
    let prompt = this.buildSystemPrompt(request, request.type);

    // Add customer context if available
    if (request.context?.customerInfo) {
      const customer = request.context.customerInfo;
      prompt += `\nCustomer Information:`;
      if (customer.name) prompt += `\n- Name: ${customer.name}`;
      if (customer.tier) prompt += `\n- Tier: ${customer.tier}`;
      if (customer.language) prompt += `\n- Preferred Language: ${customer.language}`;
      if (customer.previousInteractions) prompt += `\n- Previous Interactions: ${customer.previousInteractions}`;
    }

    // Add tone and style preferences
    const tone = request.options?.customPrompt || 'professional and helpful';
    prompt += `\n\nGenerate a ${tone} response that:
    - Addresses the customer's concern directly
    - Provides helpful information or next steps
    - Maintains the company's brand voice
    - Is concise but complete
    - Shows empathy when appropriate`;

    return prompt;
  }

  private parseClassificationResult(result: any): AiClassificationResult {
    return {
      category: result.category || 'general',
      subcategory: result.subcategory,
      intent: result.intent || 'unknown',
      confidence: Math.min(Math.max(result.confidence || 0.8, 0), 1),
      urgency: result.urgency || 'normal',
      topics: Array.isArray(result.topics) ? result.topics : [],
      reasoning: result.reasoning,
      alternativeCategories: Array.isArray(result.alternativeCategories)
        ? result.alternativeCategories
        : [],
    };
  }

  private shouldRequireHumanReview(content: string, request: AiProcessingRequest): boolean {
    // Check for sensitive topics or low confidence indicators
    const sensitiveKeywords = [
      'refund', 'cancel', 'complaint', 'angry', 'frustrated',
      'legal', 'lawsuit', 'attorney', 'discrimination',
      'urgent', 'emergency', 'critical', 'escalate'
    ];

    const lowerContent = content.toLowerCase();
    const lowerInput = request.input.text.toLowerCase();

    // Require human review if sensitive keywords are present
    const hasSensitiveContent = sensitiveKeywords.some(keyword =>
      lowerContent.includes(keyword) || lowerInput.includes(keyword)
    );

    // Require human review for high-value customers
    const isHighValueCustomer = request.context?.customerInfo?.tier === 'premium' ||
                               request.context?.customerInfo?.tier === 'enterprise';

    return hasSensitiveContent || isHighValueCustomer;
  }

  private extractSuggestedActions(content: string): string[] {
    const actions: string[] = [];

    // Look for action-oriented phrases
    const actionPatterns = [
      /please (.*?)(?:\.|$)/gi,
      /you (?:can|should|may) (.*?)(?:\.|$)/gi,
      /i recommend (.*?)(?:\.|$)/gi,
      /next steps?:? (.*?)(?:\.|$)/gi,
    ];

    actionPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const action = match.replace(pattern, '$1').trim();
          if (action && action.length > 5) {
            actions.push(action);
          }
        });
      }
    });

    return actions.slice(0, 5); // Limit to 5 actions
  }

  // Override token calculation for more accurate OpenAI token counting
  protected calculateTokensUsed(request: AiProcessingRequest, result: any): {
    input: number;
    output: number;
    total: number;
  } {
    // More accurate token estimation for OpenAI
    // This is still an approximation - for exact counts, we'd need the tiktoken library
    const inputText = request.input.text +
                     (request.context?.conversationHistory?.map(m => m.content).join(' ') || '');
    const outputText = result?.content || JSON.stringify(result) || '';

    // OpenAI uses roughly 4 characters per token for English text
    const inputTokens = Math.ceil(inputText.length / 4);
    const outputTokens = Math.ceil(outputText.length / 4);

    return {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens,
    };
  }
}

export default OpenAiProvider;
