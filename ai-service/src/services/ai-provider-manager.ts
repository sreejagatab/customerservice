/**
 * AI Provider Manager
 * Manages multiple AI providers with cost optimization and automatic failover
 */

import { 
  IAiProvider,
  AiProvider,
  AiProviderConfig,
  AiProcessingRequest,
  AiProcessingResponse,
  AiProcessingType,
  AiCapability,
} from '@/types/ai';
import { OpenAiProvider } from '@/providers/openai';
import { AnthropicProvider } from '@/providers/anthropic';
// import { GoogleAiProvider } from '@/providers/google'; // Will be created next
import { logger, aiLogger, logAiRequest, logAiResponse, logAiError } from '@/utils/logger';
import { AiProviderError, ConfigurationError } from '@/utils/errors';
import { BaseRepository } from '@/services/database';

interface ProviderPerformanceMetrics {
  providerId: string;
  averageLatency: number;
  successRate: number;
  averageCost: number;
  lastUpdated: Date;
}

interface ProviderSelection {
  provider: IAiProvider;
  config: AiProviderConfig;
  estimatedCost: number;
  estimatedLatency: number;
  confidence: number;
}

export class AiProviderManager extends BaseRepository {
  private static instance: AiProviderManager;
  private providers: Map<string, IAiProvider> = new Map();
  private providerConfigs: Map<string, AiProviderConfig> = new Map();
  private performanceMetrics: Map<string, ProviderPerformanceMetrics> = new Map();
  private isInitialized = false;

  private constructor() {
    super();
  }

  public static getInstance(): AiProviderManager {
    if (!AiProviderManager.instance) {
      AiProviderManager.instance = new AiProviderManager();
    }
    return AiProviderManager.instance;
  }

  public static async initialize(): Promise<void> {
    const instance = AiProviderManager.getInstance();
    await instance.init();
  }

  private async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Register available provider classes
      this.registerProviderClasses();

      // Load provider configurations from database
      await this.loadProviderConfigurations();

      // Initialize active providers
      await this.initializeProviders();

      // Load performance metrics
      await this.loadPerformanceMetrics();

