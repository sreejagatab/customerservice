/**
 * White-Label Branding Service
 * Manages custom branding, themes, and white-label configurations for partner organizations
 */

import { Logger } from '../utils/logger';
import { DatabaseService } from './database';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface WhiteLabelBranding {
  id: string;
  organizationId: string;
  partnerId?: string;
  brandName: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  customCss?: string;
  emailTemplates: any;
  customDomain?: string;
  sslEnabled: boolean;
  footerText?: string;
  privacyPolicyUrl?: string;
  termsOfServiceUrl?: string;
  supportEmail?: string;
  supportPhone?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BrandingTheme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
  };
  typography: {
    fontFamily: string;
    headingFont?: string;
    fontSize: {
      small: string;
      medium: string;
      large: string;
      xlarge: string;
    };
  };
  spacing: {
    small: string;
    medium: string;
    large: string;
    xlarge: string;
  };
  borderRadius: string;
  shadows: {
    small: string;
    medium: string;
    large: string;
  };
}

export class WhiteLabelBrandingService extends EventEmitter {
  private logger: Logger;
  private db: DatabaseService;
  private uploadPath: string;

  constructor(db: DatabaseService, uploadPath: string = './uploads/branding') {
    super();
    this.logger = new Logger('WhiteLabelBrandingService');
    this.db = db;
    this.uploadPath = uploadPath;
  }

  /**
   * Create or update white-label branding
   */
  async setBranding(
    organizationId: string,
    brandingData: Partial<WhiteLabelBranding>
  ): Promise<WhiteLabelBranding> {
    try {
      const existingBranding = await this.getBranding(organizationId);
      
      if (existingBranding) {
        return await this.updateBranding(organizationId, brandingData);
      } else {
        return await this.createBranding(organizationId, brandingData);
      }
    } catch (error) {
      this.logger.error('Error setting branding:', error);
      throw new Error('Failed to set branding');
    }
  }

