/**
 * Audit Logging Service
 * Tracks all system activities, user actions, and security events
 */

import { config } from '@/config';
import { logger } from '@/utils/logger';
import { redis } from '@/services/redis';

export interface AuditEvent {
  id: string;
  timestamp: Date;
  organizationId: string;
  userId?: string;
  sessionId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  category: 'authentication' | 'authorization' | 'data_access' | 'data_modification' | 'system' | 'security' | 'configuration';
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'success' | 'failure' | 'warning';
  details: {
    description: string;
    oldValues?: Record<string, any>;
    newValues?: Record<string, any>;
    metadata?: Record<string, any>;
  };
  source: {
    service: string;
    endpoint?: string;
    userAgent?: string;
    ipAddress?: string;
    location?: {
      country?: string;
      region?: string;
      city?: string;
    };
  };
  compliance: {
    gdpr: boolean;
    hipaa: boolean;
    sox: boolean;
    pci: boolean;
  };
}

export interface AuditQuery {
  organizationId?: string;
  userId?: string;
  action?: string;
  resource?: string;
  category?: AuditEvent['category'];
  severity?: AuditEvent['severity'];
  status?: AuditEvent['status'];
  startDate?: Date;
  endDate?: Date;
  ipAddress?: string;
  service?: string;
  search?: string;
}

export interface AuditSummary {
  totalEvents: number;
  eventsByCategory: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  eventsByStatus: Record<string, number>;
  topUsers: Array<{ userId: string; eventCount: number }>;
  topActions: Array<{ action: string; eventCount: number }>;
  topResources: Array<{ resource: string; eventCount: number }>;
  securityEvents: number;
  failedLogins: number;
  dataModifications: number;
  timeRange: { start: Date; end: Date };
}

export interface ComplianceReport {
  organizationId: string;
  reportType: 'gdpr' | 'hipaa' | 'sox' | 'pci' | 'all';
  timeRange: { start: Date; end: Date };
  events: AuditEvent[];
  summary: {
    totalEvents: number;
    dataAccessEvents: number;
    dataModificationEvents: number;
    userAuthenticationEvents: number;
    securityEvents: number;
    complianceViolations: Array<{
      event: AuditEvent;
      violation: string;
      severity: string;
    }>;
  };
  generatedAt: Date;
  generatedBy: string;
}

