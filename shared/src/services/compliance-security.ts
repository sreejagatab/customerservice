/**
 * Compliance and Security Service
 * Handles enterprise compliance requirements, audit logging, and security controls
 */

import { Logger } from '../utils/logger';
import { DatabaseService } from './database';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export interface ComplianceFramework {
  id: string;
  name: string;
  version: string;
  requirements: ComplianceRequirement[];
  certificationStatus: 'not_started' | 'in_progress' | 'certified' | 'expired';
  lastAuditDate?: Date;
  nextAuditDate?: Date;
  certificationBody?: string;
  certificateNumber?: string;
  expiryDate?: Date;
}

export interface ComplianceRequirement {
  id: string;
  frameworkId: string;
  category: string;
  requirement: string;
  description: string;
  implementationStatus: 'not_implemented' | 'partial' | 'implemented' | 'verified';
  evidence: string[];
  lastReviewDate?: Date;
  assignedTo?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface AuditLog {
  id: string;
  organizationId: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details: any;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  severity: 'info' | 'warning' | 'error' | 'critical';
  complianceFrameworks: string[];
  dataClassification: 'public' | 'internal' | 'confidential' | 'restricted';
}

export interface SecurityControl {
  id: string;
  name: string;
  category: 'access_control' | 'encryption' | 'monitoring' | 'incident_response' | 'data_protection';
  description: string;
  implementationStatus: 'active' | 'inactive' | 'testing' | 'failed';
  configuration: any;
  lastTestDate?: Date;
  nextTestDate?: Date;
  effectiveness: 'low' | 'medium' | 'high';
  automatedTesting: boolean;
}

export interface DataResidencyRule {
  id: string;
  organizationId: string;
  region: string;
  dataTypes: string[];
  storageRequirements: any;
  processingRestrictions: any;
  transferRestrictions: any;
  retentionPeriod: number; // days
  deletionRequirements: any;
  complianceFrameworks: string[];
  isActive: boolean;
}

export class ComplianceSecurityService extends EventEmitter {
  private logger: Logger;
  private db: DatabaseService;
  private encryptionKey: string;

  constructor(db: DatabaseService, encryptionKey: string) {
    super();
    this.logger = new Logger('ComplianceSecurityService');
    this.db = db;
    this.encryptionKey = encryptionKey;
  }

  /**
   * Initialize compliance frameworks
   */
  async initializeComplianceFrameworks(): Promise<void> {
    try {
      const frameworks = [
        {
          name: 'SOC 2 Type II',
          version: '2017',
          requirements: this.getSOC2Requirements()
        },
        {
          name: 'ISO 27001',
          version: '2013',
          requirements: this.getISO27001Requirements()
        },
        {
          name: 'GDPR',
          version: '2018',
          requirements: this.getGDPRRequirements()
        },
        {
          name: 'HIPAA',
          version: '2013',
          requirements: this.getHIPAARequirements()
        },
        {
          name: 'PCI DSS',
          version: '4.0',
          requirements: this.getPCIDSSRequirements()
        }
      ];

      for (const framework of frameworks) {
        await this.createComplianceFramework(framework);
      }

      this.logger.info('Compliance frameworks initialized successfully');
    } catch (error) {
      this.logger.error('Error initializing compliance frameworks:', error);
      throw new Error('Failed to initialize compliance frameworks');
    }
  }

