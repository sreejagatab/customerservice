/**
 * Email Provider Service
 * Supports multiple email providers: SMTP, SendGrid, AWS SES
 */

import nodemailer, { Transporter } from 'nodemailer';
import { config } from '@/config';
import { logger } from '@/utils/logger';

export interface EmailMessage {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content?: Buffer | string;
    path?: string;
    contentType?: string;
    cid?: string;
  }>;
  headers?: Record<string, string>;
  replyTo?: string;
  priority?: 'high' | 'normal' | 'low';
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: string;
  deliveryTime: number;
}

export interface EmailProvider {
  name: string;
  send(message: EmailMessage): Promise<EmailResult>;
  healthCheck(): Promise<boolean>;
}

/**
 * SMTP Email Provider
 */
export class SMTPEmailProvider implements EmailProvider {
  public readonly name = 'smtp';
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransporter({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.secure,
      auth: config.email.smtp.user && config.email.smtp.password ? {
        user: config.email.smtp.user,
        pass: config.email.smtp.password,
      } : undefined,
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  public async send(message: EmailMessage): Promise<EmailResult> {
    const startTime = Date.now();

    try {
      const mailOptions = {
        from: `${config.email.smtp.fromName} <${config.email.smtp.fromEmail}>`,
        to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
        cc: message.cc ? (Array.isArray(message.cc) ? message.cc.join(', ') : message.cc) : undefined,
        bcc: message.bcc ? (Array.isArray(message.bcc) ? message.bcc.join(', ') : message.bcc) : undefined,
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachments,
        headers: message.headers,
        replyTo: message.replyTo,
        priority: message.priority,
      };

      const result = await this.transporter.sendMail(mailOptions);
      const deliveryTime = Date.now() - startTime;

      logger.info('Email sent via SMTP', {
        messageId: result.messageId,
        to: message.to,
        subject: message.subject,
        deliveryTime,
      });

      return {
        success: true,
        messageId: result.messageId,
        provider: this.name,
        deliveryTime,
      };
    } catch (error) {
      const deliveryTime = Date.now() - startTime;
      
      logger.error('SMTP email send failed', {
        to: message.to,
        subject: message.subject,
        error: error instanceof Error ? error.message : String(error),
        deliveryTime,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        provider: this.name,
        deliveryTime,
      };
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      logger.error('SMTP health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

/**
 * SendGrid Email Provider
 */
export class SendGridEmailProvider implements EmailProvider {
  public readonly name = 'sendgrid';
  private apiKey: string;

  constructor() {
    if (!config.email.sendgrid.apiKey) {
      throw new Error('SendGrid API key not configured');
    }
    this.apiKey = config.email.sendgrid.apiKey;
  }

  public async send(message: EmailMessage): Promise<EmailResult> {
    const startTime = Date.now();

    try {
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(this.apiKey);

      const mailData = {
        from: config.email.sendgrid.fromEmail || config.email.smtp.fromEmail,
        to: message.to,
        cc: message.cc,
        bcc: message.bcc,
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachments?.map(att => ({
          content: att.content ? Buffer.from(att.content).toString('base64') : undefined,
          filename: att.filename,
          type: att.contentType,
          disposition: 'attachment',
          contentId: att.cid,
        })),
        headers: message.headers,
        replyTo: message.replyTo,
      };

      const result = await sgMail.send(mailData);
      const deliveryTime = Date.now() - startTime;

      logger.info('Email sent via SendGrid', {
        messageId: result[0]?.headers?.['x-message-id'],
        to: message.to,
        subject: message.subject,
        deliveryTime,
      });

      return {
        success: true,
        messageId: result[0]?.headers?.['x-message-id'],
        provider: this.name,
        deliveryTime,
      };
    } catch (error) {
      const deliveryTime = Date.now() - startTime;
      
      logger.error('SendGrid email send failed', {
        to: message.to,
        subject: message.subject,
        error: error instanceof Error ? error.message : String(error),
        deliveryTime,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        provider: this.name,
        deliveryTime,
      };
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      // SendGrid doesn't have a specific health check endpoint
      // We'll just verify the API key format
      return this.apiKey.startsWith('SG.');
    } catch (error) {
      return false;
    }
  }
}

/**
 * AWS SES Email Provider
 */
export class AWSEmailProvider implements EmailProvider {
  public readonly name = 'aws-ses';
  private sesClient: any;

  constructor() {
    if (!config.email.awsSes.accessKeyId || !config.email.awsSes.secretAccessKey) {
      throw new Error('AWS SES credentials not configured');
    }

    const AWS = require('aws-sdk');
    AWS.config.update({
      accessKeyId: config.email.awsSes.accessKeyId,
      secretAccessKey: config.email.awsSes.secretAccessKey,
      region: config.email.awsSes.region,
    });

    this.sesClient = new AWS.SES();
  }

  public async send(message: EmailMessage): Promise<EmailResult> {
    const startTime = Date.now();

    try {
      const params = {
        Source: config.email.awsSes.fromEmail || config.email.smtp.fromEmail,
        Destination: {
          ToAddresses: Array.isArray(message.to) ? message.to : [message.to],
          CcAddresses: message.cc ? (Array.isArray(message.cc) ? message.cc : [message.cc]) : undefined,
          BccAddresses: message.bcc ? (Array.isArray(message.bcc) ? message.bcc : [message.bcc]) : undefined,
        },
        Message: {
          Subject: {
            Data: message.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Text: message.text ? {
              Data: message.text,
              Charset: 'UTF-8',
            } : undefined,
            Html: message.html ? {
              Data: message.html,
              Charset: 'UTF-8',
            } : undefined,
          },
        },
        ReplyToAddresses: message.replyTo ? [message.replyTo] : undefined,
      };

      const result = await this.sesClient.sendEmail(params).promise();
      const deliveryTime = Date.now() - startTime;

      logger.info('Email sent via AWS SES', {
        messageId: result.MessageId,
        to: message.to,
        subject: message.subject,
        deliveryTime,
      });

      return {
        success: true,
        messageId: result.MessageId,
        provider: this.name,
        deliveryTime,
      };
    } catch (error) {
      const deliveryTime = Date.now() - startTime;
      
      logger.error('AWS SES email send failed', {
        to: message.to,
        subject: message.subject,
        error: error instanceof Error ? error.message : String(error),
        deliveryTime,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        provider: this.name,
        deliveryTime,
      };
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.sesClient.getSendQuota().promise();
      return true;
    } catch (error) {
      logger.error('AWS SES health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

/**
 * Email Service with Provider Management
 */
export class EmailService {
  private static instance: EmailService;
  private providers: EmailProvider[] = [];
  private primaryProvider: EmailProvider | null = null;

  private constructor() {
    this.initializeProviders();
  }

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  private initializeProviders(): void {
    try {
      // Initialize SMTP provider (always available)
      const smtpProvider = new SMTPEmailProvider();
      this.providers.push(smtpProvider);
      this.primaryProvider = smtpProvider;

      // Initialize SendGrid if configured
      if (config.email.sendgrid.apiKey) {
        const sendGridProvider = new SendGridEmailProvider();
        this.providers.push(sendGridProvider);
        this.primaryProvider = sendGridProvider; // Prefer SendGrid over SMTP
      }

      // Initialize AWS SES if configured
      if (config.email.awsSes.accessKeyId && config.email.awsSes.secretAccessKey) {
        const awsProvider = new AWSEmailProvider();
        this.providers.push(awsProvider);
        this.primaryProvider = awsProvider; // Prefer AWS SES over others
      }

      logger.info('Email providers initialized', {
        providers: this.providers.map(p => p.name),
        primary: this.primaryProvider?.name,
      });
    } catch (error) {
      logger.error('Failed to initialize email providers', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  public async sendEmail(message: EmailMessage): Promise<EmailResult> {
    if (!this.primaryProvider) {
      throw new Error('No email provider available');
    }

    // Try primary provider first
    let result = await this.primaryProvider.send(message);
    
    if (result.success) {
      return result;
    }

    // If primary provider fails, try fallback providers
    for (const provider of this.providers) {
      if (provider === this.primaryProvider) continue;

      logger.warn('Trying fallback email provider', {
        provider: provider.name,
        primaryProvider: this.primaryProvider.name,
        originalError: result.error,
      });

      result = await provider.send(message);
      
      if (result.success) {
        return result;
      }
    }

    // All providers failed
    logger.error('All email providers failed', {
      to: message.to,
      subject: message.subject,
      lastError: result.error,
    });

    return result;
  }

  public async healthCheck(): Promise<{ [providerName: string]: boolean }> {
    const healthStatus: { [providerName: string]: boolean } = {};

    for (const provider of this.providers) {
      healthStatus[provider.name] = await provider.healthCheck();
    }

    return healthStatus;
  }

  public getProviders(): string[] {
    return this.providers.map(p => p.name);
  }

  public getPrimaryProvider(): string | null {
    return this.primaryProvider?.name || null;
  }
}

// Export singleton instance
export const emailService = EmailService.getInstance();