      this.isInitialized = true;
      logger.info('AI Provider Manager initialized', {
        providersCount: this.providers.size,
        activeProviders: Array.from(this.providers.keys()),
      });
    } catch (error) {
      logger.error('Failed to initialize AI Provider Manager', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ConfigurationError('Failed to initialize AI Provider Manager');
    }
  }

  private registerProviderClasses(): void {
    // Register provider classes - these will be instantiated as needed
    this.providerClasses = new Map([
      [AiProvider.OPENAI, OpenAiProvider],
      [AiProvider.ANTHROPIC, AnthropicProvider],
      // [AiProvider.GOOGLE, GoogleAiProvider], // Will be added next
    ]);
  }

  private providerClasses: Map<AiProvider, new () => IAiProvider> = new Map();

  private async loadProviderConfigurations(): Promise<void> {
    try {
      const result = await this.query<AiProviderConfig>(`
        SELECT 
          id,
          organization_id as "organizationId",
          name,
          provider_type as provider,
          api_key_encrypted as "apiKey",
          base_url as "baseUrl",
          organization_identifier as "organizationId",
          rate_limits as "rateLimits",
          cost_config as "costConfig",
          features,
          priority,
          is_active as "isActive"
        FROM ai_providers 
        WHERE is_active = true
        ORDER BY priority ASC
      `);

      for (const config of result.rows) {
        // Decrypt API key (in production, implement proper decryption)
        config.apiKey = this.decryptApiKey(config.apiKey);
        
        // Load models for this provider
        config.models = await this.loadProviderModels(config.id);
        
        this.providerConfigs.set(config.id, config);
      }

      logger.info('Loaded provider configurations', {
        count: this.providerConfigs.size,
      });
    } catch (error) {
      logger.error('Failed to load provider configurations', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async loadProviderModels(providerId: string) {
    const result = await this.query(`
      SELECT 
        name,
        display_name as "displayName",
        model_type as "type",
        max_tokens as "maxTokens",
        context_window as "contextWindow",
        supported_languages as "supportedLanguages",
        capabilities,
        cost_per_input_token as "costPerInputToken",
        cost_per_output_token as "costPerOutputToken",
        average_latency_ms as "averageLatencyMs",
        quality_score as "qualityScore",
        is_active as "isActive"
      FROM ai_models 
      WHERE provider_id = $1 AND is_active = true
    `, [providerId]);

    return result.rows;
  }

  private async initializeProviders(): Promise<void> {
    const initPromises: Promise<void>[] = [];

    for (const [configId, config] of this.providerConfigs) {
      const ProviderClass = this.providerClasses.get(config.provider);
      if (!ProviderClass) {
        logger.warn('Unknown provider type', { provider: config.provider });
        continue;
      }

      const initPromise = this.initializeProvider(configId, config, ProviderClass);
      initPromises.push(initPromise);
    }

    await Promise.allSettled(initPromises);
  }

  private async initializeProvider(
    configId: string,
    config: AiProviderConfig,
    ProviderClass: new () => IAiProvider
  ): Promise<void> {
    try {
      const provider = new ProviderClass();
      await provider.initialize(config);
      
      this.providers.set(configId, provider);
      logger.info('Provider initialized', {
        providerId: configId,
        provider: config.provider,
        name: config.name,
      });
    } catch (error) {
      logger.error('Failed to initialize provider', {
        providerId: configId,
        provider: config.provider,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async loadPerformanceMetrics(): Promise<void> {
    try {
      const result = await this.query<ProviderPerformanceMetrics>(`
        SELECT 
          provider_id as "providerId",
          AVG(CASE WHEN metric_type = 'latency' THEN metric_value END) as "averageLatency",
          AVG(CASE WHEN metric_type = 'success_rate' THEN metric_value END) as "successRate",
          AVG(CASE WHEN metric_type = 'cost' THEN metric_value END) as "averageCost",
          MAX(created_at) as "lastUpdated"
        FROM ai_performance_metrics 
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY provider_id
      `);

      for (const metric of result.rows) {
        this.performanceMetrics.set(metric.providerId, metric);
      }

      logger.info('Loaded performance metrics', {
        count: this.performanceMetrics.size,
      });
    } catch (error) {
      logger.error('Failed to load performance metrics', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Main processing method with provider selection and failover
  public async processRequest(request: AiProcessingRequest): Promise<AiProcessingResponse> {
    if (!this.isInitialized) {
      throw new ConfigurationError('AI Provider Manager not initialized');
    }

    // Select the best provider for this request
    const selection = await this.selectOptimalProvider(request);
    if (!selection) {
      throw new AiProviderError(
        'unknown' as AiProvider,
        'No suitable provider available for this request'
      );
    }

    // Try primary provider
    try {
      const response = await this.executeWithProvider(selection, request);
      await this.recordSuccess(selection.config.id, response);
      return response;
    } catch (error) {
      await this.recordFailure(selection.config.id, error as Error);
      
      // Try failover if enabled
      if (request.options?.fallbackEnabled !== false) {
        const fallbackSelection = await this.selectFallbackProvider(request, selection.config.id);
        if (fallbackSelection) {
          try {
            const response = await this.executeWithProvider(fallbackSelection, request);
            await this.recordSuccess(fallbackSelection.config.id, response);
            return response;
          } catch (fallbackError) {
            await this.recordFailure(fallbackSelection.config.id, fallbackError as Error);
          }
        }
      }

      // If all providers failed, throw the original error
      throw error;
    }
  }

  private async selectOptimalProvider(request: AiProcessingRequest): Promise<ProviderSelection | null> {
    const capability = this.getRequiredCapability(request.type);
    const candidates: ProviderSelection[] = [];

    // Find all providers that support the required capability
    for (const [configId, config] of this.providerConfigs) {
      const provider = this.providers.get(configId);
      if (!provider || !config.isActive) continue;

      // Check if provider supports the required capability
      if (!config.features.includes(capability)) continue;

      // Check if preferred provider is specified
      if (request.options?.preferredProvider && config.provider !== request.options.preferredProvider) {
        continue;
      }

      // Find suitable model
      const model = this.findSuitableModel(config, request);
      if (!model) continue;

      // Calculate estimated cost and latency
      const estimatedCost = this.estimateCost(config, model, request);
      const estimatedLatency = this.estimateLatency(config, model);
      const confidence = this.calculateConfidence(config, model, request);

      candidates.push({
        provider,
        config,
        estimatedCost,
        estimatedLatency,
        confidence,
      });
    }

    if (candidates.length === 0) {
      return null;
    }

    // Sort by optimization criteria (cost, latency, confidence)
    return this.rankProviders(candidates, request)[0] || null;
  }

  private async selectFallbackProvider(
    request: AiProcessingRequest,
    excludeProviderId: string
  ): Promise<ProviderSelection | null> {
    const capability = this.getRequiredCapability(request.type);
    const candidates: ProviderSelection[] = [];

    for (const [configId, config] of this.providerConfigs) {
      if (configId === excludeProviderId) continue; // Skip the failed provider

      const provider = this.providers.get(configId);
      if (!provider || !config.isActive) continue;

      if (!config.features.includes(capability)) continue;

      const model = this.findSuitableModel(config, request);
      if (!model) continue;

      const estimatedCost = this.estimateCost(config, model, request);
      const estimatedLatency = this.estimateLatency(config, model);
      const confidence = this.calculateConfidence(config, model, request);

      candidates.push({
        provider,
        config,
        estimatedCost,
        estimatedLatency,
        confidence,
      });
    }

    // For fallback, prioritize reliability over cost
    return candidates.sort((a, b) => {
      const aMetrics = this.performanceMetrics.get(a.config.id);
      const bMetrics = this.performanceMetrics.get(b.config.id);

      const aReliability = aMetrics?.successRate || 0.8;
      const bReliability = bMetrics?.successRate || 0.8;

      return bReliability - aReliability;
    })[0] || null;
  }

  private async executeWithProvider(
    selection: ProviderSelection,
    request: AiProcessingRequest
  ): Promise<AiProcessingResponse> {
    const { provider } = selection;

    switch (request.type) {
      case AiProcessingType.CLASSIFY_MESSAGE:
        return provider.classifyMessage(request);
      case AiProcessingType.GENERATE_RESPONSE:
        return provider.generateResponse(request);
      case AiProcessingType.ANALYZE_SENTIMENT:
        return provider.analyzeSentiment(request);
      case AiProcessingType.EXTRACT_ENTITIES:
        return provider.extractEntities(request);
      case AiProcessingType.DETECT_LANGUAGE:
        return provider.detectLanguage(request);
      case AiProcessingType.TRANSLATE_TEXT:
        return provider.translateText(request);
      case AiProcessingType.SUMMARIZE_CONVERSATION:
        return provider.summarizeConversation(request);
      case AiProcessingType.MODERATE_CONTENT:
        return provider.moderateContent(request);
      default:
        throw new AiProviderError(
          selection.config.provider,
          `Unsupported operation: ${request.type}`
        );
    }
  }

  private getRequiredCapability(type: AiProcessingType): AiCapability {
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

  private findSuitableModel(config: AiProviderConfig, request: AiProcessingRequest) {
    const capability = this.getRequiredCapability(request.type);

    // If specific model is requested, try to find it
    if (request.options?.preferredModel) {
      const model = config.models.find(m =>
        m.name === request.options?.preferredModel &&
        m.isActive &&
        m.capabilities.includes(capability)
      );
      if (model) return model;
    }

    // Find the best model for this capability
    return config.models
      .filter(m => m.isActive && m.capabilities.includes(capability))
      .sort((a, b) => {
        // Sort by quality score, then by cost efficiency
        if (a.qualityScore !== b.qualityScore) {
          return b.qualityScore - a.qualityScore;
        }
        return a.costPerInputToken - b.costPerInputToken;
      })[0];
  }

  private estimateCost(config: AiProviderConfig, model: any, request: AiProcessingRequest): number {
    // Estimate input tokens
    const inputText = request.input.text +
                     (request.context?.conversationHistory?.map(m => m.content).join(' ') || '');
    const estimatedInputTokens = Math.ceil(inputText.length / 4); // Rough estimation

    // Estimate output tokens based on operation type
    let estimatedOutputTokens = 100; // Default
    switch (request.type) {
      case AiProcessingType.CLASSIFY_MESSAGE:
        estimatedOutputTokens = 50;
        break;
      case AiProcessingType.GENERATE_RESPONSE:
        estimatedOutputTokens = request.options?.maxTokens || 500;
        break;
      case AiProcessingType.SUMMARIZE_CONVERSATION:
        estimatedOutputTokens = 200;
        break;
    }

    const inputCost = (estimatedInputTokens / 1000) * model.costPerInputToken;
    const outputCost = (estimatedOutputTokens / 1000) * model.costPerOutputToken;

    return inputCost + outputCost;
  }

  private estimateLatency(config: AiProviderConfig, model: any): number {
    const metrics = this.performanceMetrics.get(config.id);
    return metrics?.averageLatency || model.averageLatencyMs || 1000;
  }

  private calculateConfidence(config: AiProviderConfig, model: any, request: AiProcessingRequest): number {
    const metrics = this.performanceMetrics.get(config.id);
    const baseConfidence = (model.qualityScore || 80) / 100;
    const reliabilityBonus = (metrics?.successRate || 0.8) * 0.2;

    return Math.min(baseConfidence + reliabilityBonus, 1.0);
  }

  private rankProviders(candidates: ProviderSelection[], request: AiProcessingRequest): ProviderSelection[] {
    // Scoring weights (can be made configurable)
    const weights = {
      cost: 0.3,
      latency: 0.3,
      confidence: 0.4,
    };

    return candidates.sort((a, b) => {
      // Normalize scores (0-1 scale)
      const maxCost = Math.max(...candidates.map(c => c.estimatedCost));
      const maxLatency = Math.max(...candidates.map(c => c.estimatedLatency));

      const aCostScore = 1 - (a.estimatedCost / maxCost);
      const aLatencyScore = 1 - (a.estimatedLatency / maxLatency);
      const aConfidenceScore = a.confidence;

      const bCostScore = 1 - (b.estimatedCost / maxCost);
      const bLatencyScore = 1 - (b.estimatedLatency / maxLatency);
      const bConfidenceScore = b.confidence;

      const aScore = (aCostScore * weights.cost) +
                    (aLatencyScore * weights.latency) +
                    (aConfidenceScore * weights.confidence);

      const bScore = (bCostScore * weights.cost) +
                    (bLatencyScore * weights.latency) +
                    (bConfidenceScore * weights.confidence);

      return bScore - aScore; // Higher score is better
    });
  }

  // Performance tracking methods
  private async recordSuccess(providerId: string, response: AiProcessingResponse): Promise<void> {
    try {
      await this.query(`
        INSERT INTO ai_performance_metrics (
          organization_id, provider_id, metric_type, metric_value,
          measurement_period, period_start, period_end, sample_size
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        'system', // System-level metrics
        providerId,
        'latency',
        response.performance.latency,
        'request',
        new Date(),
        new Date(),
        1
      ]);

      // Update in-memory metrics
      this.updatePerformanceMetrics(providerId, {
        latency: response.performance.latency,
        success: true,
        cost: response.cost.totalCost,
      });
    } catch (error) {
      logger.error('Failed to record success metrics', {
        providerId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async recordFailure(providerId: string, error: Error): Promise<void> {
    try {
      await this.query(`
        INSERT INTO ai_performance_metrics (
          organization_id, provider_id, metric_type, metric_value,
          measurement_period, period_start, period_end, sample_size
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        'system',
        providerId,
        'error_rate',
        1,
        'request',
        new Date(),
        new Date(),
        1
      ]);

      // Update in-memory metrics
      this.updatePerformanceMetrics(providerId, {
        success: false,
      });
    } catch (dbError) {
      logger.error('Failed to record failure metrics', {
        providerId,
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }
  }

  private updatePerformanceMetrics(providerId: string, data: {
    latency?: number;
    success: boolean;
    cost?: number;
  }): void {
    const existing = this.performanceMetrics.get(providerId);
    if (!existing) {
      this.performanceMetrics.set(providerId, {
        providerId,
        averageLatency: data.latency || 1000,
        successRate: data.success ? 1 : 0,
        averageCost: data.cost || 0,
        lastUpdated: new Date(),
      });
      return;
    }

    // Simple moving average update
    const alpha = 0.1; // Learning rate
    if (data.latency) {
      existing.averageLatency = existing.averageLatency * (1 - alpha) + data.latency * alpha;
    }
    if (data.cost) {
      existing.averageCost = existing.averageCost * (1 - alpha) + data.cost * alpha;
    }
    existing.successRate = existing.successRate * (1 - alpha) + (data.success ? 1 : 0) * alpha;
    existing.lastUpdated = new Date();
  }

  // Utility methods
  private decryptApiKey(encryptedKey: string): string {
    // In production, implement proper decryption
    // For now, assume keys are stored in plain text (NOT RECOMMENDED)
    return encryptedKey;
  }

  // Public methods for external use
  public async getProviderStatus(): Promise<Array<{
    id: string;
    name: string;
    provider: AiProvider;
    isActive: boolean;
    isHealthy: boolean;
    metrics?: ProviderPerformanceMetrics;
  }>> {
    const status = [];

    for (const [configId, config] of this.providerConfigs) {
      const provider = this.providers.get(configId);
      const isHealthy = provider ? await provider.healthCheck() : false;
      const metrics = this.performanceMetrics.get(configId);

      status.push({
        id: configId,
        name: config.name,
        provider: config.provider,
        isActive: config.isActive,
        isHealthy,
        metrics,
      });
    }

    return status;
  }

  public async addProvider(config: AiProviderConfig): Promise<void> {
    // Save to database
    await this.query(`
      INSERT INTO ai_providers (
        id, organization_id, name, provider_type, api_key_encrypted,
        base_url, organization_identifier, rate_limits, cost_config,
        features, priority, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      config.id,
      config.organizationId,
      config.name,
      config.provider,
      config.apiKey, // Should be encrypted in production
      config.baseUrl,
      config.organizationId,
      JSON.stringify(config.rateLimits),
      JSON.stringify(config.costConfig),
      JSON.stringify(config.features),
      config.priority,
      config.isActive,
    ]);

    // Add to memory and initialize
    this.providerConfigs.set(config.id, config);

    const ProviderClass = this.providerClasses.get(config.provider);
    if (ProviderClass) {
      await this.initializeProvider(config.id, config, ProviderClass);
    }
  }

  public async removeProvider(providerId: string): Promise<void> {
    // Remove from database
    await this.query('DELETE FROM ai_providers WHERE id = $1', [providerId]);

    // Remove from memory
    this.providerConfigs.delete(providerId);
    this.providers.delete(providerId);
    this.performanceMetrics.delete(providerId);
  }

  public getAvailableProviders(): AiProvider[] {
    return Array.from(this.providerClasses.keys());
  }

  public isInitialized(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance
export const aiProviderManager = AiProviderManager.getInstance();
export default AiProviderManager;
