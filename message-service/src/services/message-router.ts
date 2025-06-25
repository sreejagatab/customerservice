/**
 * Message Routing Service
 * Handles intelligent message routing based on rules, AI classification, and business logic
 */

import { config } from '@/config';
import { logger, messageLogger } from '@/utils/logger';
import { MessageProcessingError } from '@/utils/errors';
import { MessageEntity } from '@/repositories/message.repository';
import { messageQueue, QueueMessage, MessageQueueService } from '@/services/queue';
import { redis } from '@/services/redis';

export interface RoutingRule {
  id: string;
  name: string;
  organizationId: string;
  priority: number;
  conditions: RoutingCondition[];
  actions: RoutingAction[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoutingCondition {
  type: 'content_contains' | 'sender_email' | 'ai_classification' | 'sentiment' | 'urgency' | 'time_of_day' | 'custom';
  operator: 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'regex' | 'greater_than' | 'less_than' | 'in' | 'not_in';
  value: any;
  field?: string;
}

export interface RoutingAction {
  type: 'assign_to_agent' | 'assign_to_team' | 'set_priority' | 'add_tags' | 'trigger_webhook' | 'auto_respond' | 'escalate';
  parameters: Record<string, any>;
}

export interface RoutingResult {
  messageId: string;
  appliedRules: string[];
  actions: RoutingAction[];
  assignedTo?: string;
  priority?: string;
  tags?: string[];
  autoResponse?: string;
  webhookTriggered?: boolean;
  processingTime: number;
}

export class MessageRouterService {
  private static instance: MessageRouterService;
  private routingRules: Map<string, RoutingRule[]> = new Map(); // organizationId -> rules
  private lastRulesUpdate: Date = new Date(0);

  private constructor() {}

  public static getInstance(): MessageRouterService {
    if (!MessageRouterService.instance) {
      MessageRouterService.instance = new MessageRouterService();
    }
    return MessageRouterService.instance;
  }

  /**
   * Route message based on rules and AI classification
   */
  public async routeMessage(message: MessageEntity): Promise<RoutingResult> {
    const startTime = Date.now();
    const organizationId = message.metadata.organizationId;

    try {
      messageLogger.info('Starting message routing', {
        messageId: message.id,
        organizationId,
        direction: message.direction,
      });

      // Load routing rules for organization
      const rules = await this.getRoutingRules(organizationId);

      // Evaluate rules and collect actions
      const appliedRules: string[] = [];
      const actions: RoutingAction[] = [];

      for (const rule of rules) {
        if (await this.evaluateRule(rule, message)) {
          appliedRules.push(rule.id);
          actions.push(...rule.actions);
          
          messageLogger.info('Routing rule applied', {
            messageId: message.id,
            ruleId: rule.id,
            ruleName: rule.name,
          });
        }
      }

      // Execute actions
      const result = await this.executeActions(message, actions);

      const processingTime = Date.now() - startTime;

      messageLogger.info('Message routing completed', {
        messageId: message.id,
        appliedRules: appliedRules.length,
        actions: actions.length,
        processingTime,
      });

      return {
        messageId: message.id,
        appliedRules,
        actions,
        ...result,
        processingTime,
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      messageLogger.error('Message routing failed', {
        messageId: message.id,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
        processingTime,
      });

      throw new MessageProcessingError(`Message routing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get routing rules for organization (with caching)
   */
  private async getRoutingRules(organizationId: string): Promise<RoutingRule[]> {
    // Check cache first
    const cacheKey = `routing_rules:${organizationId}`;
    const cachedRules = await redis.get<RoutingRule[]>(cacheKey);
    
    if (cachedRules && this.isRulesCacheValid()) {
      return cachedRules;
    }

    // Load from database (mock implementation)
    const rules = await this.loadRoutingRulesFromDatabase(organizationId);
    
    // Cache for 5 minutes
    await redis.set(cacheKey, rules, { ttl: 300 });
    
    return rules;
  }

  /**
   * Evaluate if a rule matches the message
   */
  private async evaluateRule(rule: RoutingRule, message: MessageEntity): Promise<boolean> {
    if (!rule.isActive) {
      return false;
    }

    // All conditions must be true (AND logic)
    for (const condition of rule.conditions) {
      if (!(await this.evaluateCondition(condition, message))) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a single condition
   */
  private async evaluateCondition(condition: RoutingCondition, message: MessageEntity): Promise<boolean> {
    let actualValue: any;

    // Get the actual value based on condition type
    switch (condition.type) {
      case 'content_contains':
        actualValue = message.content.text.toLowerCase();
        break;
      
      case 'sender_email':
        actualValue = message.sender.email?.toLowerCase();
        break;
      
      case 'ai_classification':
        actualValue = message.aiClassification?.[condition.field || 'category'];
        break;
      
      case 'sentiment':
        actualValue = message.aiClassification?.sentiment?.label;
        break;
      
      case 'urgency':
        actualValue = message.aiClassification?.urgency;
        break;
      
      case 'time_of_day':
        const hour = new Date().getHours();
        actualValue = hour;
        break;
      
      case 'custom':
        actualValue = this.getCustomFieldValue(message, condition.field || '');
        break;
      
      default:
        return false;
    }

    // Apply operator
    return this.applyOperator(actualValue, condition.operator, condition.value);
  }

  /**
   * Apply comparison operator
   */
  private applyOperator(actualValue: any, operator: string, expectedValue: any): boolean {
    if (actualValue === null || actualValue === undefined) {
      return false;
    }

    switch (operator) {
      case 'equals':
        return actualValue === expectedValue;
      
      case 'contains':
        return String(actualValue).includes(String(expectedValue));
      
      case 'starts_with':
        return String(actualValue).startsWith(String(expectedValue));
      
      case 'ends_with':
        return String(actualValue).endsWith(String(expectedValue));
      
      case 'regex':
        try {
          const regex = new RegExp(expectedValue);
          return regex.test(String(actualValue));
        } catch {
          return false;
        }
      
      case 'greater_than':
        return Number(actualValue) > Number(expectedValue);
      
      case 'less_than':
        return Number(actualValue) < Number(expectedValue);
      
      case 'in':
        return Array.isArray(expectedValue) && expectedValue.includes(actualValue);
      
      case 'not_in':
        return Array.isArray(expectedValue) && !expectedValue.includes(actualValue);
      
      default:
        return false;
    }
  }

  /**
   * Execute routing actions
   */
  private async executeActions(message: MessageEntity, actions: RoutingAction[]): Promise<Partial<RoutingResult>> {
    const result: Partial<RoutingResult> = {};

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'assign_to_agent':
            result.assignedTo = action.parameters.agentId;
            await this.assignToAgent(message.id, action.parameters.agentId);
            break;
          
          case 'assign_to_team':
            await this.assignToTeam(message.id, action.parameters.teamId);
            break;
          
          case 'set_priority':
            result.priority = action.parameters.priority;
            await this.setPriority(message.conversationId, action.parameters.priority);
            break;
          
          case 'add_tags':
            result.tags = action.parameters.tags;
            await this.addTags(message.conversationId, action.parameters.tags);
            break;
          
          case 'trigger_webhook':
            result.webhookTriggered = await this.triggerWebhook(message, action.parameters);
            break;
          
          case 'auto_respond':
            result.autoResponse = await this.sendAutoResponse(message, action.parameters);
            break;
          
          case 'escalate':
            await this.escalateMessage(message, action.parameters);
            break;
        }
      } catch (error) {
        messageLogger.error('Error executing routing action', {
          messageId: message.id,
          actionType: action.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * Assign message to specific agent
   */
  private async assignToAgent(messageId: string, agentId: string): Promise<void> {
    // Queue assignment task
    const queueMessage: QueueMessage = {
      id: `assign-${messageId}-${Date.now()}`,
      type: 'message.assign',
      data: {
        messageId,
        agentId,
        assignedAt: new Date().toISOString(),
      },
      timestamp: new Date(),
      attempts: 0,
      maxAttempts: 3,
    };

    await messageQueue.publishMessage(MessageQueueService.QUEUES.MESSAGE_ROUTING, queueMessage);
  }

  /**
   * Assign message to team
   */
  private async assignToTeam(messageId: string, teamId: string): Promise<void> {
    // Implementation would assign to next available agent in team
    messageLogger.info('Assigning message to team', { messageId, teamId });
  }

  /**
   * Set conversation priority
   */
  private async setPriority(conversationId: string, priority: string): Promise<void> {
    // Implementation would update conversation priority
    messageLogger.info('Setting conversation priority', { conversationId, priority });
  }

  /**
   * Add tags to conversation
   */
  private async addTags(conversationId: string, tags: string[]): Promise<void> {
    // Implementation would add tags to conversation
    messageLogger.info('Adding tags to conversation', { conversationId, tags });
  }

  /**
   * Trigger webhook
   */
  private async triggerWebhook(message: MessageEntity, parameters: Record<string, any>): Promise<boolean> {
    try {
      const webhookMessage: QueueMessage = {
        id: `webhook-${message.id}-${Date.now()}`,
        type: 'webhook.trigger',
        data: {
          messageId: message.id,
          webhookUrl: parameters.url,
          event: parameters.event || 'message.routed',
          payload: {
            message,
            timestamp: new Date().toISOString(),
          },
        },
        timestamp: new Date(),
        attempts: 0,
        maxAttempts: 3,
      };

      await messageQueue.publishMessage(MessageQueueService.QUEUES.WEBHOOK_DELIVERY, webhookMessage);
      return true;
    } catch (error) {
      messageLogger.error('Error triggering webhook', {
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Send auto response
   */
  private async sendAutoResponse(message: MessageEntity, parameters: Record<string, any>): Promise<string> {
    const responseText = parameters.template || 'Thank you for your message. We will get back to you soon.';
    
    // Queue auto response
    const queueMessage: QueueMessage = {
      id: `auto-response-${message.id}-${Date.now()}`,
      type: 'message.auto_response',
      data: {
        conversationId: message.conversationId,
        responseText,
        originalMessageId: message.id,
      },
      timestamp: new Date(),
      attempts: 0,
      maxAttempts: 3,
    };

    await messageQueue.publishMessage(MessageQueueService.QUEUES.MESSAGE_DELIVERY, queueMessage);
    
    return responseText;
  }

  /**
   * Escalate message
   */
  private async escalateMessage(message: MessageEntity, parameters: Record<string, any>): Promise<void> {
    messageLogger.info('Escalating message', {
      messageId: message.id,
      escalationLevel: parameters.level,
      reason: parameters.reason,
    });
  }

  // Helper methods
  private getCustomFieldValue(message: MessageEntity, field: string): any {
    const fieldPath = field.split('.');
    let value: any = message;
    
    for (const part of fieldPath) {
      value = value?.[part];
    }
    
    return value;
  }

  private isRulesCacheValid(): boolean {
    const cacheValidityPeriod = 5 * 60 * 1000; // 5 minutes
    return Date.now() - this.lastRulesUpdate.getTime() < cacheValidityPeriod;
  }

  private async loadRoutingRulesFromDatabase(organizationId: string): Promise<RoutingRule[]> {
    // Mock implementation - in real app, this would query the database
    return [
      {
        id: 'rule-1',
        name: 'High Priority Keywords',
        organizationId,
        priority: 1,
        conditions: [
          {
            type: 'content_contains',
            operator: 'contains',
            value: 'urgent',
          },
        ],
        actions: [
          {
            type: 'set_priority',
            parameters: { priority: 'high' },
          },
        ],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  }
}

// Export singleton instance
export const messageRouter = MessageRouterService.getInstance();