  /**
   * Log audit event
   */
  async logAuditEvent(auditData: Partial<AuditLog>): Promise<void> {
    try {
      // Encrypt sensitive data
      const encryptedDetails = this.encryptData(JSON.stringify(auditData.details || {}));
      
      await this.db.query(`
        INSERT INTO audit_logs (
          organization_id, user_id, action, resource, resource_id,
          details, ip_address, user_agent, severity, compliance_frameworks,
          data_classification, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        auditData.organizationId,
        auditData.userId,
        auditData.action,
        auditData.resource,
        auditData.resourceId,
        encryptedDetails,
        auditData.ipAddress,
        auditData.userAgent,
        auditData.severity || 'info',
        JSON.stringify(auditData.complianceFrameworks || []),
        auditData.dataClassification || 'internal',
        auditData.timestamp || new Date()
      ]);

      // Emit event for real-time monitoring
      this.emit('audit.logged', auditData);

      // Check for compliance violations
      await this.checkComplianceViolations(auditData);
    } catch (error) {
      this.logger.error('Error logging audit event:', error);
      // Don't throw error to avoid breaking main operations
    }
  }

  /**
   * Implement data residency controls
   */
  async enforceDataResidency(
    organizationId: string,
    dataType: string,
    operation: 'store' | 'process' | 'transfer',
    targetRegion?: string
  ): Promise<{ allowed: boolean; reason?: string; alternativeRegions?: string[] }> {
    try {
      const rules = await this.getDataResidencyRules(organizationId);
      
      for (const rule of rules) {
        if (rule.dataTypes.includes(dataType) || rule.dataTypes.includes('*')) {
          const result = this.evaluateDataResidencyRule(rule, operation, targetRegion);
          
          if (!result.allowed) {
            await this.logAuditEvent({
              organizationId,
              action: 'data_residency_violation',
              resource: 'data_residency',
              details: { dataType, operation, targetRegion, rule: rule.id },
              severity: 'error',
              complianceFrameworks: rule.complianceFrameworks,
              dataClassification: 'restricted'
            });
          }
          
          return result;
        }
      }

      // No specific rules found, allow by default
      return { allowed: true };
    } catch (error) {
      this.logger.error('Error enforcing data residency:', error);
      return { allowed: false, reason: 'Data residency check failed' };
    }
  }

  /**
   * Encrypt sensitive data
   */
  encryptData(data: string): string {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);
      cipher.setAAD(Buffer.from('universal-ai-cs', 'utf8'));
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    } catch (error) {
      this.logger.error('Error encrypting data:', error);
      throw new Error('Data encryption failed');
    }
  }

  /**
   * Decrypt sensitive data
   */
  decryptData(encryptedData: string): string {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
      decipher.setAAD(Buffer.from('universal-ai-cs', 'utf8'));
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      this.logger.error('Error decrypting data:', error);
      throw new Error('Data decryption failed');
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    organizationId: string,
    frameworkName: string,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    try {
      // Get compliance framework
      const framework = await this.getComplianceFramework(frameworkName);
      if (!framework) {
        throw new Error('Compliance framework not found');
      }

      // Get audit logs for the period
      const auditLogs = await this.getAuditLogs(organizationId, startDate, endDate, frameworkName);
      
      // Get security controls status
      const securityControls = await this.getSecurityControlsStatus();
      
      // Calculate compliance score
      const complianceScore = this.calculateComplianceScore(framework, auditLogs, securityControls);
      
      // Generate recommendations
      const recommendations = this.generateComplianceRecommendations(framework, auditLogs);

      const report = {
        framework: framework.name,
        version: framework.version,
        organizationId,
        reportPeriod: { startDate, endDate },
        complianceScore,
        requirements: framework.requirements.map(req => ({
          ...req,
          auditEvents: auditLogs.filter(log => 
            log.details?.requirement === req.id
          ).length
        })),
        securityControls,
        auditSummary: {
          totalEvents: auditLogs.length,
          criticalEvents: auditLogs.filter(log => log.severity === 'critical').length,
          violations: auditLogs.filter(log => log.action.includes('violation')).length
        },
        recommendations,
        generatedAt: new Date()
      };

      // Log report generation
      await this.logAuditEvent({
        organizationId,
        action: 'compliance_report_generated',
        resource: 'compliance_report',
        details: { framework: frameworkName, period: { startDate, endDate } },
        severity: 'info',
        complianceFrameworks: [frameworkName],
        dataClassification: 'confidential'
      });

      return report;
    } catch (error) {
      this.logger.error('Error generating compliance report:', error);
      throw new Error('Failed to generate compliance report');
    }
  }

  /**
   * Private helper methods
   */
  private async createComplianceFramework(frameworkData: any): Promise<void> {
    // Check if framework already exists
    const existing = await this.db.query(
      'SELECT id FROM compliance_frameworks WHERE name = $1 AND version = $2',
      [frameworkData.name, frameworkData.version]
    );

    if (existing.rows.length > 0) {
      return; // Framework already exists
    }

    // Create framework
    const result = await this.db.query(`
      INSERT INTO compliance_frameworks (name, version, certification_status)
      VALUES ($1, $2, $3) RETURNING id
    `, [frameworkData.name, frameworkData.version, 'not_started']);

    const frameworkId = result.rows[0].id;

    // Create requirements
    for (const requirement of frameworkData.requirements) {
      await this.db.query(`
        INSERT INTO compliance_requirements (
          framework_id, category, requirement, description, 
          implementation_status, priority
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        frameworkId,
        requirement.category,
        requirement.requirement,
        requirement.description,
        'not_implemented',
        requirement.priority
      ]);
    }
  }

