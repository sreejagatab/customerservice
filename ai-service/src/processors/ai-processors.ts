/**
 * AI Queue Processors
 * Handles AI processing jobs from the queue system
 */

import { Job } from 'bull';
import { 
  AiJobType,
  ClassifyMessageJobData,
  GenerateResponseJobData,
  AnalyzeSentimentJobData,
  ExtractEntitiesJobData,
  DetectLanguageJobData,
  TranslateTextJobData,
  SummarizeConversationJobData,
  ModerateContentJobData,
} from '@/services/queue';
import { messageClassificationService } from '@/services/classification';
import { responseGenerationService } from '@/services/response-generation';
import { performanceMonitoringService } from '@/services/performance-monitoring';
import { aiProviderManager } from '@/services/ai-provider-manager';
import { logger, queueLogger, logQueueJob } from '@/utils/logger';
import { AiProcessingRequest, AiProcessingType } from '@/types/ai';

/**
 * Process message classification jobs
 */
export async function processClassifyMessage(job: Job<ClassifyMessageJobData>): Promise<any> {
  const startTime = Date.now();
  const { data } = job;
  
  logQueueJob(AiJobType.CLASSIFY_MESSAGE, job.id.toString(), 'started', {
    messageId: data.messageId,
    organizationId: data.organizationId,
  });

  try {
    const result = await messageClassificationService.classifyMessage({
      messageId: data.messageId,
      organizationId: data.organizationId,
      integrationId: data.integrationId,
      messageText: data.messageText,
      messageHtml: data.messageHtml,
      context: data.context,
      options: data.options,
    });

    // Record performance metrics
    await performanceMonitoringService.recordMetrics(
      data.organizationId,
      'system', // Provider ID would come from result
      {
        latency: result.processingTime,
        cost: result.cost,
        accuracy: result.classification.confidence,
      },
      {
        operation: 'classification',
        messageId: data.messageId,
      }
    );

    // Send result back to Integration Service
    await notifyIntegrationService(data.messageId, 'classification', result);

    logQueueJob(AiJobType.CLASSIFY_MESSAGE, job.id.toString(), 'completed', {
      messageId: data.messageId,
      category: result.classification.category,
      confidence: result.classification.confidence,
      processingTime: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    logQueueJob(AiJobType.CLASSIFY_MESSAGE, job.id.toString(), 'failed', {
      messageId: data.messageId,
      error: error instanceof Error ? error.message : String(error),
      processingTime: Date.now() - startTime,
    });
    throw error;
  }
}

/**
 * Process response generation jobs
 */
export async function processGenerateResponse(job: Job<GenerateResponseJobData>): Promise<any> {
  const startTime = Date.now();
  const { data } = job;
  
  logQueueJob(AiJobType.GENERATE_RESPONSE, job.id.toString(), 'started', {
    messageId: data.messageId,
    organizationId: data.organizationId,
  });

  try {
    const result = await responseGenerationService.generateResponse({
      messageId: data.messageId,
      organizationId: data.organizationId,
      integrationId: data.integrationId,
      messageText: data.messageText,
      classification: data.classification,
      conversationContext: data.conversationContext,
      organizationContext: data.organizationContext,
      options: data.options,
    });

    // Record performance metrics
    await performanceMonitoringService.recordMetrics(
      data.organizationId,
      'system', // Provider ID would come from result
      {
        latency: result.processingTime,
        cost: result.cost,
        quality: result.qualityScore,
      },
      {
        operation: 'response_generation',
        messageId: data.messageId,
      }
    );

    // Send result back to Integration Service
    await notifyIntegrationService(data.messageId, 'response', result);

    logQueueJob(AiJobType.GENERATE_RESPONSE, job.id.toString(), 'completed', {
      messageId: data.messageId,
      confidence: result.response.confidence,
      qualityScore: result.qualityScore,
      processingTime: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    logQueueJob(AiJobType.GENERATE_RESPONSE, job.id.toString(), 'failed', {
      messageId: data.messageId,
      error: error instanceof Error ? error.message : String(error),
      processingTime: Date.now() - startTime,
    });
    throw error;
  }
}

/**
 * Process sentiment analysis jobs
 */
export async function processAnalyzeSentiment(job: Job<AnalyzeSentimentJobData>): Promise<any> {
  const startTime = Date.now();
  const { data } = job;
  
  logQueueJob(AiJobType.ANALYZE_SENTIMENT, job.id.toString(), 'started', {
    messageId: data.messageId,
    organizationId: data.organizationId,
  });

  try {
    const aiRequest: AiProcessingRequest = {
      type: AiProcessingType.ANALYZE_SENTIMENT,
      input: { text: data.text },
      options: data.options,
      organizationId: data.organizationId,
    };

    const result = await aiProviderManager.processRequest(aiRequest);

    // Send result back to Integration Service
    await notifyIntegrationService(data.messageId, 'sentiment', result);

    logQueueJob(AiJobType.ANALYZE_SENTIMENT, job.id.toString(), 'completed', {
      messageId: data.messageId,
      sentiment: (result.result as any).label,
      processingTime: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    logQueueJob(AiJobType.ANALYZE_SENTIMENT, job.id.toString(), 'failed', {
      messageId: data.messageId,
      error: error instanceof Error ? error.message : String(error),
      processingTime: Date.now() - startTime,
    });
    throw error;
  }
}

/**
 * Process entity extraction jobs
 */
export async function processExtractEntities(job: Job<ExtractEntitiesJobData>): Promise<any> {
  const startTime = Date.now();
  const { data } = job;
  
  logQueueJob(AiJobType.EXTRACT_ENTITIES, job.id.toString(), 'started', {
    messageId: data.messageId,
    organizationId: data.organizationId,
  });

  try {
    const aiRequest: AiProcessingRequest = {
      type: AiProcessingType.EXTRACT_ENTITIES,
      input: { text: data.text },
      options: data.options,
      organizationId: data.organizationId,
    };

    const result = await aiProviderManager.processRequest(aiRequest);

    // Send result back to Integration Service
    await notifyIntegrationService(data.messageId, 'entities', result);

    logQueueJob(AiJobType.EXTRACT_ENTITIES, job.id.toString(), 'completed', {
      messageId: data.messageId,
      entitiesCount: (result.result as any).entities?.length || 0,
      processingTime: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    logQueueJob(AiJobType.EXTRACT_ENTITIES, job.id.toString(), 'failed', {
      messageId: data.messageId,
      error: error instanceof Error ? error.message : String(error),
      processingTime: Date.now() - startTime,
    });
    throw error;
  }
}

/**
 * Process language detection jobs
 */
export async function processDetectLanguage(job: Job<DetectLanguageJobData>): Promise<any> {
  const startTime = Date.now();
  const { data } = job;
  
  logQueueJob(AiJobType.DETECT_LANGUAGE, job.id.toString(), 'started', {
    messageId: data.messageId,
    organizationId: data.organizationId,
  });

  try {
    const aiRequest: AiProcessingRequest = {
      type: AiProcessingType.DETECT_LANGUAGE,
      input: { text: data.text },
      options: data.options,
      organizationId: data.organizationId,
    };

    const result = await aiProviderManager.processRequest(aiRequest);

    // Send result back to Integration Service
    await notifyIntegrationService(data.messageId, 'language', result);

    logQueueJob(AiJobType.DETECT_LANGUAGE, job.id.toString(), 'completed', {
      messageId: data.messageId,
      language: (result.result as any).language,
      processingTime: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    logQueueJob(AiJobType.DETECT_LANGUAGE, job.id.toString(), 'failed', {
      messageId: data.messageId,
      error: error instanceof Error ? error.message : String(error),
      processingTime: Date.now() - startTime,
    });
    throw error;
  }
}

/**
 * Process translation jobs
 */
export async function processTranslateText(job: Job<TranslateTextJobData>): Promise<any> {
  const startTime = Date.now();
  const { data } = job;
  
  logQueueJob(AiJobType.TRANSLATE_TEXT, job.id.toString(), 'started', {
    messageId: data.messageId,
    organizationId: data.organizationId,
    targetLanguage: data.targetLanguage,
  });

  try {
    const aiRequest: AiProcessingRequest = {
      type: AiProcessingType.TRANSLATE_TEXT,
      input: { text: data.text },
      options: {
        ...data.options,
        customPrompt: data.targetLanguage,
      },
      organizationId: data.organizationId,
    };

    const result = await aiProviderManager.processRequest(aiRequest);

    // Send result back to Integration Service
    await notifyIntegrationService(data.messageId, 'translation', result);

    logQueueJob(AiJobType.TRANSLATE_TEXT, job.id.toString(), 'completed', {
      messageId: data.messageId,
      targetLanguage: data.targetLanguage,
      processingTime: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    logQueueJob(AiJobType.TRANSLATE_TEXT, job.id.toString(), 'failed', {
      messageId: data.messageId,
      error: error instanceof Error ? error.message : String(error),
      processingTime: Date.now() - startTime,
    });
    throw error;
  }
}

/**
 * Process conversation summarization jobs
 */
export async function processSummarizeConversation(job: Job<SummarizeConversationJobData>): Promise<any> {
  const startTime = Date.now();
  const { data } = job;
  
  logQueueJob(AiJobType.SUMMARIZE_CONVERSATION, job.id.toString(), 'started', {
    conversationId: data.conversationId,
    organizationId: data.organizationId,
  });

  try {
    // Build conversation text
    const conversationText = data.messages
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n');

    const aiRequest: AiProcessingRequest = {
      type: AiProcessingType.SUMMARIZE_CONVERSATION,
      input: { text: conversationText },
      options: data.options,
      organizationId: data.organizationId,
    };

    const result = await aiProviderManager.processRequest(aiRequest);

    // Send result back to Integration Service
    await notifyIntegrationService(data.conversationId, 'summary', result);

    logQueueJob(AiJobType.SUMMARIZE_CONVERSATION, job.id.toString(), 'completed', {
      conversationId: data.conversationId,
      messagesCount: data.messages.length,
      processingTime: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    logQueueJob(AiJobType.SUMMARIZE_CONVERSATION, job.id.toString(), 'failed', {
      conversationId: data.conversationId,
      error: error instanceof Error ? error.message : String(error),
      processingTime: Date.now() - startTime,
    });
    throw error;
  }
}

/**
 * Process content moderation jobs
 */
export async function processModerateContent(job: Job<ModerateContentJobData>): Promise<any> {
  const startTime = Date.now();
  const { data } = job;
  
  logQueueJob(AiJobType.MODERATE_CONTENT, job.id.toString(), 'started', {
    messageId: data.messageId,
    organizationId: data.organizationId,
  });

  try {
    const aiRequest: AiProcessingRequest = {
      type: AiProcessingType.MODERATE_CONTENT,
      input: { text: data.text },
      options: data.options,
      organizationId: data.organizationId,
    };

    const result = await aiProviderManager.processRequest(aiRequest);

    // Send result back to Integration Service
    await notifyIntegrationService(data.messageId, 'moderation', result);

    logQueueJob(AiJobType.MODERATE_CONTENT, job.id.toString(), 'completed', {
      messageId: data.messageId,
      flagged: (result.result as any).flagged,
      processingTime: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    logQueueJob(AiJobType.MODERATE_CONTENT, job.id.toString(), 'failed', {
      messageId: data.messageId,
      error: error instanceof Error ? error.message : String(error),
      processingTime: Date.now() - startTime,
    });
    throw error;
  }
}

/**
 * Notify Integration Service of completed AI processing
 */
async function notifyIntegrationService(
  messageId: string,
  resultType: string,
  result: any
): Promise<void> {
  try {
    // This would make an HTTP request to the Integration Service
    // For now, we'll just log the notification
    logger.info('Notifying Integration Service', {
      messageId,
      resultType,
      timestamp: new Date().toISOString(),
    });

    // In production, this would be:
    // await axios.post(`${config.services.integration.url}/api/v1/ai-results`, {
    //   messageId,
    //   resultType,
    //   result,
    //   timestamp: new Date().toISOString(),
    // }, {
    //   headers: {
    //     'Authorization': `Bearer ${config.services.integration.apiKey}`,
    //     'Content-Type': 'application/json',
    //   },
    // });
  } catch (error) {
    logger.error('Failed to notify Integration Service', {
      messageId,
      resultType,
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - the AI processing succeeded even if notification failed
  }
}

export default {
  processClassifyMessage,
  processGenerateResponse,
  processAnalyzeSentiment,
  processExtractEntities,
  processDetectLanguage,
  processTranslateText,
  processSummarizeConversation,
  processModerateContent,
};