export class AuditService {
  private static instance: AuditService;
  private eventBuffer: AuditEvent[] = [];
  private bufferFlushInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.startBufferFlush();
  }

  public static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  /**
   * Log an audit event
   */
  public async logEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    try {
      if (!config.features.auditLogging) {
        return;
      }

      const auditEvent: AuditEvent = {
        ...event,
        id: this.generateEventId(),
        timestamp: new Date(),
      };

      // Add to buffer for batch processing
      this.eventBuffer.push(auditEvent);

      // For critical events, flush immediately
      if (auditEvent.severity === 'critical') {
        await this.flushBuffer();
      }

      logger.debug('Audit event logged', {
        eventId: auditEvent.id,
        action: auditEvent.action,
        resource: auditEvent.resource,
        userId: auditEvent.userId,
        severity: auditEvent.severity,
      });
    } catch (error) {
      logger.error('Error logging audit event', {
        event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Log authentication event
   */
  public async logAuthentication(
    organizationId: string,
    userId: string,
    action: 'login' | 'logout' | 'login_failed' | 'password_change' | 'password_reset',
    details: Partial<AuditEvent['details']> = {},
    source: Partial<AuditEvent['source']> = {}
  ): Promise<void> {
    await this.logEvent({
      organizationId,
      userId,
      action,
      resource: 'user_authentication',
      category: 'authentication',
      severity: action === 'login_failed' ? 'medium' : 'low',
      status: action === 'login_failed' ? 'failure' : 'success',
      details: {
        description: `User ${action.replace('_', ' ')}`,
        ...details,
      },
      source: {
        service: 'admin-service',
        ...source,
      },
      compliance: {
        gdpr: true,
        hipaa: true,
        sox: true,
        pci: true,
      },
    });
  }

  /**
   * Log authorization event
   */
  public async logAuthorization(
    organizationId: string,
    userId: string,
    action: string,
    resource: string,
    resourceId: string | undefined,
    allowed: boolean,
    details: Partial<AuditEvent['details']> = {},
    source: Partial<AuditEvent['source']> = {}
  ): Promise<void> {
    await this.logEvent({
      organizationId,
      userId,
      action: `access_${action}`,
      resource,
      resourceId,
      category: 'authorization',
      severity: allowed ? 'low' : 'medium',
      status: allowed ? 'success' : 'failure',
      details: {
        description: `${allowed ? 'Granted' : 'Denied'} access to ${action} ${resource}`,
        ...details,
      },
      source: {
        service: 'admin-service',
        ...source,
      },
      compliance: {
        gdpr: true,
        hipaa: true,
        sox: true,
        pci: false,
      },
    });
  }

  /**
   * Log data access event
   */
  public async logDataAccess(
    organizationId: string,
    userId: string,
    resource: string,
    resourceId: string | undefined,
    action: 'read' | 'search' | 'export',
    details: Partial<AuditEvent['details']> = {},
    source: Partial<AuditEvent['source']> = {}
  ): Promise<void> {
    await this.logEvent({
      organizationId,
      userId,
      action: `data_${action}`,
      resource,
      resourceId,
      category: 'data_access',
      severity: action === 'export' ? 'medium' : 'low',
      status: 'success',
      details: {
        description: `Data ${action} on ${resource}`,
        ...details,
      },
      source: {
        service: 'admin-service',
        ...source,
      },
      compliance: {
        gdpr: true,
        hipaa: true,
        sox: true,
        pci: true,
      },
    });
  }

  /**
   * Log data modification event
   */
  public async logDataModification(
    organizationId: string,
    userId: string,
    resource: string,
    resourceId: string | undefined,
    action: 'create' | 'update' | 'delete',
    oldValues: Record<string, any> | undefined,
    newValues: Record<string, any> | undefined,
    details: Partial<AuditEvent['details']> = {},
    source: Partial<AuditEvent['source']> = {}
  ): Promise<void> {
    await this.logEvent({
      organizationId,
      userId,
      action: `data_${action}`,
      resource,
      resourceId,
      category: 'data_modification',
      severity: action === 'delete' ? 'high' : 'medium',
      status: 'success',
      details: {
        description: `Data ${action} on ${resource}`,
        oldValues,
        newValues,
        ...details,
      },
      source: {
        service: 'admin-service',
        ...source,
      },
      compliance: {
        gdpr: true,
        hipaa: true,
        sox: true,
        pci: true,
      },
    });
  }

  /**
   * Log security event
   */
  public async logSecurityEvent(
    organizationId: string,
    userId: string | undefined,
    action: string,
    severity: AuditEvent['severity'],
    details: Partial<AuditEvent['details']> = {},
    source: Partial<AuditEvent['source']> = {}
  ): Promise<void> {
    await this.logEvent({
      organizationId,
      userId,
      action,
      resource: 'security',
      category: 'security',
      severity,
      status: 'warning',
      details: {
        description: `Security event: ${action}`,
        ...details,
      },
      source: {
        service: 'admin-service',
        ...source,
      },
      compliance: {
        gdpr: true,
        hipaa: true,
        sox: true,
        pci: true,
      },
    });
  }

  /**
   * Log system event
   */
  public async logSystemEvent(
    organizationId: string,
    action: string,
    details: Partial<AuditEvent['details']> = {},
    source: Partial<AuditEvent['source']> = {}
  ): Promise<void> {
    await this.logEvent({
      organizationId,
      action,
      resource: 'system',
      category: 'system',
      severity: 'low',
      status: 'success',
      details: {
        description: `System event: ${action}`,
        ...details,
      },
      source: {
        service: 'admin-service',
        ...source,
      },
      compliance: {
        gdpr: false,
        hipaa: false,
        sox: true,
        pci: false,
      },
    });
  }

  /**
   * Query audit events
   */
  public async queryEvents(
    query: AuditQuery,
    pagination: { page: number; limit: number } = { page: 1, limit: 100 }
  ): Promise<{
    events: AuditEvent[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      // TODO: Implement database query with filters and pagination
      // For now, return empty results
      
      return {
        events: [],
        total: 0,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: 0,
      };
    } catch (error) {
      logger.error('Error querying audit events', {
        query,
        pagination,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        events: [],
        total: 0,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: 0,
      };
    }
  }

  /**
   * Generate audit summary
   */
  public async generateSummary(
    organizationId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<AuditSummary> {
    try {
      // TODO: Implement summary generation from database
      
      return {
        totalEvents: 0,
        eventsByCategory: {},
        eventsBySeverity: {},
        eventsByStatus: {},
        topUsers: [],
        topActions: [],
        topResources: [],
        securityEvents: 0,
        failedLogins: 0,
        dataModifications: 0,
        timeRange,
      };
    } catch (error) {
      logger.error('Error generating audit summary', {
        organizationId,
        timeRange,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate compliance report
   */
  public async generateComplianceReport(
    organizationId: string,
    reportType: ComplianceReport['reportType'],
    timeRange: { start: Date; end: Date },
    generatedBy: string
  ): Promise<ComplianceReport> {
    try {
      // Query events based on compliance requirements
      const query: AuditQuery = {
        organizationId,
        startDate: timeRange.start,
        endDate: timeRange.end,
      };

      const { events } = await this.queryEvents(query, { page: 1, limit: 10000 });
      
      // Filter events based on compliance type
      const filteredEvents = events.filter(event => {
        switch (reportType) {
          case 'gdpr':
            return event.compliance.gdpr;
          case 'hipaa':
            return event.compliance.hipaa;
          case 'sox':
            return event.compliance.sox;
          case 'pci':
            return event.compliance.pci;
          case 'all':
            return true;
          default:
            return false;
        }
      });

      // Analyze for compliance violations
      const complianceViolations = this.analyzeComplianceViolations(filteredEvents, reportType);

      const report: ComplianceReport = {
        organizationId,
        reportType,
        timeRange,
        events: filteredEvents,
        summary: {
          totalEvents: filteredEvents.length,
          dataAccessEvents: filteredEvents.filter(e => e.category === 'data_access').length,
          dataModificationEvents: filteredEvents.filter(e => e.category === 'data_modification').length,
          userAuthenticationEvents: filteredEvents.filter(e => e.category === 'authentication').length,
          securityEvents: filteredEvents.filter(e => e.category === 'security').length,
          complianceViolations,
        },
        generatedAt: new Date(),
        generatedBy,
      };

      logger.info('Compliance report generated', {
        organizationId,
        reportType,
        timeRange,
        eventCount: filteredEvents.length,
        violationCount: complianceViolations.length,
        generatedBy,
      });

      return report;
    } catch (error) {
      logger.error('Error generating compliance report', {
        organizationId,
        reportType,
        timeRange,
        generatedBy,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Analyze compliance violations
   */
  private analyzeComplianceViolations(
    events: AuditEvent[],
    reportType: ComplianceReport['reportType']
  ): ComplianceReport['summary']['complianceViolations'] {
    const violations: ComplianceReport['summary']['complianceViolations'] = [];

    for (const event of events) {
      // Check for common compliance violations
      
      // Failed authentication attempts (security concern)
      if (event.category === 'authentication' && event.status === 'failure') {
        violations.push({
          event,
          violation: 'Failed authentication attempt',
          severity: 'medium',
        });
      }

      // Unauthorized access attempts
      if (event.category === 'authorization' && event.status === 'failure') {
        violations.push({
          event,
          violation: 'Unauthorized access attempt',
          severity: 'high',
        });
      }

      // Data access without proper justification (GDPR/HIPAA)
      if (event.category === 'data_access' && !event.details.metadata?.justification) {
        if (reportType === 'gdpr' || reportType === 'hipaa' || reportType === 'all') {
          violations.push({
            event,
            violation: 'Data access without documented justification',
            severity: 'medium',
          });
        }
      }

      // Data modifications without approval (SOX)
      if (event.category === 'data_modification' && event.severity === 'high' && !event.details.metadata?.approvedBy) {
        if (reportType === 'sox' || reportType === 'all') {
          violations.push({
            event,
            violation: 'High-risk data modification without approval',
            severity: 'high',
          });
        }
      }
    }

    return violations;
  }

  /**
   * Start buffer flush interval
   */
  private startBufferFlush(): void {
    this.bufferFlushInterval = setInterval(async () => {
      if (this.eventBuffer.length > 0) {
        await this.flushBuffer();
      }
    }, config.audit.batchSize * 1000); // Convert to milliseconds
  }

  /**
   * Flush event buffer to storage
   */
  private async flushBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    try {
      const eventsToFlush = [...this.eventBuffer];
      this.eventBuffer = [];

      // TODO: Batch insert events to database
      
      // Store in Redis for quick access (last 1000 events)
      for (const event of eventsToFlush) {
        await redis.lpush('audit_events_recent', JSON.stringify(event));
      }
      
      // Keep only last 1000 events in Redis
      await redis.ltrim('audit_events_recent', 0, 999);

      logger.debug('Audit events flushed to storage', {
        eventCount: eventsToFlush.length,
      });
    } catch (error) {
      logger.error('Error flushing audit events', {
        eventCount: this.eventBuffer.length,
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Re-add events to buffer for retry
      this.eventBuffer.unshift(...this.eventBuffer);
    }
  }

  /**
   * Export audit events
   */
  public async exportEvents(
    query: AuditQuery,
    format: 'json' | 'csv' | 'xml'
  ): Promise<{ data: string; filename: string; mimeType: string }> {
    try {
      const { events } = await this.queryEvents(query, { page: 1, limit: 10000 });
      const timestamp = new Date().toISOString().split('T')[0];
      
      switch (format) {
        case 'json':
          return {
            data: JSON.stringify(events, null, 2),
            filename: `audit-events-${timestamp}.json`,
            mimeType: 'application/json',
          };
          
        case 'csv':
          const csvData = this.convertEventsToCSV(events);
          return {
            data: csvData,
            filename: `audit-events-${timestamp}.csv`,
            mimeType: 'text/csv',
          };
          
        case 'xml':
          const xmlData = this.convertEventsToXML(events);
          return {
            data: xmlData,
            filename: `audit-events-${timestamp}.xml`,
            mimeType: 'application/xml',
          };
          
        default:
          throw new Error('Unsupported export format');
      }
    } catch (error) {
      logger.error('Error exporting audit events', {
        query,
        format,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Convert events to CSV
   */
  private convertEventsToCSV(events: AuditEvent[]): string {
    const headers = [
      'ID', 'Timestamp', 'Organization ID', 'User ID', 'Action', 'Resource',
      'Category', 'Severity', 'Status', 'Description', 'IP Address', 'Service'
    ];
    
    const rows = events.map(event => [
      event.id,
      event.timestamp.toISOString(),
      event.organizationId,
      event.userId || '',
      event.action,
      event.resource,
      event.category,
      event.severity,
      event.status,
      event.details.description,
      event.source.ipAddress || '',
      event.source.service,
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  /**
   * Convert events to XML
   */
  private convertEventsToXML(events: AuditEvent[]): string {
    const xmlEvents = events.map(event => `
    <event>
      <id>${event.id}</id>
      <timestamp>${event.timestamp.toISOString()}</timestamp>
      <organizationId>${event.organizationId}</organizationId>
      <userId>${event.userId || ''}</userId>
      <action>${event.action}</action>
      <resource>${event.resource}</resource>
      <category>${event.category}</category>
      <severity>${event.severity}</severity>
      <status>${event.status}</status>
      <description>${event.details.description}</description>
      <ipAddress>${event.source.ipAddress || ''}</ipAddress>
      <service>${event.source.service}</service>
    </event>`).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<auditEvents>
  ${xmlEvents}
</auditEvents>`;
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Stop the service
   */
  public async stop(): Promise<void> {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
      this.bufferFlushInterval = null;
    }
    
    // Flush remaining events
    await this.flushBuffer();
    
    logger.info('Audit service stopped');
  }
}

// Export singleton instance
export const auditService = AuditService.getInstance();