  private getSOC2Requirements(): any[] {
    return [
      {
        category: 'Security',
        requirement: 'CC6.1',
        description: 'Logical and physical access controls',
        priority: 'high'
      },
      {
        category: 'Security',
        requirement: 'CC6.2',
        description: 'System access is removed when no longer required',
        priority: 'high'
      },
      {
        category: 'Security',
        requirement: 'CC6.3',
        description: 'Data transmission and disposal controls',
        priority: 'medium'
      }
    ];
  }

  private getISO27001Requirements(): any[] {
    return [
      {
        category: 'Information Security Policy',
        requirement: 'A.5.1.1',
        description: 'Information security policy document',
        priority: 'high'
      },
      {
        category: 'Access Control',
        requirement: 'A.9.1.1',
        description: 'Access control policy',
        priority: 'high'
      },
      {
        category: 'Cryptography',
        requirement: 'A.10.1.1',
        description: 'Policy on the use of cryptographic controls',
        priority: 'medium'
      }
    ];
  }

  private getGDPRRequirements(): any[] {
    return [
      {
        category: 'Data Protection',
        requirement: 'Article 25',
        description: 'Data protection by design and by default',
        priority: 'critical'
      },
      {
        category: 'Data Subject Rights',
        requirement: 'Article 17',
        description: 'Right to erasure (right to be forgotten)',
        priority: 'high'
      },
      {
        category: 'Data Breach',
        requirement: 'Article 33',
        description: 'Notification of personal data breach to supervisory authority',
        priority: 'critical'
      }
    ];
  }

  private getHIPAARequirements(): any[] {
    return [
      {
        category: 'Administrative Safeguards',
        requirement: '164.308(a)(1)',
        description: 'Security Officer',
        priority: 'high'
      },
      {
        category: 'Physical Safeguards',
        requirement: '164.310(a)(1)',
        description: 'Facility Access Controls',
        priority: 'medium'
      },
      {
        category: 'Technical Safeguards',
        requirement: '164.312(a)(1)',
        description: 'Access Control',
        priority: 'high'
      }
    ];
  }

  private getPCIDSSRequirements(): any[] {
    return [
      {
        category: 'Network Security',
        requirement: 'Requirement 1',
        description: 'Install and maintain network security controls',
        priority: 'high'
      },
      {
        category: 'Data Protection',
        requirement: 'Requirement 3',
        description: 'Protect stored cardholder data',
        priority: 'critical'
      },
      {
        category: 'Encryption',
        requirement: 'Requirement 4',
        description: 'Protect cardholder data with strong cryptography',
        priority: 'high'
      }
    ];
  }

  private async getComplianceFramework(name: string): Promise<ComplianceFramework | null> {
    const result = await this.db.query(`
      SELECT cf.*, 
             json_agg(
               json_build_object(
                 'id', cr.id,
                 'category', cr.category,
                 'requirement', cr.requirement,
                 'description', cr.description,
                 'implementationStatus', cr.implementation_status,
                 'priority', cr.priority
               )
             ) as requirements
      FROM compliance_frameworks cf
      LEFT JOIN compliance_requirements cr ON cf.id = cr.framework_id
      WHERE cf.name = $1
      GROUP BY cf.id
    `, [name]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      requirements: row.requirements || [],
      certificationStatus: row.certification_status,
      lastAuditDate: row.last_audit_date,
      nextAuditDate: row.next_audit_date,
      certificationBody: row.certification_body,
      certificateNumber: row.certificate_number,
      expiryDate: row.expiry_date
    };
  }

  private async getDataResidencyRules(organizationId: string): Promise<DataResidencyRule[]> {
    const result = await this.db.query(
      'SELECT * FROM data_residency_rules WHERE organization_id = $1 AND is_active = true',
      [organizationId]
    );

    return result.rows.map(row => ({
      id: row.id,
      organizationId: row.organization_id,
      region: row.region,
      dataTypes: row.data_types,
      storageRequirements: row.storage_requirements,
      processingRestrictions: row.processing_restrictions,
      transferRestrictions: row.transfer_restrictions,
      retentionPeriod: row.retention_period,
      deletionRequirements: row.deletion_requirements,
      complianceFrameworks: row.compliance_frameworks,
      isActive: row.is_active
    }));
  }

