/**
 * Anthropic Claude Provider Implementation
 * Supports Claude 3 (Opus, Sonnet, Haiku) models
 */

import Anthropic from '@anthropic-ai/sdk';
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

export class AnthropicProvider extends BaseAiProvider {
  public readonly provider = AiProvider.ANTHROPIC;
  public readonly name = 'Anthropic Claude';

  private client: Anthropic | null = null;

  public async initialize(config: AiProviderConfig): Promise<void> {
    try {
      this.config = config;
      
      // Initialize Anthropic client
      this.client = new Anthropic({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });

      // Test the connection
      await this.healthCheck();
      
      this._isInitialized = true;
      logger.info('Anthropic provider initialized', {
        provider: this.provider,
        models: config.models.length,
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
      // Test with a simple message
      const response = await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      return response.content.length > 0;
    } catch (error) {
      logger.error('Anthropic health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  public async getAvailableModels(): Promise<AiModelConfig[]> {
    // Anthropic doesn't have a models endpoint, so we return known models
    const knownModels = [
      {
        name: 'claude-3-opus-20240229',
        displayName: 'Claude 3 Opus',
        type: AiModelType.CHAT,
        maxTokens: 4096,
        contextWindow: 200000,
        costPerInputToken: 0.000015,
        costPerOutputToken: 0.000075,
        averageLatencyMs: 3000,
        qualityScore: 98,
      },
      {
        name: 'claude-3-sonnet-20240229',
        displayName: 'Claude 3 Sonnet',
        type: AiModelType.CHAT,
        maxTokens: 4096,
        contextWindow: 200000,
        costPerInputToken: 0.000003,
        costPerOutputToken: 0.000015,
        averageLatencyMs: 2000,
        qualityScore: 95,
      },
      {
        name: 'claude-3-haiku-20240307',
        displayName: 'Claude 3 Haiku',
        type: AiModelType.CHAT,
        maxTokens: 4096,
        contextWindow: 200000,
        costPerInputToken: 0.00000025,
        costPerOutputToken: 0.00000125,
        averageLatencyMs: 1000,
        qualityScore: 90,
      },
    ];

    return knownModels.map(model => ({
      ...model,
      supportedLanguages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'],
      capabilities: [
        AiCapability.TEXT_GENERATION,
        AiCapability.CLASSIFICATION,
        AiCapability.SENTIMENT_ANALYSIS,
        AiCapability.ENTITY_EXTRACTION,
        AiCapability.LANGUAGE_DETECTION,
        AiCapability.TRANSLATION,
        AiCapability.SUMMARIZATION,
        AiCapability.VISION, // Claude 3 supports vision
      ],
      isActive: true,
    }));
  }

  // Core AI operations implementation
  protected async _classifyMessage(request: AiProcessingRequest): Promise<AiClassificationResult> {
    this.validateInitialized();
    this.validateRequest(request);

    const model = request.options?.preferredModel || 'claude-3-haiku-20240307';
    const systemPrompt = this.buildClassificationPrompt(request);
    
    const messages: Anthropic.Messages.MessageParam[] = [];

    // Add conversation history if available
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
      const response = await this.client!.messages.create({
        model,
        max_tokens: 500,
        temperature: 0.1,
        system: systemPrompt,
        messages,
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const result = JSON.parse(content.text);
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

    const model = request.options?.preferredModel || 'claude-3-sonnet-20240229';
    const systemPrompt = this.buildResponsePrompt(request);
    
    const messages: Anthropic.Messages.MessageParam[] = [];

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
      const response = await this.client!.messages.create({
        model,
        max_tokens: request.options?.maxTokens || 1000,
        temperature: request.options?.temperature || 0.7,
        top_p: request.options?.topP,
        system: systemPrompt,
        messages,
        stop_sequences: request.options?.stopSequences,
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      return {
        content: content.text.trim(),
        confidence: 0.9, // Claude generally has high confidence
        requiresHumanReview: this.shouldRequireHumanReview(content.text, request),
        suggestedActions: this.extractSuggestedActions(content.text),
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

    const model = request.options?.preferredModel || 'claude-3-haiku-20240307';
    const systemPrompt = `Analyze the sentiment of the following text. Return a JSON object with:
    - score: number between -1 (very negative) and 1 (very positive)
    - label: "positive", "negative", or "neutral"
    - confidence: number between 0 and 1
    - emotions: array of emotion objects with emotion name and score`;

    try {
      const response = await this.client!.messages.create({
        model,
        max_tokens: 200,
        temperature: 0.1,
        system: systemPrompt,
        messages: [{ role: 'user', content: request.input.text }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const result = JSON.parse(content.text);
      return {
        score: result.score || 0,
        label: result.label || 'neutral',
        confidence: result.confidence || 0.85,
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

    const model = request.options?.preferredModel || 'claude-3-haiku-20240307';
    const systemPrompt = `Extract named entities from the following text. Return a JSON object with:
    - entities: array of entity objects with text, label, confidence, start, and end positions
    Common entity types: PERSON, ORGANIZATION, LOCATION, DATE, TIME, MONEY, PRODUCT, EMAIL, PHONE`;

    try {
      const response = await this.client!.messages.create({
        model,
        max_tokens: 500,
        temperature: 0.1,
        system: systemPrompt,
        messages: [{ role: 'user', content: request.input.text }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const result = JSON.parse(content.text);
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

    const model = request.options?.preferredModel || 'claude-3-haiku-20240307';
    const systemPrompt = `Detect the language of the following text. Return a JSON object with:
    - language: ISO 639-1 language code (e.g., "en", "es", "fr")
    - confidence: number between 0 and 1
    - alternatives: array of alternative language detections with language and confidence`;

    try {
      const response = await this.client!.messages.create({
        model,
        max_tokens: 100,
        temperature: 0.1,
        system: systemPrompt,
        messages: [{ role: 'user', content: request.input.text }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const result = JSON.parse(content.text);
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

    const model = request.options?.preferredModel || 'claude-3-sonnet-20240229';
    const targetLanguage = request.options?.customPrompt || 'English';

    const systemPrompt = `Translate the following text to ${targetLanguage}. Return a JSON object with:
    - translatedText: the translated text
    - sourceLanguage: detected source language code
    - targetLanguage: target language code
    - confidence: translation confidence between 0 and 1`;

    try {
      const response = await this.client!.messages.create({
        model,
        max_tokens: request.input.text.length * 2, // Allow for expansion
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: request.input.text }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const result = JSON.parse(content.text);
      return {
        translatedText: result.translatedText || request.input.text,
        sourceLanguage: result.sourceLanguage || 'unknown',
        targetLanguage: result.targetLanguage || 'en',
        confidence: result.confidence || 0.85,
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

    const model = request.options?.preferredModel || 'claude-3-sonnet-20240229';
    const systemPrompt = `Summarize the following conversation. Return a JSON object with:
    - summary: concise summary of the conversation
    - keyPoints: array of key points discussed
    - confidence: confidence in the summary quality between 0 and 1`;

    try {
      const response = await this.client!.messages.create({
        model,
        max_tokens: 500,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: request.input.text }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const result = JSON.parse(content.text);
      return {
        summary: result.summary || 'No summary available',
        keyPoints: result.keyPoints || [],
        confidence: result.confidence || 0.85,
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

    const model = request.options?.preferredModel || 'claude-3-haiku-20240307';
    const systemPrompt = `Analyze the following text for harmful content. Return a JSON object with:
    - flagged: boolean indicating if content should be flagged
    - categories: array of category objects with category name, flagged status, and score
    - confidence: confidence in the moderation result between 0 and 1
    Categories to check: hate, harassment, violence, self-harm, sexual, illegal, spam`;

    try {
      const response = await this.client!.messages.create({
        model,
        max_tokens: 300,
        temperature: 0.1,
        system: systemPrompt,
        messages: [{ role: 'user', content: request.input.text }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const result = JSON.parse(content.text);
      return {
        flagged: result.flagged || false,
        categories: result.categories || [],
        confidence: result.confidence || 0.85,
      };
    } catch (error) {
      throw new AiProviderError(
        this.provider,
        `Content moderation failed: ${error instanceof Error ? error.message : String(error)}`,
        500,
        model,
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
      confidence: Math.min(Math.max(result.confidence || 0.85, 0), 1),
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

  // Override token calculation for Anthropic's token counting
  protected calculateTokensUsed(request: AiProcessingRequest, result: any): {
    input: number;
    output: number;
    total: number;
  } {
    // Anthropic token estimation (similar to OpenAI but slightly different)
    const inputText = request.input.text +
                     (request.context?.conversationHistory?.map(m => m.content).join(' ') || '');
    const outputText = result?.content || JSON.stringify(result) || '';

    // Claude uses roughly 3.5-4 characters per token
    const inputTokens = Math.ceil(inputText.length / 3.7);
    const outputTokens = Math.ceil(outputText.length / 3.7);

    return {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens,
    };
  }
}

export default AnthropicProvider;
