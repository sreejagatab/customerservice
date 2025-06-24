/**
 * AI-related types for the AI Service
 */

// AI Provider types
export enum AiProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  AZURE_OPENAI = 'azure_openai',
  COHERE = 'cohere',
  HUGGING_FACE = 'hugging_face',
  CUSTOM = 'custom',
}

export enum AiModelType {
  CHAT = 'chat',
  COMPLETION = 'completion',
  EMBEDDING = 'embedding',
  CLASSIFICATION = 'classification',
  SENTIMENT = 'sentiment',
  TRANSLATION = 'translation',
  SUMMARIZATION = 'summarization',
  MODERATION = 'moderation',
}

export enum AiCapability {
  TEXT_GENERATION = 'text_generation',
  CLASSIFICATION = 'classification',
  SENTIMENT_ANALYSIS = 'sentiment_analysis',
  ENTITY_EXTRACTION = 'entity_extraction',
  LANGUAGE_DETECTION = 'language_detection',
  TRANSLATION = 'translation',
  SUMMARIZATION = 'summarization',
  MODERATION = 'moderation',
  FUNCTION_CALLING = 'function_calling',
  VISION = 'vision',
  AUDIO = 'audio',
}

export interface AiProviderConfig {
  id: string;
  organizationId: string;
  name: string;
  provider: AiProvider;
  apiKey: string;
  baseUrl?: string;
  organizationId?: string;
  models: AiModelConfig[];
  rateLimits: AiRateLimits;
  costConfig: AiCostConfig;
  features: AiCapability[];
  priority: number; // Lower number = higher priority
  isActive: boolean;
  metadata?: Record<string, any>;
}

export interface AiModelConfig {
  name: string;
  displayName: string;
  type: AiModelType;
  maxTokens: number;
  contextWindow: number;
  supportedLanguages: string[];
  capabilities: AiCapability[];
  costPerInputToken: number;
  costPerOutputToken: number;
  averageLatencyMs: number;
  qualityScore: number; // 0-100
  isActive: boolean;
}

export interface AiRateLimits {
  requestsPerMinute: number;
  tokensPerMinute: number;
  requestsPerDay?: number;
  tokensPerDay?: number;
  concurrentRequests: number;
}

export interface AiCostConfig {
  inputTokens: number; // Cost per 1K input tokens
  outputTokens: number; // Cost per 1K output tokens
  requests?: number; // Cost per request (if applicable)
  currency: string;
}

// AI Processing types
export enum AiProcessingType {
  CLASSIFY_MESSAGE = 'classify_message',
  GENERATE_RESPONSE = 'generate_response',
  ANALYZE_SENTIMENT = 'analyze_sentiment',
  EXTRACT_ENTITIES = 'extract_entities',
  DETECT_LANGUAGE = 'detect_language',
  TRANSLATE_TEXT = 'translate_text',
  SUMMARIZE_CONVERSATION = 'summarize_conversation',
  MODERATE_CONTENT = 'moderate_content',
}

export interface AiProcessingRequest {
  type: AiProcessingType;
  input: AiInput;
  context?: AiContext;
  options?: AiProcessingOptions;
  organizationId: string;
  userId?: string;
}

export interface AiInput {
  text: string;
  html?: string;
  attachments?: AiAttachment[];
  metadata?: Record<string, any>;
}

export interface AiAttachment {
  type: 'image' | 'document' | 'audio' | 'video';
  url: string;
  mimeType: string;
  size: number;
  description?: string;
}

export interface AiContext {
  conversationHistory?: AiConversationMessage[];
  customerInfo?: AiCustomerInfo;
  organizationInfo?: AiOrganizationInfo;
  previousClassifications?: AiClassificationResult[];
  customContext?: Record<string, any>;
}

