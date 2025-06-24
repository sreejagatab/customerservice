/**
 * SMTP Connector - Generic SMTP Email Sending
 */

import nodemailer, { Transporter } from 'nodemailer';
import { AbstractConnector, SendMessageRequest } from './base';
import { IntegrationError } from '../middleware/error-handler';
import { integrationLogger } from '../utils/logger';

export class SmtpConnector extends AbstractConnector {
  public readonly id = 'smtp-connector';
  public readonly type = 'email';
  public readonly provider = 'smtp';
  public readonly name = 'SMTP Email Sender';
  public readonly version = '1.0.0';
  public readonly supportedFeatures = [
    'send_messages',
  ];

  private transporter!: Transporter;
  private smtpConfig: any;

  constructor() {
    super();
  }

  // Authentication methods
  public async authenticate(credentials: any): Promise<any> {
    try {
      if (!credentials.user || !credentials.pass) {
        throw new IntegrationError('Username and password are required for SMTP authentication');
      }

      return {
        user: credentials.user,
        pass: credentials.pass,
      };
    } catch (error) {
      this.handleError(error, 'SMTP authentication failed');
    }
  }

  public async refreshAuth(credentials: any): Promise<any> {
    // SMTP doesn't typically need token refresh
    return credentials;
  }

  public async validateAuth(credentials: any): Promise<boolean> {
    try {
      const testTransporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure || false,
        auth: {
          user: credentials.user,
          pass: credentials.pass,
        },
      });

      await testTransporter.verify();
      return true;
    } catch (error: any) {
      integrationLogger.warn('SMTP auth validation failed:', error.message);
      return false;
    }
  }

  // Connection methods
  public async connect(): Promise<void> {
    try {
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure || false,
        auth: {
          user: this.credentials.user,
          pass: this.credentials.pass,
        },
        tls: {
          rejectUnauthorized: this.config.rejectUnauthorized !== false,
        },
      });

      // Verify connection
      await this.transporter.verify();

      integrationLogger.info('Connected to SMTP server', {
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
      });

      this.emit('connected');
    } catch (error) {
      this.handleError(error, 'SMTP connection failed');
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.transporter) {
        this.transporter.close();
      }
      this.emit('disconnected');
    } catch (error: any) {
      integrationLogger.warn('Error during SMTP disconnect:', error.message);
    }
  }

  // Health check
  protected async performHealthCheck(): Promise<boolean> {
    try {
      if (!this.transporter) {
        return false;
      }
      await this.transporter.verify();
      return true;
    } catch (error) {
      return false;
    }
  }

  // Message operations
  public async sendMessage(message: SendMessageRequest): Promise<any> {
    try {
      const mailOptions = {
        from: this.config.from || this.credentials.user,
        to: message.to.map(addr => this.formatEmailAddress(addr)).join(', '),
        cc: message.cc?.map(addr => this.formatEmailAddress(addr)).join(', '),
        bcc: message.bcc?.map(addr => this.formatEmailAddress(addr)).join(', '),
        subject: message.subject,
        text: message.body.text,
        html: message.body.html,
        replyTo: message.replyTo,
        inReplyTo: message.inReplyTo,
        references: message.references?.join(' '),
        attachments: message.attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
      };

      const result = await this.transporter.sendMail(mailOptions);

      integrationLogger.info('SMTP message sent successfully', {
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected,
      });

      return {
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected,
      };
    } catch (error) {
      this.handleError(error, 'Failed to send SMTP message');
    }
  }

  // Configuration validation
  protected async validateConfig(config: any): Promise<void> {
    if (!config.host) {
      throw new IntegrationError('SMTP host is required');
    }
    if (!config.port) {
      throw new IntegrationError('SMTP port is required');
    }
    
    this.smtpConfig = config;
  }
}

export default SmtpConnector;
