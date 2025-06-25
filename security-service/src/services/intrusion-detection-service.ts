/**
 * Intrusion Detection Service
 * Real-time monitoring and detection of security intrusions
 */

import { logger } from '@universal-ai-cs/shared';
import axios from 'axios';

export interface IntrusionEvent {
  id: string;
  timestamp: Date;
  type: 'network' | 'application' | 'system' | 'behavioral';
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: {
    ipAddress: string;
    port?: number;
    protocol?: string;
    userAgent?: string;
    userId?: string;
  };
  target: {
    service: string;
    endpoint?: string;
    resource?: string;
  };
  details: {
    description: string;
    indicators: Array<{
      type: 'signature' | 'anomaly' | 'behavioral' | 'reputation';
      value: string;
      confidence: number;
    }>;
    payload?: string;
    context: Record<string, any>;
  };
  response: {
    blocked: boolean;
    actions: Array<{
      type: 'block' | 'alert' | 'log' | 'quarantine';
      timestamp: Date;
      result: 'success' | 'failed';
    }>;
  };
  organizationId: string;
}

export interface IntrusionRule {
  id: string;
  name: string;
  description: string;
  type: 'signature' | 'anomaly' | 'behavioral';
  enabled: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  conditions: Array<{
    field: string;
    operator: 'equals' | 'contains' | 'regex' | 'greater_than' | 'less_than';
    value: string | number;
  }>;
  actions: Array<{
    type: 'block' | 'alert' | 'log' | 'quarantine';
    parameters?: Record<string, any>;
  }>;
  metadata: {
    category: string;
    tags: string[];
    references: string[];
    lastUpdated: Date;
  };
}

export class IntrusionDetectionService {
  private static instance: IntrusionDetectionService;
  private rules: Map<string, IntrusionRule> = new Map();
  private events: Map<string, IntrusionEvent> = new Map();
  private monitoringActive: boolean = false;
  private monitoringInterval?: NodeJS.Timeout;

  private constructor() {}

  public static getInstance(): IntrusionDetectionService {
    if (!IntrusionDetectionService.instance) {
      IntrusionDetectionService.instance = new IntrusionDetectionService();
    }
    return IntrusionDetectionService.instance;
  }