export interface AiConversationMessage {
  role: 'customer' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AiCustomerInfo {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  tier?: string;
  language?: string;
  timezone?: string;
  previousInteractions?: number;
  satisfactionScore?: number;
  customFields?: Record<string, any>;
}

export interface AiOrganizationInfo {
  id: string;
  name: string;
  industry?: string;
  businessType?: string;
  products?: string[];
  policies?: Record<string, any>;
  knowledgeBase?: string[];
  brandVoice?: string;
  supportHours?: string;
  customFields?: Record<string, any>;
}

export interface AiProcessingOptions {
  preferredProvider?: AiProvider;
  preferredModel?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  stream?: boolean;
  includeReasoning?: boolean;
  confidenceThreshold?: number;
  fallbackEnabled?: boolean;
  customPrompt?: string;
}

// AI Response types
export interface AiProcessingResponse {
  id: string;
  type: AiProcessingType;
  result: AiProcessingResult;
  metadata: AiResponseMetadata;
  cost: AiCostBreakdown;
  performance: AiPerformanceMetrics;
}

export type AiProcessingResult = 
  | AiClassificationResult
  | AiGenerationResult
  | AiSentimentResult
  | AiEntityExtractionResult
  | AiLanguageDetectionResult
  | AiTranslationResult
  | AiSummarizationResult
  | AiModerationResult;

export interface AiClassificationResult {
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
}

export interface AiGenerationResult {
  content: string;
  confidence: number;
  reasoning?: string;
  suggestedActions?: string[];
  requiresHumanReview: boolean;
  alternatives?: string[];
}

export interface AiSentimentResult {
  score: number; // -1 to 1
  label: 'positive' | 'negative' | 'neutral';
  confidence: number;
  emotions?: Array<{
    emotion: string;
    score: number;
  }>;
}

export interface AiEntityExtractionResult {
  entities: Array<{
    text: string;
    label: string;
    confidence: number;
    start: number;
    end: number;
  }>;
}

export interface AiLanguageDetectionResult {
  language: string;
  confidence: number;
  alternatives?: Array<{
    language: string;
    confidence: number;
  }>;
}

export interface AiTranslationResult {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  confidence: number;
}

export interface AiSummarizationResult {
  summary: string;
  keyPoints?: string[];
  confidence: number;
}

export interface AiModerationResult {
  flagged: boolean;
  categories: Array<{
    category: string;
    flagged: boolean;
    score: number;
  }>;
  confidence: number;
}

export interface AiResponseMetadata {
  provider: AiProvider;
  model: string;
  requestId: string;
  processingTimeMs: number;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  rateLimitInfo?: {
    remaining: number;
    resetTime: Date;
  };
}

export interface AiCostBreakdown {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
  provider: AiProvider;
  model: string;
}

export interface AiPerformanceMetrics {
  latency: number;
  throughput?: number;
  accuracy?: number;
  qualityScore?: number;
}

// Provider-specific interfaces
export interface OpenAiConfig {
  apiKey: string;
  organizationId?: string;
  baseUrl?: string;
}

export interface AnthropicConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface GoogleAiConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface AzureOpenAiConfig {
  apiKey: string;
  endpoint: string;
  apiVersion?: string;
}

// Error types
export interface AiError {
  code: string;
  message: string;
  provider: AiProvider;
  model?: string;
  details?: Record<string, any>;
}

// Provider interface
export interface IAiProvider {
  readonly provider: AiProvider;
  readonly name: string;
  readonly isInitialized: boolean;

  initialize(config: AiProviderConfig): Promise<void>;
  healthCheck(): Promise<boolean>;
  
  // Core AI operations
  classifyMessage(request: AiProcessingRequest): Promise<AiProcessingResponse>;
  generateResponse(request: AiProcessingRequest): Promise<AiProcessingResponse>;
  analyzeSentiment(request: AiProcessingRequest): Promise<AiProcessingResponse>;
  extractEntities(request: AiProcessingRequest): Promise<AiProcessingResponse>;
  detectLanguage(request: AiProcessingRequest): Promise<AiProcessingResponse>;
  translateText(request: AiProcessingRequest): Promise<AiProcessingResponse>;
  summarizeConversation(request: AiProcessingRequest): Promise<AiProcessingResponse>;
  moderateContent(request: AiProcessingRequest): Promise<AiProcessingResponse>;

  // Provider management
  getAvailableModels(): Promise<AiModelConfig[]>;
  getRateLimits(): AiRateLimits;
  getCostConfig(): AiCostConfig;
  getCapabilities(): AiCapability[];
}

export default {
  AiProvider,
  AiModelType,
  AiCapability,
  AiProcessingType,
};