  private evaluateDataResidencyRule(
    rule: DataResidencyRule,
    operation: string,
    targetRegion?: string
  ): { allowed: boolean; reason?: string; alternativeRegions?: string[] } {
    switch (operation) {
      case 'store':
        if (rule.storageRequirements?.allowedRegions) {
          const allowed = rule.storageRequirements.allowedRegions.includes(rule.region);
          return {
            allowed,
            reason: allowed ? undefined : 'Storage not allowed in this region',
            alternativeRegions: allowed ? undefined : rule.storageRequirements.allowedRegions
          };
        }
        break;
      
      case 'process':
        if (rule.processingRestrictions?.restrictedRegions) {
          const allowed = !rule.processingRestrictions.restrictedRegions.includes(targetRegion);
          return {
            allowed,
            reason: allowed ? undefined : 'Processing restricted in target region'
          };
        }
        break;
      
      case 'transfer':
        if (rule.transferRestrictions?.blockedRegions) {
          const allowed = !rule.transferRestrictions.blockedRegions.includes(targetRegion);
          return {
            allowed,
            reason: allowed ? undefined : 'Transfer blocked to target region'
          };
        }
        break;
    }

    return { allowed: true };
  }

  private async checkComplianceViolations(auditData: Partial<AuditLog>): Promise<void> {
    // Check for potential violations based on audit data
    if (auditData.severity === 'critical' || auditData.action?.includes('violation')) {
      this.emit('compliance.violation', auditData);
    }
  }

  private async getAuditLogs(
    organizationId: string,
    startDate: Date,
    endDate: Date,
    framework: string
  ): Promise<AuditLog[]> {
    const result = await this.db.query(`
      SELECT * FROM audit_logs 
      WHERE organization_id = $1 
        AND timestamp BETWEEN $2 AND $3
        AND compliance_frameworks::jsonb ? $4
      ORDER BY timestamp DESC
    `, [organizationId, startDate, endDate, framework]);

    return result.rows.map(row => ({
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      action: row.action,
      resource: row.resource,
      resourceId: row.resource_id,
      details: JSON.parse(this.decryptData(row.details)),
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      timestamp: row.timestamp,
      severity: row.severity,
      complianceFrameworks: JSON.parse(row.compliance_frameworks),
      dataClassification: row.data_classification
    }));
  }

  private async getSecurityControlsStatus(): Promise<SecurityControl[]> {
    const result = await this.db.query('SELECT * FROM security_controls WHERE implementation_status = $1', ['active']);
    
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category,
      description: row.description,
      implementationStatus: row.implementation_status,
      configuration: row.configuration,
      lastTestDate: row.last_test_date,
      nextTestDate: row.next_test_date,
      effectiveness: row.effectiveness,
      automatedTesting: row.automated_testing
    }));
  }

  private calculateComplianceScore(
    framework: ComplianceFramework,
    auditLogs: AuditLog[],
    securityControls: SecurityControl[]
  ): number {
    const implementedRequirements = framework.requirements.filter(
      req => req.implementationStatus === 'implemented' || req.implementationStatus === 'verified'
    ).length;
    
    const totalRequirements = framework.requirements.length;
    const implementationScore = (implementedRequirements / totalRequirements) * 100;
    
    // Deduct points for violations
    const violations = auditLogs.filter(log => log.action.includes('violation')).length;
    const violationPenalty = Math.min(violations * 5, 50); // Max 50 point penalty
    
    // Add points for active security controls
    const activeControls = securityControls.filter(control => control.implementationStatus === 'active').length;
    const controlBonus = Math.min(activeControls * 2, 20); // Max 20 point bonus
    
    return Math.max(0, Math.min(100, implementationScore - violationPenalty + controlBonus));
  }

  private generateComplianceRecommendations(
    framework: ComplianceFramework,
    auditLogs: AuditLog[]
  ): string[] {
    const recommendations = [];
    
    // Check for unimplemented requirements
    const unimplemented = framework.requirements.filter(
      req => req.implementationStatus === 'not_implemented'
    );
    
    if (unimplemented.length > 0) {
      recommendations.push(`Implement ${unimplemented.length} pending requirements`);
    }
    
    // Check for recent violations
    const recentViolations = auditLogs.filter(
      log => log.action.includes('violation') && 
             log.timestamp > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );
    
    if (recentViolations.length > 0) {
      recommendations.push(`Address ${recentViolations.length} recent compliance violations`);
    }
    
    // Generic recommendations
    recommendations.push('Conduct regular security awareness training');
    recommendations.push('Review and update access controls quarterly');
    recommendations.push('Implement automated compliance monitoring');
    
    return recommendations;
  }
}

export default ComplianceSecurityService;
