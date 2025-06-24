/**
 * AI-related types for the Universal AI Customer Service Platform
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

export interface AiProviderConfig {
  provider: AiProvider;
  apiKey: string;
  baseUrl?: string;
  organizationId?: string;
  models: AiModelConfig[];
  rateLimits: AiRateLimits;
  costPerToken: AiCostConfig;
  features: AiProviderFeature[];
  priority: number; // Lower number = higher priority
  active: boolean;
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
  latencyMs: number; // Average response time
  qualityScore: number; // 0-100
}

export enum AiModelType {
  CHAT = 'chat',
  COMPLETION = 'completion',
  EMBEDDING = 'embedding',
  CLASSIFICATION = 'classification',
  SENTIMENT = 'sentiment',
  TRANSLATION = 'translation',
  SUMMARIZATION = 'summarization',
}

export enum AiCapability {
  TEXT_GENERATION = 'text_generation',
  TEXT_CLASSIFICATION = 'text_classification',
  SENTIMENT_ANALYSIS = 'sentiment_analysis',
  ENTITY_EXTRACTION = 'entity_extraction',
  LANGUAGE_DETECTION = 'language_detection',
  TRANSLATION = 'translation',
  SUMMARIZATION = 'summarization',
  QUESTION_ANSWERING = 'question_answering',
  CODE_GENERATION = 'code_generation',
  IMAGE_ANALYSIS = 'image_analysis',
  FUNCTION_CALLING = 'function_calling',
}

export enum AiProviderFeature {
  STREAMING = 'streaming',
  FUNCTION_CALLING = 'function_calling',
  VISION = 'vision',
  FINE_TUNING = 'fine_tuning',
  EMBEDDINGS = 'embeddings',
  MODERATION = 'moderation',
  BATCH_PROCESSING = 'batch_processing',
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
export interface AiProcessingRequest {
  type: AiProcessingType;
  input: AiInput;
  context?: AiContext;
  options?: AiProcessingOptions;
  organizationId: string;
  userId?: string;
}

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
  name: string;
  industry?: string;
  businessType?: string;
  products?: string[];
  services?: string[];
  policies?: AiPolicyInfo[];
  knowledgeBase?: AiKnowledgeItem[];
  brandVoice?: AiBrandVoice;
}

export interface AiPolicyInfo {
  type: 'return' | 'refund' | 'shipping' | 'privacy' | 'terms' | 'custom';
  title: string;
  content: string;
  lastUpdated: Date;
}

export interface AiKnowledgeItem {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  relevanceScore?: number;
  lastUpdated: Date;
}

export interface AiBrandVoice {
  tone: 'professional' | 'friendly' | 'casual' | 'formal' | 'empathetic';
  personality: string[];
  doNotUse: string[];
  preferredPhrases: string[];
  culturalConsiderations?: string[];
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
  alternatives?: string[];
  suggestedActions?: AiSuggestedAction[];
  requiresHumanReview: boolean;
  tone: string;
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface AiSuggestedAction {
  type: 'escalate' | 'close' | 'follow_up' | 'create_task' | 'update_crm' | 'send_email';
  description: string;
  parameters?: Record<string, any>;
  confidence: number;
}

export interface AiSentimentResult {
  overall: {
    label: 'positive' | 'neutral' | 'negative';
    score: number; // -1 to 1
    confidence: number;
  };
  emotions?: {
    joy: number;
    anger: number;
    fear: number;
    sadness: number;
    surprise: number;
    disgust: number;
  };
  aspects?: Array<{
    aspect: string;
    sentiment: 'positive' | 'neutral' | 'negative';
    score: number;
    confidence: number;
  }>;
}

export interface AiEntityExtractionResult {
  entities: Array<{
    text: string;
    label: string;
    confidence: number;
    startIndex: number;
    endIndex: number;
    metadata?: Record<string, any>;
  }>;
  relationships?: Array<{
    source: string;
    target: string;
    relation: string;
    confidence: number;
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
  alternatives?: string[];
}

export interface AiSummarizationResult {
  summary: string;
  keyPoints: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  actionItems?: string[];
  confidence: number;
}

export interface AiModerationResult {
  flagged: boolean;
  categories: Array<{
    category: string;
    flagged: boolean;
    score: number;
  }>;
  reasoning?: string;
}

export interface AiResponseMetadata {
  provider: AiProvider;
  model: string;
  requestId: string;
  timestamp: Date;
  processingTimeMs: number;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  rateLimitInfo?: {
    remaining: number;
    resetAt: Date;
  };
}

export interface AiCostBreakdown {
  inputTokens: {
    count: number;
    cost: number;
  };
  outputTokens: {
    count: number;
    cost: number;
  };
  requests: {
    count: number;
    cost: number;
  };
  total: number;
  currency: string;
}

export interface AiPerformanceMetrics {
  latency: number;
  throughput: number;
  accuracy?: number;
  confidence: number;
  qualityScore?: number;
}

// AI Training types
export interface AiTrainingRequest {
  type: AiTrainingType;
  dataset: AiTrainingDataset;
  config: AiTrainingConfig;
  organizationId: string;
}

export enum AiTrainingType {
  CLASSIFICATION = 'classification',
  RESPONSE_GENERATION = 'response_generation',
  SENTIMENT_ANALYSIS = 'sentiment_analysis',
  ENTITY_EXTRACTION = 'entity_extraction',
  FINE_TUNING = 'fine_tuning',
}

export interface AiTrainingDataset {
  name: string;
  description?: string;
  samples: AiTrainingSample[];
  validationSplit?: number;
  metadata?: Record<string, any>;
}

export interface AiTrainingSample {
  input: string;
  output: string;
  category?: string;
  metadata?: Record<string, any>;
  weight?: number;
}

export interface AiTrainingConfig {
  baseModel?: string;
  epochs?: number;
  batchSize?: number;
  learningRate?: number;
  validationSplit?: number;
  earlyStoppingPatience?: number;
  customParameters?: Record<string, any>;
}

export interface AiTrainingJob {
  id: string;
  type: AiTrainingType;
  status: AiTrainingStatus;
  progress: number; // 0-100
  startedAt: Date;
  completedAt?: Date;
  estimatedDuration?: number;
  metrics?: AiTrainingMetrics;
  error?: string;
  modelId?: string;
}

export enum AiTrainingStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface AiTrainingMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  loss: number;
  validationLoss?: number;
  customMetrics?: Record<string, number>;
}