  /**
   * Initialize the intrusion detection service
   */
  public async initialize(): Promise<void> {
    try {
      await this.loadDetectionRules();
      this.startMonitoring();
      
      logger.info('Intrusion Detection Service initialized', {
        rulesLoaded: this.rules.size,
        monitoringActive: this.monitoringActive,
      });
    } catch (error) {
      logger.error('Failed to initialize Intrusion Detection Service', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Analyze request for intrusion indicators
   */
  public async analyzeRequest(requestData: {
    ipAddress: string;
    userAgent?: string;
    userId?: string;
    method: string;
    endpoint: string;
    headers: Record<string, string>;
    payload?: any;
    organizationId: string;
  }): Promise<IntrusionEvent | null> {
    try {
      const indicators: Array<{
        type: 'signature' | 'anomaly' | 'behavioral' | 'reputation';
        value: string;
        confidence: number;
      }> = [];

      // Check signature-based rules
      const signatureMatches = await this.checkSignatureRules(requestData);
      indicators.push(...signatureMatches);

      // Check for anomalies
      const anomalies = await this.detectAnomalies(requestData);
      indicators.push(...anomalies);

      // Check behavioral patterns
      const behavioralIndicators = await this.analyzeBehavior(requestData);
      indicators.push(...behavioralIndicators);

      // Check IP reputation
      const reputationIndicators = await this.checkIPReputation(requestData.ipAddress);
      indicators.push(...reputationIndicators);

      // Calculate overall risk score
      const riskScore = this.calculateRiskScore(indicators);

      if (riskScore > 50) {
        const event: IntrusionEvent = {
          id: `intrusion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
          type: this.determineEventType(indicators),
          severity: this.determineSeverity(riskScore),
          source: {
            ipAddress: requestData.ipAddress,
            userAgent: requestData.userAgent,
            userId: requestData.userId,
          },
          target: {
            service: 'api',
            endpoint: requestData.endpoint,
          },
          details: {
            description: this.generateDescription(indicators),
            indicators,
            payload: requestData.payload ? JSON.stringify(requestData.payload) : undefined,
            context: {
              method: requestData.method,
              headers: requestData.headers,
              riskScore,
            },
          },
          response: {
            blocked: riskScore > 80,
            actions: [],
          },
          organizationId: requestData.organizationId,
        };

        // Execute response actions
        await this.executeResponseActions(event);

        // Store event
        this.events.set(event.id, event);

        logger.warn('Intrusion detected', {
          eventId: event.id,
          type: event.type,
          severity: event.severity,
          riskScore,
          ipAddress: requestData.ipAddress,
        });

        return event;
      }

      return null;
    } catch (error) {
      logger.error('Error analyzing request for intrusions', {
        error: error instanceof Error ? error.message : String(error),
        ipAddress: requestData.ipAddress,
        endpoint: requestData.endpoint,
      });
      return null;
    }
  }

  /**
   * Get intrusion events
   */
  public async getIntrusionEvents(
    organizationId: string,
    filters?: {
      type?: string;
      severity?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<IntrusionEvent[]> {
    try {
      let events = Array.from(this.events.values())
        .filter(event => event.organizationId === organizationId);

      if (filters) {
        if (filters.type) {
          events = events.filter(event => event.type === filters.type);
        }
        if (filters.severity) {
          events = events.filter(event => event.severity === filters.severity);
        }
        if (filters.startDate) {
          events = events.filter(event => event.timestamp >= filters.startDate!);
        }
        if (filters.endDate) {
          events = events.filter(event => event.timestamp <= filters.endDate!);
        }
      }

      // Sort by timestamp (newest first)
      events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Apply limit
      if (filters?.limit) {
        events = events.slice(0, filters.limit);
      }

      return events;
    } catch (error) {
      logger.error('Error getting intrusion events', {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
      return [];
    }
  }

  /**
   * Update intrusion event status
   */
  public async updateEventStatus(
    eventId: string,
    status: 'investigating' | 'resolved' | 'false_positive',
    notes?: string
  ): Promise<void> {
    try {
      const event = this.events.get(eventId);
      if (!event) {
        throw new Error('Intrusion event not found');
      }

      // Update event with status information
      (event as any).status = status;
      (event as any).statusUpdatedAt = new Date();
      (event as any).statusNotes = notes;

      logger.info('Intrusion event status updated', {
        eventId,
        status,
        notes,
      });
    } catch (error) {
      logger.error('Error updating intrusion event status', {
        error: error instanceof Error ? error.message : String(error),
        eventId,
        status,
      });
      throw error;
    }
  }

  /**
   * Add custom detection rule
   */
  public async addDetectionRule(rule: Omit<IntrusionRule, 'id' | 'metadata'>): Promise<string> {
    try {
      const ruleId = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const fullRule: IntrusionRule = {
        ...rule,
        id: ruleId,
        metadata: {
          category: 'custom',
          tags: [],
          references: [],
          lastUpdated: new Date(),
        },
      };

      this.rules.set(ruleId, fullRule);

      logger.info('Custom detection rule added', {
        ruleId,
        name: rule.name,
        type: rule.type,
        severity: rule.severity,
      });

      return ruleId;
    } catch (error) {
      logger.error('Error adding detection rule', {
        error: error instanceof Error ? error.message : String(error),
        ruleName: rule.name,
      });
      throw error;
    }
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    rulesLoaded: number;
    eventsStored: number;
    monitoringActive: boolean;
    lastEventTime?: Date;
  }> {
    try {
      const events = Array.from(this.events.values());
      const lastEvent = events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

      return {
        status: this.monitoringActive ? 'healthy' : 'degraded',
        rulesLoaded: this.rules.size,
        eventsStored: this.events.size,
        monitoringActive: this.monitoringActive,
        lastEventTime: lastEvent?.timestamp,
      };
    } catch (error) {
      logger.error('Intrusion detection health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        status: 'unhealthy',
        rulesLoaded: 0,
        eventsStored: 0,
        monitoringActive: false,
      };
    }
  }

  /**
   * Shutdown the service
   */
  public async shutdown(): Promise<void> {
    try {
      this.monitoringActive = false;
      
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
      }

      logger.info('Intrusion Detection Service shut down');
    } catch (error) {
      logger.error('Error shutting down Intrusion Detection Service', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Private helper methods
  private async loadDetectionRules(): Promise<void> {
    // Load default rules
    const defaultRules: IntrusionRule[] = [
      {
        id: 'sql_injection',
        name: 'SQL Injection Detection',
        description: 'Detects potential SQL injection attempts',
        type: 'signature',
        enabled: true,
        severity: 'high',
        conditions: [
          { field: 'payload', operator: 'regex', value: '(union|select|insert|delete|update|drop)\\s+' },
        ],
        actions: [
          { type: 'block' },
          { type: 'alert' },
          { type: 'log' },
        ],
        metadata: {
          category: 'injection',
          tags: ['sql', 'injection', 'database'],
          references: ['OWASP-A03'],
          lastUpdated: new Date(),
        },
      },
      {
        id: 'xss_detection',
        name: 'Cross-Site Scripting Detection',
        description: 'Detects potential XSS attempts',
        type: 'signature',
        enabled: true,
        severity: 'medium',
        conditions: [
          { field: 'payload', operator: 'regex', value: '<script[^>]*>.*?</script>' },
        ],
        actions: [
          { type: 'block' },
          { type: 'alert' },
          { type: 'log' },
        ],
        metadata: {
          category: 'injection',
          tags: ['xss', 'script', 'client-side'],
          references: ['OWASP-A07'],
          lastUpdated: new Date(),
        },
      },
    ];

    defaultRules.forEach(rule => {
      this.rules.set(rule.id, rule);
    });
  }

  private startMonitoring(): void {
    this.monitoringActive = true;
    
    // Start periodic monitoring tasks
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performPeriodicChecks();
      } catch (error) {
        logger.error('Error in periodic monitoring', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 60000); // Every minute
  }

  private async performPeriodicChecks(): Promise<void> {
    // Clean up old events (keep last 1000)
    if (this.events.size > 1000) {
      const events = Array.from(this.events.entries())
        .sort(([, a], [, b]) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(1000);
      
      this.events.clear();
      events.forEach(([id, event]) => {
        this.events.set(id, event);
      });
    }
  }

  private async checkSignatureRules(requestData: any): Promise<any[]> {
    const matches: any[] = [];
    
    for (const rule of this.rules.values()) {
      if (rule.type === 'signature' && rule.enabled) {
        for (const condition of rule.conditions) {
          const fieldValue = this.getFieldValue(requestData, condition.field);
          if (this.evaluateCondition(fieldValue, condition)) {
            matches.push({
              type: 'signature',
              value: rule.name,
              confidence: 0.9,
            });
          }
        }
      }
    }
    
    return matches;
  }

  private async detectAnomalies(requestData: any): Promise<any[]> {
    // Simple anomaly detection - in production, use ML models
    const anomalies: any[] = [];
    
    // Check for unusual request patterns
    if (requestData.payload && JSON.stringify(requestData.payload).length > 10000) {
      anomalies.push({
        type: 'anomaly',
        value: 'Large payload size',
        confidence: 0.7,
      });
    }
    
    return anomalies;
  }

  private async analyzeBehavior(requestData: any): Promise<any[]> {
    // Behavioral analysis - in production, implement proper behavioral analytics
    return [];
  }

  private async checkIPReputation(ipAddress: string): Promise<any[]> {
    // IP reputation check - in production, integrate with threat intelligence feeds
    return [];
  }

  private calculateRiskScore(indicators: any[]): number {
    if (indicators.length === 0) return 0;
    
    const totalConfidence = indicators.reduce((sum, indicator) => sum + indicator.confidence, 0);
    return Math.min(100, (totalConfidence / indicators.length) * 100);
  }

  private determineEventType(indicators: any[]): 'network' | 'application' | 'system' | 'behavioral' {
    // Simple logic - in production, implement more sophisticated classification
    return 'application';
  }

  private determineSeverity(riskScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (riskScore >= 90) return 'critical';
    if (riskScore >= 70) return 'high';
    if (riskScore >= 50) return 'medium';
    return 'low';
  }

  private generateDescription(indicators: any[]): string {
    if (indicators.length === 0) return 'Unknown intrusion pattern detected';
    
    const types = indicators.map(i => i.value).join(', ');
    return `Potential intrusion detected: ${types}`;
  }

  private async executeResponseActions(event: IntrusionEvent): Promise<void> {
    const actions: Array<{
      type: 'block' | 'alert' | 'log' | 'quarantine';
      timestamp: Date;
      result: 'success' | 'failed';
    }> = [];

    // Block if high risk
    if (event.response.blocked) {
      try {
        // Implement IP blocking logic
        actions.push({
          type: 'block',
          timestamp: new Date(),
          result: 'success',
        });
      } catch (error) {
        actions.push({
          type: 'block',
          timestamp: new Date(),
          result: 'failed',
        });
      }
    }

    // Always log and alert
    actions.push({
      type: 'log',
      timestamp: new Date(),
      result: 'success',
    });

    actions.push({
      type: 'alert',
      timestamp: new Date(),
      result: 'success',
    });

    event.response.actions = actions;
  }

  private getFieldValue(data: any, field: string): any {
    const parts = field.split('.');
    let value = data;
    
    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  private evaluateCondition(fieldValue: any, condition: any): boolean {
    if (fieldValue === undefined || fieldValue === null) return false;
    
    const value = String(fieldValue);
    
    switch (condition.operator) {
      case 'equals':
        return value === String(condition.value);
      case 'contains':
        return value.includes(String(condition.value));
      case 'regex':
        return new RegExp(String(condition.value), 'i').test(value);
      case 'greater_than':
        return parseFloat(value) > parseFloat(String(condition.value));
      case 'less_than':
        return parseFloat(value) < parseFloat(String(condition.value));
      default:
        return false;
    }
  }
}