  /**
   * Get branding for organization
   */
  async getBranding(organizationId: string): Promise<WhiteLabelBranding | null> {
    try {
      const result = await this.db.query(
        'SELECT * FROM white_label_branding WHERE organization_id = $1',
        [organizationId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapBrandingFromDb(result.rows[0]);
    } catch (error) {
      this.logger.error('Error getting branding:', error);
      throw new Error('Failed to get branding');
    }
  }

  /**
   * Get branding by custom domain
   */
  async getBrandingByDomain(domain: string): Promise<WhiteLabelBranding | null> {
    try {
      const result = await this.db.query(
        'SELECT * FROM white_label_branding WHERE custom_domain = $1 AND is_active = true',
        [domain]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapBrandingFromDb(result.rows[0]);
    } catch (error) {
      this.logger.error('Error getting branding by domain:', error);
      throw new Error('Failed to get branding by domain');
    }
  }

  /**
   * Generate CSS theme from branding
   */
  async generateThemeCSS(organizationId: string): Promise<string> {
    try {
      const branding = await this.getBranding(organizationId);
      
      if (!branding) {
        return this.getDefaultThemeCSS();
      }

      const theme = this.brandingToTheme(branding);
      return this.themeToCSS(theme);
    } catch (error) {
      this.logger.error('Error generating theme CSS:', error);
      throw new Error('Failed to generate theme CSS');
    }
  }

  /**
   * Upload and process branding assets
   */
  async uploadBrandingAsset(
    organizationId: string,
    assetType: 'logo' | 'favicon',
    file: Buffer,
    filename: string
  ): Promise<string> {
    try {
      const fileExtension = path.extname(filename);
      const assetFilename = `${organizationId}-${assetType}${fileExtension}`;
      const assetPath = path.join(this.uploadPath, assetFilename);

      // Ensure upload directory exists
      await fs.mkdir(this.uploadPath, { recursive: true });

      // Save file
      await fs.writeFile(assetPath, file);

      // Generate public URL
      const publicUrl = `/assets/branding/${assetFilename}`;

      // Update branding record
      const updateField = assetType === 'logo' ? 'logo_url' : 'favicon_url';
      await this.db.query(
        `UPDATE white_label_branding SET ${updateField} = $1, updated_at = NOW() WHERE organization_id = $2`,
        [publicUrl, organizationId]
      );

      this.emit('branding.asset.uploaded', {
        organizationId,
        assetType,
        url: publicUrl
      });

      this.logger.info(`Branding asset uploaded: ${organizationId}/${assetType}`);

      return publicUrl;
    } catch (error) {
      this.logger.error('Error uploading branding asset:', error);
      throw new Error('Failed to upload branding asset');
    }
  }

  /**
   * Validate custom domain
   */
  async validateCustomDomain(domain: string): Promise<{
    isValid: boolean;
    isAvailable: boolean;
    dnsConfigured: boolean;
    sslReady: boolean;
  }> {
    try {
      // Basic domain validation
      const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
      const isValid = domainRegex.test(domain);

      if (!isValid) {
        return {
          isValid: false,
          isAvailable: false,
          dnsConfigured: false,
          sslReady: false
        };
      }

      // Check if domain is already in use
      const existingResult = await this.db.query(
        'SELECT id FROM white_label_branding WHERE custom_domain = $1',
        [domain]
      );
      const isAvailable = existingResult.rows.length === 0;

      // Check DNS configuration (simplified)
      const dnsConfigured = await this.checkDNSConfiguration(domain);

      // Check SSL readiness
      const sslReady = dnsConfigured && await this.checkSSLConfiguration(domain);

      return {
        isValid,
        isAvailable,
        dnsConfigured,
        sslReady
      };
    } catch (error) {
      this.logger.error('Error validating custom domain:', error);
      return {
        isValid: false,
        isAvailable: false,
        dnsConfigured: false,
        sslReady: false
      };
    }
  }

  /**
   * Setup custom domain
   */
  async setupCustomDomain(
    organizationId: string,
    domain: string
  ): Promise<{
    success: boolean;
    dnsInstructions?: string;
    sslCertificate?: any;
  }> {
    try {
      const validation = await this.validateCustomDomain(domain);
      
      if (!validation.isValid || !validation.isAvailable) {
        throw new Error('Domain is not valid or not available');
      }

      // Update branding with custom domain
      await this.db.query(
        'UPDATE white_label_branding SET custom_domain = $1, updated_at = NOW() WHERE organization_id = $2',
        [domain, organizationId]
      );

      // Generate DNS instructions
      const dnsInstructions = this.generateDNSInstructions(domain);

      // If DNS is configured, setup SSL
      let sslCertificate = null;
      if (validation.dnsConfigured) {
        sslCertificate = await this.setupSSLCertificate(domain);
      }

      this.emit('branding.domain.setup', {
        organizationId,
        domain,
        sslEnabled: !!sslCertificate
      });

      return {
        success: true,
        dnsInstructions,
        sslCertificate
      };
    } catch (error) {
      this.logger.error('Error setting up custom domain:', error);
      throw new Error('Failed to setup custom domain');
    }
  }

  /**
   * Get predefined themes
   */
  getPredefinedThemes(): BrandingTheme[] {
    return [
      {
        name: 'Professional Blue',
        colors: {
          primary: '#1976d2',
          secondary: '#424242',
          accent: '#ff4081',
          background: '#fafafa',
          surface: '#ffffff',
          text: '#212121'
        },
        typography: {
          fontFamily: 'Roboto, sans-serif',
          fontSize: {
            small: '0.875rem',
            medium: '1rem',
            large: '1.25rem',
            xlarge: '1.5rem'
          }
        },
        spacing: {
          small: '8px',
          medium: '16px',
          large: '24px',
          xlarge: '32px'
        },
        borderRadius: '4px',
        shadows: {
          small: '0 1px 3px rgba(0,0,0,0.12)',
          medium: '0 4px 6px rgba(0,0,0,0.16)',
          large: '0 10px 20px rgba(0,0,0,0.19)'
        }
      },
      {
        name: 'Modern Dark',
        colors: {
          primary: '#bb86fc',
          secondary: '#03dac6',
          accent: '#cf6679',
          background: '#121212',
          surface: '#1e1e1e',
          text: '#ffffff'
        },
        typography: {
          fontFamily: 'Inter, sans-serif',
          fontSize: {
            small: '0.875rem',
            medium: '1rem',
            large: '1.25rem',
            xlarge: '1.5rem'
          }
        },
        spacing: {
          small: '8px',
          medium: '16px',
          large: '24px',
          xlarge: '32px'
        },
        borderRadius: '8px',
        shadows: {
          small: '0 1px 3px rgba(0,0,0,0.5)',
          medium: '0 4px 6px rgba(0,0,0,0.6)',
          large: '0 10px 20px rgba(0,0,0,0.7)'
        }
      }
    ];
  }

  /**
   * Private helper methods
   */
  private async createBranding(
    organizationId: string,
    brandingData: Partial<WhiteLabelBranding>
  ): Promise<WhiteLabelBranding> {
    const result = await this.db.query(`
      INSERT INTO white_label_branding (
        organization_id, partner_id, brand_name, logo_url, favicon_url,
        primary_color, secondary_color, accent_color, font_family,
        custom_css, email_templates, custom_domain, ssl_enabled,
        footer_text, privacy_policy_url, terms_of_service_url,
        support_email, support_phone, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `, [
      organizationId,
      brandingData.partnerId,
      brandingData.brandName,
      brandingData.logoUrl,
      brandingData.faviconUrl,
      brandingData.primaryColor,
      brandingData.secondaryColor,
      brandingData.accentColor,
      brandingData.fontFamily,
      brandingData.customCss,
      JSON.stringify(brandingData.emailTemplates || {}),
      brandingData.customDomain,
      brandingData.sslEnabled || false,
      brandingData.footerText,
      brandingData.privacyPolicyUrl,
      brandingData.termsOfServiceUrl,
      brandingData.supportEmail,
      brandingData.supportPhone,
      brandingData.isActive !== false
    ]);

    const branding = this.mapBrandingFromDb(result.rows[0]);
    this.emit('branding.created', branding);
    return branding;
  }

  private async updateBranding(
    organizationId: string,
    updates: Partial<WhiteLabelBranding>
  ): Promise<WhiteLabelBranding> {
    const setClause = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'organizationId' || key === 'createdAt') continue;
      
      const dbKey = this.camelToSnake(key);
      setClause.push(`${dbKey} = $${paramIndex}`);
      
      if (key === 'emailTemplates' && typeof value === 'object') {
        values.push(JSON.stringify(value));
      } else {
        values.push(value);
      }
      paramIndex++;
    }

    values.push(organizationId);

    const result = await this.db.query(`
      UPDATE white_label_branding 
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE organization_id = $${paramIndex}
      RETURNING *
    `, values);

    const branding = this.mapBrandingFromDb(result.rows[0]);
    this.emit('branding.updated', branding);
    return branding;
  }

  private mapBrandingFromDb(row: any): WhiteLabelBranding {
    return {
      id: row.id,
      organizationId: row.organization_id,
      partnerId: row.partner_id,
      brandName: row.brand_name,
      logoUrl: row.logo_url,
      faviconUrl: row.favicon_url,
      primaryColor: row.primary_color,
      secondaryColor: row.secondary_color,
      accentColor: row.accent_color,
      fontFamily: row.font_family,
      customCss: row.custom_css,
      emailTemplates: row.email_templates,
      customDomain: row.custom_domain,
      sslEnabled: row.ssl_enabled,
      footerText: row.footer_text,
      privacyPolicyUrl: row.privacy_policy_url,
      termsOfServiceUrl: row.terms_of_service_url,
      supportEmail: row.support_email,
      supportPhone: row.support_phone,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private brandingToTheme(branding: WhiteLabelBranding): BrandingTheme {
    return {
      name: branding.brandName,
      colors: {
        primary: branding.primaryColor || '#1976d2',
        secondary: branding.secondaryColor || '#424242',
        accent: branding.accentColor || '#ff4081',
        background: '#fafafa',
        surface: '#ffffff',
        text: '#212121'
      },
      typography: {
        fontFamily: branding.fontFamily || 'Roboto, sans-serif',
        fontSize: {
          small: '0.875rem',
          medium: '1rem',
          large: '1.25rem',
          xlarge: '1.5rem'
        }
      },
      spacing: {
        small: '8px',
        medium: '16px',
        large: '24px',
        xlarge: '32px'
      },
      borderRadius: '4px',
      shadows: {
        small: '0 1px 3px rgba(0,0,0,0.12)',
        medium: '0 4px 6px rgba(0,0,0,0.16)',
        large: '0 10px 20px rgba(0,0,0,0.19)'
      }
    };
  }

  private themeToCSS(theme: BrandingTheme): string {
    return `
      :root {
        --color-primary: ${theme.colors.primary};
        --color-secondary: ${theme.colors.secondary};
        --color-accent: ${theme.colors.accent};
        --color-background: ${theme.colors.background};
        --color-surface: ${theme.colors.surface};
        --color-text: ${theme.colors.text};
        
        --font-family: ${theme.typography.fontFamily};
        --font-size-small: ${theme.typography.fontSize.small};
        --font-size-medium: ${theme.typography.fontSize.medium};
        --font-size-large: ${theme.typography.fontSize.large};
        --font-size-xlarge: ${theme.typography.fontSize.xlarge};
        
        --spacing-small: ${theme.spacing.small};
        --spacing-medium: ${theme.spacing.medium};
        --spacing-large: ${theme.spacing.large};
        --spacing-xlarge: ${theme.spacing.xlarge};
        
        --border-radius: ${theme.borderRadius};
        
        --shadow-small: ${theme.shadows.small};
        --shadow-medium: ${theme.shadows.medium};
        --shadow-large: ${theme.shadows.large};
      }
    `;
  }

  private getDefaultThemeCSS(): string {
    const defaultTheme = this.getPredefinedThemes()[0];
    return this.themeToCSS(defaultTheme);
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  private async checkDNSConfiguration(domain: string): Promise<boolean> {
    // Simplified DNS check - in production, use proper DNS resolution
    return true;
  }

  private async checkSSLConfiguration(domain: string): Promise<boolean> {
    // Simplified SSL check - in production, use proper SSL verification
    return true;
  }

  private generateDNSInstructions(domain: string): string {
    return `
      To configure DNS for ${domain}:
      1. Create a CNAME record pointing to: platform.universalai-cs.com
      2. Add TXT record for verification: universalai-cs-verification=<token>
      3. Wait for DNS propagation (up to 24 hours)
    `;
  }

  private async setupSSLCertificate(domain: string): Promise<any> {
    // In production, integrate with Let's Encrypt or other SSL provider
    return {
      domain,
      status: 'issued',
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
    };
  }
}

export default WhiteLabelBrandingService;
