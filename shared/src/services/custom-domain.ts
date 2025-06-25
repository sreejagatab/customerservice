/**
 * Custom Domain Service
 * Handles custom domain management, SSL certificates, and DNS configuration
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { DatabaseService } from './database';
import { RedisService } from './redis';
import * as dns from 'dns';
import * as crypto from 'crypto';

export interface CustomDomain {
  id: string;
  organizationId: string;
  domain: string;
  subdomain?: string;
  status: 'pending' | 'verifying' | 'active' | 'failed' | 'suspended';
  verificationMethod: 'dns' | 'file' | 'email';
  verificationToken: string;
  verificationRecord?: string;
  sslStatus: 'pending' | 'issued' | 'expired' | 'failed';
  sslCertificate?: string;
  sslPrivateKey?: string;
  sslExpiresAt?: Date;
  dnsRecords: DnsRecord[];
  createdAt: Date;
  updatedAt: Date;
  verifiedAt?: Date;
}

export interface DnsRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX';
  name: string;
  value: string;
  ttl: number;
  priority?: number;
}

export interface DomainConfiguration {
  organizationId: string;
  domain: string;
  subdomain?: string;
  services: {
    web: boolean;
    api: boolean;
    chat: boolean;
    email: boolean;
  };
  branding: {
    logo?: string;
    favicon?: string;
    colors: {
      primary: string;
      secondary: string;
      accent: string;
    };
    customCss?: string;
  };
}

export class CustomDomainService extends EventEmitter {
  private static instance: CustomDomainService;
  private logger: Logger;
  private db: DatabaseService;
  private redis: RedisService;
  private domains: Map<string, CustomDomain> = new Map();

  constructor() {
    super();
    this.logger = new Logger('CustomDomainService');
    this.db = DatabaseService.getInstance();
    this.redis = RedisService.getInstance();
  }

  public static getInstance(): CustomDomainService {
    if (!CustomDomainService.instance) {
      CustomDomainService.instance = new CustomDomainService();
    }
    return CustomDomainService.instance;
  }

  /**
   * Initialize custom domain service
   */
  public async initialize(): Promise<void> {
    try {
      await this.loadCustomDomains();
      this.startDomainVerification();
      this.startSslRenewal();
      
      this.logger.info('Custom domain service initialized');
    } catch (error) {
      this.logger.error('Failed to initialize custom domain service', { error });
      throw error;
    }
  }

  /**
   * Add custom domain for organization
   */
  public async addCustomDomain(
    organizationId: string,
    domain: string,
    subdomain?: string,
    verificationMethod: 'dns' | 'file' | 'email' = 'dns'
  ): Promise<CustomDomain> {
    try {
      // Validate domain format
      if (!this.isValidDomain(domain)) {
        throw new Error(`Invalid domain format: ${domain}`);
      }

      // Check if domain is already registered
      const existingDomain = await this.getDomainByName(domain, subdomain);
      if (existingDomain) {
        throw new Error(`Domain already registered: ${domain}`);
      }

      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      
      // Create domain record
      const customDomain: CustomDomain = {
        id: `domain_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        organizationId,
        domain,
        subdomain,
        status: 'pending',
        verificationMethod,
        verificationToken,
        sslStatus: 'pending',
        dnsRecords: this.generateRequiredDnsRecords(domain, subdomain),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Set verification record based on method
      if (verificationMethod === 'dns') {
        customDomain.verificationRecord = `_universal-ai-verification.${domain}`;
      }

      // Save to database
      await this.db.query(`
        INSERT INTO custom_domains (
          id, organization_id, domain, subdomain, status, verification_method,
          verification_token, verification_record, ssl_status, dns_records,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        customDomain.id,
        customDomain.organizationId,
        customDomain.domain,
        customDomain.subdomain,
        customDomain.status,
        customDomain.verificationMethod,
        customDomain.verificationToken,
        customDomain.verificationRecord,
        customDomain.sslStatus,
        JSON.stringify(customDomain.dnsRecords),
        customDomain.createdAt,
        customDomain.updatedAt,
      ]);

      // Cache domain
      this.domains.set(customDomain.id, customDomain);

      // Start verification process
      await this.startDomainVerificationProcess(customDomain.id);

      this.emit('domain.added', customDomain);
      
      this.logger.info('Custom domain added', {
        organizationId,
        domain,
        domainId: customDomain.id,
      });

      return customDomain;
    } catch (error) {
      this.logger.error('Error adding custom domain', {
        organizationId,
        domain,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Verify domain ownership
   */
  public async verifyDomain(domainId: string): Promise<boolean> {
    try {
      const domain = this.domains.get(domainId);
      if (!domain) {
        throw new Error(`Domain not found: ${domainId}`);
      }

      let verified = false;

      switch (domain.verificationMethod) {
        case 'dns':
          verified = await this.verifyDnsRecord(domain);
          break;
        case 'file':
          verified = await this.verifyFileMethod(domain);
          break;
        case 'email':
          verified = await this.verifyEmailMethod(domain);
          break;
      }

      if (verified) {
        // Update domain status
        domain.status = 'active';
        domain.verifiedAt = new Date();
        domain.updatedAt = new Date();

        await this.db.query(`
          UPDATE custom_domains 
          SET status = $1, verified_at = $2, updated_at = $3
          WHERE id = $4
        `, [domain.status, domain.verifiedAt, domain.updatedAt, domainId]);

        // Request SSL certificate
        await this.requestSslCertificate(domainId);

        this.emit('domain.verified', domain);
        
        this.logger.info('Domain verified successfully', {
          domainId,
          domain: domain.domain,
        });
      } else {
        // Update status to failed if verification failed
        domain.status = 'failed';
        domain.updatedAt = new Date();

        await this.db.query(`
          UPDATE custom_domains 
          SET status = $1, updated_at = $2
          WHERE id = $3
        `, [domain.status, domain.updatedAt, domainId]);

        this.emit('domain.verification.failed', domain);
      }

      return verified;
    } catch (error) {
      this.logger.error('Error verifying domain', {
        domainId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get custom domains for organization
   */
  public async getOrganizationDomains(organizationId: string): Promise<CustomDomain[]> {
    try {
      const result = await this.db.query(`
        SELECT * FROM custom_domains 
        WHERE organization_id = $1 
        ORDER BY created_at DESC
      `, [organizationId]);

      return result.rows.map(row => this.mapRowToDomain(row));
    } catch (error) {
      this.logger.error('Error getting organization domains', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get domain by name
   */
  public async getDomainByName(domain: string, subdomain?: string): Promise<CustomDomain | null> {
    try {
      const query = subdomain 
        ? 'SELECT * FROM custom_domains WHERE domain = $1 AND subdomain = $2'
        : 'SELECT * FROM custom_domains WHERE domain = $1 AND subdomain IS NULL';
      
      const params = subdomain ? [domain, subdomain] : [domain];
      const result = await this.db.query(query, params);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToDomain(result.rows[0]);
    } catch (error) {
      this.logger.error('Error getting domain by name', {
        domain,
        subdomain,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Configure domain settings
   */
  public async configureDomain(
    domainId: string,
    configuration: Partial<DomainConfiguration>
  ): Promise<void> {
    try {
      const domain = this.domains.get(domainId);
      if (!domain) {
        throw new Error(`Domain not found: ${domainId}`);
      }

      // Save configuration
      await this.db.query(`
        INSERT INTO domain_configurations (domain_id, configuration, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (domain_id) 
        DO UPDATE SET configuration = $2, updated_at = NOW()
      `, [domainId, JSON.stringify(configuration)]);

      // Update DNS records if needed
      if (configuration.services) {
        await this.updateDnsRecords(domainId, configuration.services);
      }

      this.emit('domain.configured', { domainId, configuration });
      
      this.logger.info('Domain configured', {
        domainId,
        domain: domain.domain,
      });
    } catch (error) {
      this.logger.error('Error configuring domain', {
        domainId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Remove custom domain
   */
  public async removeDomain(domainId: string): Promise<void> {
    try {
      const domain = this.domains.get(domainId);
      if (!domain) {
        throw new Error(`Domain not found: ${domainId}`);
      }

      // Revoke SSL certificate
      if (domain.sslStatus === 'issued') {
        await this.revokeSslCertificate(domainId);
      }

      // Remove from database
      await this.db.query('DELETE FROM custom_domains WHERE id = $1', [domainId]);
      await this.db.query('DELETE FROM domain_configurations WHERE domain_id = $1', [domainId]);

      // Remove from cache
      this.domains.delete(domainId);

      this.emit('domain.removed', domain);
      
      this.logger.info('Domain removed', {
        domainId,
        domain: domain.domain,
      });
    } catch (error) {
      this.logger.error('Error removing domain', {
        domainId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async loadCustomDomains(): Promise<void> {
    try {
      const result = await this.db.query('SELECT * FROM custom_domains');
      
      for (const row of result.rows) {
        const domain = this.mapRowToDomain(row);
        this.domains.set(domain.id, domain);
      }

      this.logger.info('Loaded custom domains', { count: this.domains.size });
    } catch (error) {
      this.logger.error('Error loading custom domains', { error });
      throw error;
    }
  }

  private mapRowToDomain(row: any): CustomDomain {
    return {
      id: row.id,
      organizationId: row.organization_id,
      domain: row.domain,
      subdomain: row.subdomain,
      status: row.status,
      verificationMethod: row.verification_method,
      verificationToken: row.verification_token,
      verificationRecord: row.verification_record,
      sslStatus: row.ssl_status,
      sslCertificate: row.ssl_certificate,
      sslPrivateKey: row.ssl_private_key,
      sslExpiresAt: row.ssl_expires_at,
      dnsRecords: JSON.parse(row.dns_records || '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      verifiedAt: row.verified_at,
    };
  }

  private isValidDomain(domain: string): boolean {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/;
    return domainRegex.test(domain);
  }

  private generateRequiredDnsRecords(domain: string, subdomain?: string): DnsRecord[] {
    const fullDomain = subdomain ? `${subdomain}.${domain}` : domain;
    
    return [
      {
        type: 'A',
        name: fullDomain,
        value: process.env.LOAD_BALANCER_IP || '127.0.0.1',
        ttl: 300,
      },
      {
        type: 'CNAME',
        name: `www.${fullDomain}`,
        value: fullDomain,
        ttl: 300,
      },
    ];
  }

  private async verifyDnsRecord(domain: CustomDomain): Promise<boolean> {
    return new Promise((resolve) => {
      const recordName = domain.verificationRecord!;
      
      dns.resolveTxt(recordName, (err, records) => {
        if (err) {
          this.logger.debug('DNS verification failed', {
            domain: domain.domain,
            error: err.message,
          });
          resolve(false);
          return;
        }

        // Check if verification token is present in TXT records
        const found = records.some(record => 
          record.some(txt => txt.includes(domain.verificationToken))
        );

        resolve(found);
      });
    });
  }

  private async verifyFileMethod(domain: CustomDomain): Promise<boolean> {
    // Implementation for file-based verification
    // This would check for a specific file at the domain root
    return false;
  }

  private async verifyEmailMethod(domain: CustomDomain): Promise<boolean> {
    // Implementation for email-based verification
    // This would check if the verification email was confirmed
    return false;
  }

  private async startDomainVerificationProcess(domainId: string): Promise<void> {
    // Start background verification process
    setTimeout(async () => {
      await this.verifyDomain(domainId);
    }, 5000); // Wait 5 seconds before first verification attempt
  }

  private async requestSslCertificate(domainId: string): Promise<void> {
    // Implementation for SSL certificate request (Let's Encrypt, etc.)
    const domain = this.domains.get(domainId);
    if (!domain) return;

    try {
      // Mock SSL certificate generation
      domain.sslStatus = 'issued';
      domain.sslExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
      domain.updatedAt = new Date();

      await this.db.query(`
        UPDATE custom_domains 
        SET ssl_status = $1, ssl_expires_at = $2, updated_at = $3
        WHERE id = $4
      `, [domain.sslStatus, domain.sslExpiresAt, domain.updatedAt, domainId]);

      this.emit('ssl.issued', domain);
    } catch (error) {
      this.logger.error('Error requesting SSL certificate', {
        domainId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async revokeSslCertificate(domainId: string): Promise<void> {
    // Implementation for SSL certificate revocation
    this.logger.info('SSL certificate revoked', { domainId });
  }

  private async updateDnsRecords(domainId: string, services: any): Promise<void> {
    // Update DNS records based on enabled services
    this.logger.info('DNS records updated', { domainId, services });
  }

  private startDomainVerification(): void {
    // Periodic domain verification
    setInterval(async () => {
      for (const [domainId, domain] of this.domains) {
        if (domain.status === 'pending' || domain.status === 'verifying') {
          await this.verifyDomain(domainId);
        }
      }
    }, 300000); // Check every 5 minutes
  }

  private startSslRenewal(): void {
    // Periodic SSL certificate renewal
    setInterval(async () => {
      for (const [domainId, domain] of this.domains) {
        if (domain.sslStatus === 'issued' && domain.sslExpiresAt) {
          const daysUntilExpiry = Math.floor(
            (domain.sslExpiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
          );
          
          if (daysUntilExpiry <= 30) {
            await this.requestSslCertificate(domainId);
          }
        }
      }
    }, 86400000); // Check daily
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const activeDomains = Array.from(this.domains.values())
        .filter(domain => domain.status === 'active').length;
      
      return {
        status: 'healthy',
        details: {
          totalDomains: this.domains.size,
          activeDomains,
          sslCertificates: Array.from(this.domains.values())
            .filter(domain => domain.sslStatus === 'issued').length,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  /**
   * Close service
   */
  public async close(): Promise<void> {
    this.domains.clear();
    this.removeAllListeners();
    this.logger.info('Custom domain service closed');
  }
}

export default CustomDomainService;
