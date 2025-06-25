/**
 * Template Service for Notifications
 * Handles template compilation, caching, and rendering with Handlebars
 */

import Handlebars from 'handlebars';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { redis } from '@/services/redis';

export interface NotificationTemplate {
  id: string;
  name: string;
  type: 'email' | 'sms' | 'push' | 'in_app';
  organizationId: string;
  subject?: string;
  content: string;
  htmlContent?: string;
  variables: string[];
  isActive: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateRenderData {
  [key: string]: any;
}

export interface RenderedTemplate {
  subject?: string;
  content: string;
  htmlContent?: string;
  variables: string[];
}

export class TemplateService {
  private static instance: TemplateService;
  private compiledTemplates: Map<string, HandlebarsTemplateDelegate> = new Map();

  private constructor() {
    this.registerHelpers();
  }

  public static getInstance(): TemplateService {
    if (!TemplateService.instance) {
      TemplateService.instance = new TemplateService();
    }
    return TemplateService.instance;
  }

  /**
   * Register Handlebars helpers
   */
  private registerHelpers(): void {
    // Date formatting helper
    Handlebars.registerHelper('formatDate', (date: Date, format: string = 'YYYY-MM-DD') => {
      const moment = require('moment');
      return moment(date).format(format);
    });

    // Currency formatting helper
    Handlebars.registerHelper('formatCurrency', (amount: number, currency: string = 'USD') => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
      }).format(amount);
    });

    // Conditional helper
    Handlebars.registerHelper('ifEquals', function(arg1: any, arg2: any, options: any) {
      return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
    });

    // Uppercase helper
    Handlebars.registerHelper('uppercase', (str: string) => {
      return str ? str.toUpperCase() : '';
    });

    // Lowercase helper
    Handlebars.registerHelper('lowercase', (str: string) => {
      return str ? str.toLowerCase() : '';
    });

    // Truncate helper
    Handlebars.registerHelper('truncate', (str: string, length: number = 100) => {
      if (!str) return '';
      return str.length > length ? str.substring(0, length) + '...' : str;
    });

    // Join array helper
    Handlebars.registerHelper('join', (array: any[], separator: string = ', ') => {
      return Array.isArray(array) ? array.join(separator) : '';
    });

    // Math helpers
    Handlebars.registerHelper('add', (a: number, b: number) => a + b);
    Handlebars.registerHelper('subtract', (a: number, b: number) => a - b);
    Handlebars.registerHelper('multiply', (a: number, b: number) => a * b);
    Handlebars.registerHelper('divide', (a: number, b: number) => b !== 0 ? a / b : 0);

    logger.info('Handlebars helpers registered');
  }

  /**
   * Compile and cache template
   */
  private async compileTemplate(templateId: string, content: string): Promise<HandlebarsTemplateDelegate> {
    const cacheKey = `compiled_template:${templateId}`;
    
    try {
      // Check if already compiled and cached
      if (this.compiledTemplates.has(templateId)) {
        return this.compiledTemplates.get(templateId)!;
      }

      // Check Redis cache
      const cachedTemplate = await redis.get(cacheKey);
      if (cachedTemplate) {
        const compiled = Handlebars.compile(content);
        this.compiledTemplates.set(templateId, compiled);
        return compiled;
      }

      // Compile template
      const compiled = Handlebars.compile(content, {
        strict: true,
        noEscape: false,
      });

      // Cache in memory and Redis
      this.compiledTemplates.set(templateId, compiled);
      await redis.set(cacheKey, 'compiled', { ttl: config.templates.cacheTtl });

      logger.debug('Template compiled and cached', { templateId });
      
      return compiled;
    } catch (error) {
      logger.error('Template compilation failed', {
        templateId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Template compilation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Render template with data
   */
  public async renderTemplate(
    template: NotificationTemplate,
    data: TemplateRenderData
  ): Promise<RenderedTemplate> {
    try {
      const startTime = Date.now();

      // Compile templates
      const contentTemplate = await this.compileTemplate(`${template.id}_content`, template.content);
      const subjectTemplate = template.subject 
        ? await this.compileTemplate(`${template.id}_subject`, template.subject)
        : null;
      const htmlTemplate = template.htmlContent 
        ? await this.compileTemplate(`${template.id}_html`, template.htmlContent)
        : null;

      // Prepare render context
      const renderContext = {
        ...data,
        // Add system variables
        _system: {
          timestamp: new Date(),
          organizationId: template.organizationId,
          templateId: template.id,
          templateName: template.name,
        },
      };

      // Render templates
      const renderedContent = contentTemplate(renderContext);
      const renderedSubject = subjectTemplate ? subjectTemplate(renderContext) : undefined;
      const renderedHtml = htmlTemplate ? htmlTemplate(renderContext) : undefined;

      const renderTime = Date.now() - startTime;

      logger.debug('Template rendered successfully', {
        templateId: template.id,
        templateName: template.name,
        renderTime,
      });

      return {
        subject: renderedSubject,
        content: renderedContent,
        htmlContent: renderedHtml,
        variables: template.variables,
      };
    } catch (error) {
      logger.error('Template rendering failed', {
        templateId: template.id,
        templateName: template.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Template rendering failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate template syntax
   */
  public validateTemplate(content: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      // Try to compile the template
      Handlebars.compile(content, { strict: true });
      
      // Check for common issues
      const issues = this.checkTemplateIssues(content);
      errors.push(...issues);

      return {
        isValid: errors.length === 0,
        errors,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        isValid: false,
        errors,
      };
    }
  }

  /**
   * Check for common template issues
   */
  private checkTemplateIssues(content: string): string[] {
    const issues: string[] = [];

    // Check for unescaped variables that might be security risks
    const unescapedVariables = content.match(/{{{[^}]+}}}/g);
    if (unescapedVariables) {
      issues.push(`Found unescaped variables: ${unescapedVariables.join(', ')}. Consider using {{variable}} instead of {{{variable}}}`);
    }

    // Check for potentially dangerous helpers
    const dangerousHelpers = ['eval', 'exec', 'require'];
    for (const helper of dangerousHelpers) {
      if (content.includes(`{{${helper}`)) {
        issues.push(`Potentially dangerous helper found: ${helper}`);
      }
    }

    // Check for missing closing tags
    const openTags = (content.match(/{{[^}]*$/gm) || []).length;
    const closeTags = (content.match(/^[^{]*}}/gm) || []).length;
    if (openTags !== closeTags) {
      issues.push('Mismatched opening and closing tags');
    }

    return issues;
  }

  /**
   * Extract variables from template content
   */
  public extractVariables(content: string): string[] {
    const variables = new Set<string>();
    
    // Match Handlebars variables: {{variable}} or {{object.property}}
    const variableMatches = content.match(/{{[^#/][^}]*}}/g);
    
    if (variableMatches) {
      for (const match of variableMatches) {
        // Remove {{ and }} and extract variable name
        const variable = match.replace(/[{}]/g, '').trim();
        
        // Skip helpers and system variables
        if (!variable.includes(' ') && !variable.startsWith('_system')) {
          variables.add(variable.split('.')[0]); // Get root variable name
        }
      }
    }

    return Array.from(variables).sort();
  }

  /**
   * Get default templates for different notification types
   */
  public getDefaultTemplates(): { [type: string]: Partial<NotificationTemplate> } {
    return {
      'welcome_email': {
        name: 'Welcome Email',
        type: 'email',
        subject: 'Welcome to {{organizationName}}!',
        content: `Hello {{customerName}},

Welcome to {{organizationName}}! We're excited to have you on board.

Your account has been successfully created with the email: {{customerEmail}}

If you have any questions, feel free to reach out to our support team.

Best regards,
The {{organizationName}} Team`,
        htmlContent: `
<h1>Welcome to {{organizationName}}!</h1>
<p>Hello {{customerName}},</p>
<p>Welcome to {{organizationName}}! We're excited to have you on board.</p>
<p>Your account has been successfully created with the email: <strong>{{customerEmail}}</strong></p>
<p>If you have any questions, feel free to reach out to our support team.</p>
<p>Best regards,<br>The {{organizationName}} Team</p>
`,
        variables: ['customerName', 'customerEmail', 'organizationName'],
      },
      
      'message_received': {
        name: 'New Message Notification',
        type: 'email',
        subject: 'New message from {{senderName}}',
        content: `You have received a new message from {{senderName}}.

Message: {{messageContent}}

Reply to this message by visiting: {{conversationUrl}}

Best regards,
{{organizationName}} Support`,
        variables: ['senderName', 'messageContent', 'conversationUrl', 'organizationName'],
      },

      'sms_notification': {
        name: 'SMS Notification',
        type: 'sms',
        content: '{{organizationName}}: {{messageContent}}. Reply STOP to opt out.',
        variables: ['organizationName', 'messageContent'],
      },

      'push_notification': {
        name: 'Push Notification',
        type: 'push',
        subject: '{{title}}',
        content: '{{body}}',
        variables: ['title', 'body'],
      },

      'in_app_notification': {
        name: 'In-App Notification',
        type: 'in_app',
        subject: '{{title}}',
        content: '{{message}}',
        variables: ['title', 'message'],
      },
    };
  }

  /**
   * Clear template cache
   */
  public async clearCache(templateId?: string): Promise<void> {
    try {
      if (templateId) {
        // Clear specific template
        this.compiledTemplates.delete(templateId);
        await redis.del(`compiled_template:${templateId}`);
        await redis.del(`compiled_template:${templateId}_content`);
        await redis.del(`compiled_template:${templateId}_subject`);
        await redis.del(`compiled_template:${templateId}_html`);
      } else {
        // Clear all templates
        this.compiledTemplates.clear();
        const keys = await redis.keys('compiled_template:*');
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      }

      logger.info('Template cache cleared', { templateId: templateId || 'all' });
    } catch (error) {
      logger.error('Failed to clear template cache', {
        templateId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Precompile templates for better performance
   */
  public async precompileTemplates(templates: NotificationTemplate[]): Promise<void> {
    const startTime = Date.now();
    let compiled = 0;

    for (const template of templates) {
      try {
        await this.compileTemplate(`${template.id}_content`, template.content);
        
        if (template.subject) {
          await this.compileTemplate(`${template.id}_subject`, template.subject);
        }
        
        if (template.htmlContent) {
          await this.compileTemplate(`${template.id}_html`, template.htmlContent);
        }
        
        compiled++;
      } catch (error) {
        logger.error('Failed to precompile template', {
          templateId: template.id,
          templateName: template.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const duration = Date.now() - startTime;
    logger.info('Templates precompiled', {
      total: templates.length,
      compiled,
      failed: templates.length - compiled,
      duration,
    });
  }
}

// Export singleton instance
export const templateService = TemplateService.getInstance();
