/**
 * Base AI Provider class
 * Abstract base class for all AI provider implementations
 */

import { v4 as uuidv4 } from 'uuid';
import { 
  IAiProvider,
  AiProvider,
  AiProviderConfig,
  AiModelConfig,
  AiRateLimits,
  AiCostConfig,
  AiCapability,
  AiProcessingRequest,
  AiProcessingResponse,
  AiProcessingType,
  AiResponseMetadata,
  AiCostBreakdown,
  AiPerformanceMetrics,
} from '@/types/ai';
import { logger, aiLogger, logAiRequest, logAiResponse, logAiError } from '@/utils/logger';
import { AiProviderError, mapAiProviderError } from '@/utils/errors';

export abstract class BaseAiProvider implements IAiProvider {
  public abstract readonly provider: AiProvider;
  public abstract readonly name: string;
  
  protected config: AiProviderConfig | null = null;
  protected _isInitialized = false;

  public get isInitialized(): boolean {
    return this._isInitialized;
  }

  // Abstract methods that must be implemented by concrete providers
  public abstract initialize(config: AiProviderConfig): Promise<void>;
  public abstract healthCheck(): Promise<boolean>;
  public abstract getAvailableModels(): Promise<AiModelConfig[]>;
  
  // Core AI operations - abstract methods
  protected abstract _classifyMessage(request: AiProcessingRequest): Promise<any>;
  protected abstract _generateResponse(request: AiProcessingRequest): Promise<any>;
  protected abstract _analyzeSentiment(request: AiProcessingRequest): Promise<any>;
  protected abstract _extractEntities(request: AiProcessingRequest): Promise<any>;
  protected abstract _detectLanguage(request: AiProcessingRequest): Promise<any>;
  protected abstract _translateText(request: AiProcessingRequest): Promise<any>;
  protected abstract _summarizeConversation(request: AiProcessingRequest): Promise<any>;
  protected abstract _moderateContent(request: AiProcessingRequest): Promise<any>;

  // Public interface methods with common logic
  public async classifyMessage(request: AiProcessingRequest): Promise<AiProcessingResponse> {
    return this.executeWithMetrics(
      AiProcessingType.CLASSIFY_MESSAGE,
      request,
      () => this._classifyMessage(request)
    );
  }

  public async generateResponse(request: AiProcessingRequest): Promise<AiProcessingResponse> {
    return this.executeWithMetrics(
      AiProcessingType.GENERATE_RESPONSE,
      request,
      () => this._generateResponse(request)
    );
  }

  public async analyzeSentiment(request: AiProcessingRequest): Promise<AiProcessingResponse> {
    return this.executeWithMetrics(
      AiProcessingType.ANALYZE_SENTIMENT,
      request,
      () => this._analyzeSentiment(request)
    );
  }

  public async extractEntities(request: AiProcessingRequest): Promise<AiProcessingResponse> {
    return this.executeWithMetrics(
      AiProcessingType.EXTRACT_ENTITIES,
      request,
      () => this._extractEntities(request)
    );
  }

  public async detectLanguage(request: AiProcessingRequest): Promise<AiProcessingResponse> {
    return this.executeWithMetrics(
      AiProcessingType.DETECT_LANGUAGE,
      request,
      () => this._detectLanguage(request)
    );
  }

  public async translateText(request: AiProcessingRequest): Promise<AiProcessingResponse> {
    return this.executeWithMetrics(
      AiProcessingType.TRANSLATE_TEXT,
      request,
      () => this._translateText(request)
    );
  }

  public async summarizeConversation(request: AiProcessingRequest): Promise<AiProcessingResponse> {
    return this.executeWithMetrics(
      AiProcessingType.SUMMARIZE_CONVERSATION,
      request,
      () => this._summarizeConversation(request)
    );
  }

  public async moderateContent(request: AiProcessingRequest): Promise<AiProcessingResponse> {
    return this.executeWithMetrics(
      AiProcessingType.MODERATE_CONTENT,
      request,
      () => this._moderateContent(request)
    );
  }

  // Common execution wrapper with metrics and error handling
  protected async executeWithMetrics<T>(
    type: AiProcessingType,
    request: AiProcessingRequest,
    operation: () => Promise<T>
  ): Promise<AiProcessingResponse> {
    const startTime = Date.now();
    const requestId = uuidv4();
    const model = request.options?.preferredModel || this.getDefaultModel(type);

    // Log request
    logAiRequest(this.provider, model, type, {
      requestId,
      organizationId: request.organizationId,
      userId: request.userId,
    });

    try {
      // Execute the operation
      const result = await operation();
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Calculate cost and tokens (provider-specific implementation)
      const tokensUsed = this.calculateTokensUsed(request, result);
      const cost = this.calculateCost(tokensUsed, model);

      // Log successful response
      logAiResponse(
        this.provider,
        model,
        type,
        processingTime,
        tokensUsed.total,
        cost.totalCost,
        { requestId }
      );

      // Build response metadata
      const metadata: AiResponseMetadata = {
        provider: this.provider,
        model,
        requestId,
        processingTimeMs: processingTime,
        tokensUsed,
      };

      const performance: AiPerformanceMetrics = {
        latency: processingTime,
      };

      return {
        id: requestId,
        type,
        result,
        metadata,
        cost,
        performance,
      };

    } catch (error) {
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Log error
      logAiError(this.provider, model, type, error as Error, {
        requestId,
        processingTime,
      });

      // Map and throw provider-specific error
      throw mapAiProviderError(this.provider, error, model, type);
    }
  }

  // Helper methods
  protected getDefaultModel(type: AiProcessingType): string {
    if (!this.config) {
      throw new AiProviderError(this.provider, 'Provider not initialized');
    }

    // Find the first model that supports the requested capability
    const capability = this.getCapabilityForType(type);
    const model = this.config.models.find(m => 
      m.isActive && m.capabilities.includes(capability)
    );

    if (!model) {
      throw new AiProviderError(
        this.provider,
        `No model available for operation: ${type}`,
        404
      );
    }

    return model.name;
  }

  protected getCapabilityForType(type: AiProcessingType): AiCapability {
    const mapping: Record<AiProcessingType, AiCapability> = {
      [AiProcessingType.CLASSIFY_MESSAGE]: AiCapability.CLASSIFICATION,
      [AiProcessingType.GENERATE_RESPONSE]: AiCapability.TEXT_GENERATION,
      [AiProcessingType.ANALYZE_SENTIMENT]: AiCapability.SENTIMENT_ANALYSIS,
      [AiProcessingType.EXTRACT_ENTITIES]: AiCapability.ENTITY_EXTRACTION,
      [AiProcessingType.DETECT_LANGUAGE]: AiCapability.LANGUAGE_DETECTION,
      [AiProcessingType.TRANSLATE_TEXT]: AiCapability.TRANSLATION,
      [AiProcessingType.SUMMARIZE_CONVERSATION]: AiCapability.SUMMARIZATION,
      [AiProcessingType.MODERATE_CONTENT]: AiCapability.MODERATION,
    };

    return mapping[type];
  }

  protected calculateTokensUsed(request: AiProcessingRequest, result: any): {
    input: number;
    output: number;
    total: number;
  } {
    // Basic token estimation - providers should override this
    const inputTokens = Math.ceil(request.input.text.length / 4);
    const outputTokens = result?.content ? Math.ceil(result.content.length / 4) : 0;
    
    return {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens,
    };
  }

  protected calculateCost(
    tokensUsed: { input: number; output: number; total: number },
    model: string
  ): AiCostBreakdown {
    if (!this.config) {
      return {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: 'USD',
        provider: this.provider,
        model,
      };
    }

    const modelConfig = this.config.models.find(m => m.name === model);
    if (!modelConfig) {
      return {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: 'USD',
        provider: this.provider,
        model,
      };
    }

    const inputCost = (tokensUsed.input / 1000) * modelConfig.costPerInputToken;
    const outputCost = (tokensUsed.output / 1000) * modelConfig.costPerOutputToken;
    const totalCost = inputCost + outputCost;

    return {
      inputCost,
      outputCost,
      totalCost,
      currency: this.config.costConfig.currency,
      provider: this.provider,
      model,
    };
  }

  // Provider configuration methods
  public getRateLimits(): AiRateLimits {
    if (!this.config) {
      throw new AiProviderError(this.provider, 'Provider not initialized');
    }
    return this.config.rateLimits;
  }

  public getCostConfig(): AiCostConfig {
    if (!this.config) {
      throw new AiProviderError(this.provider, 'Provider not initialized');
    }
    return this.config.costConfig;
  }

  public getCapabilities(): AiCapability[] {
    if (!this.config) {
      throw new AiProviderError(this.provider, 'Provider not initialized');
    }
    return this.config.features;
  }

  // Validation helpers
  protected validateInitialized(): void {
    if (!this._isInitialized || !this.config) {
      throw new AiProviderError(this.provider, 'Provider not initialized');
    }
  }

  protected validateRequest(request: AiProcessingRequest): void {
    if (!request.input?.text) {
      throw new AiProviderError(
        this.provider,
        'Invalid request: text input is required',
        400
      );
    }

    if (!request.organizationId) {
      throw new AiProviderError(
        this.provider,
        'Invalid request: organizationId is required',
        400
      );
    }
  }

  // Utility methods for building prompts and processing responses
  protected buildSystemPrompt(request: AiProcessingRequest, type: AiProcessingType): string {
    const { context } = request;
    let prompt = '';

    // Add organization context
    if (context?.organizationInfo) {
      const org = context.organizationInfo;
      prompt += `You are an AI assistant for ${org.name}`;
      if (org.industry) prompt += ` in the ${org.industry} industry`;
      prompt += '.\n\n';

      if (org.brandVoice) {
        prompt += `Brand voice: ${org.brandVoice}\n`;
      }

      if (org.policies && Object.keys(org.policies).length > 0) {
        prompt += `Company policies: ${JSON.stringify(org.policies)}\n`;
      }

      if (org.knowledgeBase && org.knowledgeBase.length > 0) {
        prompt += `Knowledge base: ${org.knowledgeBase.join(', ')}\n`;
      }

      prompt += '\n';
    }

    // Add operation-specific instructions
    switch (type) {
      case AiProcessingType.CLASSIFY_MESSAGE:
        prompt += 'Classify the following customer message by category, intent, urgency, and sentiment.';
        break;
      case AiProcessingType.GENERATE_RESPONSE:
        prompt += 'Generate a helpful, professional response to the customer message.';
        break;
      case AiProcessingType.ANALYZE_SENTIMENT:
        prompt += 'Analyze the sentiment of the following text.';
        break;
      default:
        prompt += `Perform ${type.replace('_', ' ')} on the following text.`;
    }

    return prompt;
  }

  protected buildConversationHistory(messages: any[]): string {
    if (!messages || messages.length === 0) {
      return '';
    }

    return messages
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n');
  }
}

export default BaseAiProvider;
