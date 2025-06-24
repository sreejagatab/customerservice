import nodemailer from 'nodemailer';
import { Imap } from 'imap';
import { simpleParser } from 'mailparser';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { BaseIntegrationProvider } from '../BaseIntegrationProvider';
import { IntegrationConfig, Message, SendMessageRequest, SendMessageResponse } from '../../types';

export interface SmtpConfig extends IntegrationConfig {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  imap: {
    host: string;
    port: number;
    tls: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  folders: {
    inbox: string;
    sent: string;
    drafts: string;
    trash: string;
  };
}

export class SmtpProvider extends BaseIntegrationProvider {
  private smtpTransporter: nodemailer.Transporter | null = null;
  private imapConnection: Imap | null = null;
  private eventEmitter: EventEmitter;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000;

  constructor(config: SmtpConfig) {
    super(config);
    this.eventEmitter = new EventEmitter();
    this.setupEventHandlers();
  }

  async initialize(): Promise<void> {
    try {
      await this.setupSmtpTransporter();
      await this.setupImapConnection();
      await this.startListening();
      this.isConnected = true;
      this.reconnectAttempts = 0;
      logger.info('SMTP/IMAP provider initialized successfully', {
        integrationId: this.config.id,
        smtpHost: this.config.smtp.host,
        imapHost: this.config.imap.host,
      });
    } catch (error) {
      logger.error('Failed to initialize SMTP/IMAP provider', {
        integrationId: this.config.id,
        error: error.message,
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.imapConnection) {
        this.imapConnection.end();
        this.imapConnection = null;
      }
      
      if (this.smtpTransporter) {
        this.smtpTransporter.close();
        this.smtpTransporter = null;
      }
      
      this.isConnected = false;
      logger.info('SMTP/IMAP provider disconnected', {
        integrationId: this.config.id,
      });
    } catch (error) {
      logger.error('Error disconnecting SMTP/IMAP provider', {
        integrationId: this.config.id,
        error: error.message,
      });
    }
  }

  async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    if (!this.smtpTransporter) {
      throw new Error('SMTP transporter not initialized');
    }

    try {
      const mailOptions = {
        from: this.config.smtp.auth.user,
        to: request.to,
        cc: request.cc,
        bcc: request.bcc,
        subject: request.subject,
        text: request.text,
        html: request.html,
        attachments: request.attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
        inReplyTo: request.inReplyTo,
        references: request.references,
      };

      const info = await this.smtpTransporter.sendMail(mailOptions);
      
      logger.info('Email sent successfully', {
        integrationId: this.config.id,
        messageId: info.messageId,
        to: request.to,
        subject: request.subject,
      });

      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
      };
    } catch (error) {
      logger.error('Failed to send email', {
        integrationId: this.config.id,
        error: error.message,
        to: request.to,
        subject: request.subject,
      });
      
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.smtpTransporter) {
        await this.setupSmtpTransporter();
      }
      
      await this.smtpTransporter!.verify();
      
      // Test IMAP connection
      const testImap = new Imap({
        host: this.config.imap.host,
        port: this.config.imap.port,
        tls: this.config.imap.tls,
        auth: this.config.imap.auth,
        connTimeout: 10000,
        authTimeout: 5000,
      });

      return new Promise((resolve, reject) => {
        testImap.once('ready', () => {
          testImap.end();
          resolve(true);
        });

        testImap.once('error', (error) => {
          reject(error);
        });

        testImap.connect();
      });
    } catch (error) {
      logger.error('Connection test failed', {
        integrationId: this.config.id,
        error: error.message,
      });
      return false;
    }
  }

  private async setupSmtpTransporter(): Promise<void> {
    this.smtpTransporter = nodemailer.createTransporter({
      host: this.config.smtp.host,
      port: this.config.smtp.port,
      secure: this.config.smtp.secure,
      auth: this.config.smtp.auth,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 10,
    });

    // Verify SMTP connection
    await this.smtpTransporter.verify();
  }

  private async setupImapConnection(): Promise<void> {
    this.imapConnection = new Imap({
      host: this.config.imap.host,
      port: this.config.imap.port,
      tls: this.config.imap.tls,
      auth: this.config.imap.auth,
      connTimeout: 60000,
      authTimeout: 5000,
      keepalive: {
        interval: 10000,
        idleInterval: 300000,
        forceNoop: true,
      },
    });

    this.setupImapEventHandlers();
  }

  private setupImapEventHandlers(): void {
    if (!this.imapConnection) return;

    this.imapConnection.once('ready', () => {
      logger.info('IMAP connection ready', { integrationId: this.config.id });
      this.openInbox();
    });

    this.imapConnection.on('mail', (numNewMsgs: number) => {
      logger.info('New mail received', {
        integrationId: this.config.id,
        count: numNewMsgs,
      });
      this.fetchNewMessages();
    });

    this.imapConnection.on('error', (error) => {
      logger.error('IMAP connection error', {
        integrationId: this.config.id,
        error: error.message,
      });
      this.handleConnectionError();
    });

    this.imapConnection.on('end', () => {
      logger.info('IMAP connection ended', { integrationId: this.config.id });
      this.isConnected = false;
    });
  }

  private openInbox(): void {
    if (!this.imapConnection) return;

    this.imapConnection.openBox(this.config.folders.inbox, false, (error, box) => {
      if (error) {
        logger.error('Failed to open inbox', {
          integrationId: this.config.id,
          error: error.message,
        });
        return;
      }

      logger.info('Inbox opened successfully', {
        integrationId: this.config.id,
        totalMessages: box.messages.total,
        newMessages: box.messages.new,
      });

      // Fetch recent messages on initial connection
      this.fetchRecentMessages();
    });
  }

  private fetchNewMessages(): void {
    if (!this.imapConnection) return;

    const search = this.imapConnection.search(['UNSEEN'], (error, results) => {
      if (error) {
        logger.error('Error searching for new messages', {
          integrationId: this.config.id,
          error: error.message,
        });
        return;
      }

      if (results.length === 0) return;

      this.processMessages(results);
    });
  }

  private fetchRecentMessages(): void {
    if (!this.imapConnection) return;

    // Fetch messages from the last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    this.imapConnection.search(['SINCE', yesterday], (error, results) => {
      if (error) {
        logger.error('Error searching for recent messages', {
          integrationId: this.config.id,
          error: error.message,
        });
        return;
      }

      if (results.length === 0) return;

      // Limit to last 50 messages to avoid overwhelming the system
      const recentResults = results.slice(-50);
      this.processMessages(recentResults);
    });
  }

  private processMessages(messageIds: number[]): void {
    if (!this.imapConnection || messageIds.length === 0) return;

    const fetch = this.imapConnection.fetch(messageIds, {
      bodies: '',
      struct: true,
      markSeen: false,
    });

    fetch.on('message', (msg, seqno) => {
      let buffer = '';
      let attributes: any = null;

      msg.on('body', (stream) => {
        stream.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
        });
      });

      msg.once('attributes', (attrs) => {
        attributes = attrs;
      });

      msg.once('end', async () => {
        try {
          const parsed = await simpleParser(buffer);
          const message = this.convertToMessage(parsed, attributes, seqno);
          
          // Emit message event for processing
          this.eventEmitter.emit('message', message);
          
          logger.debug('Message processed', {
            integrationId: this.config.id,
            messageId: message.id,
            subject: message.subject,
            from: message.from,
          });
        } catch (error) {
          logger.error('Error parsing message', {
            integrationId: this.config.id,
            seqno,
            error: error.message,
          });
        }
      });
    });

    fetch.once('error', (error) => {
      logger.error('Error fetching messages', {
        integrationId: this.config.id,
        error: error.message,
      });
    });
  }

  private convertToMessage(parsed: any, attributes: any, seqno: number): Message {
    return {
      id: parsed.messageId || `${this.config.id}-${seqno}`,
      threadId: parsed.inReplyTo || parsed.messageId,
      from: parsed.from?.text || '',
      to: parsed.to?.text || '',
      cc: parsed.cc?.text || '',
      bcc: parsed.bcc?.text || '',
      subject: parsed.subject || '',
      body: parsed.text || '',
      htmlBody: parsed.html || '',
      timestamp: parsed.date || new Date(),
      attachments: parsed.attachments?.map((att: any) => ({
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        content: att.content,
      })) || [],
      headers: parsed.headers || {},
      integrationId: this.config.id,
      integrationName: this.config.name,
      metadata: {
        seqno,
        uid: attributes?.uid,
        flags: attributes?.flags || [],
        internalDate: attributes?.date,
      },
    };
  }

  private async startListening(): Promise<void> {
    if (!this.imapConnection) return;

    return new Promise((resolve, reject) => {
      this.imapConnection!.once('ready', () => {
        resolve();
      });

      this.imapConnection!.once('error', (error) => {
        reject(error);
      });

      this.imapConnection!.connect();
    });
  }

  private setupEventHandlers(): void {
    this.eventEmitter.on('message', (message: Message) => {
      // Forward message to the main message processing pipeline
      this.emit('message', message);
    });
  }

  private async handleConnectionError(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached', {
        integrationId: this.config.id,
        attempts: this.reconnectAttempts,
      });
      return;
    }

    this.reconnectAttempts++;
    logger.info('Attempting to reconnect', {
      integrationId: this.config.id,
      attempt: this.reconnectAttempts,
      delay: this.reconnectDelay,
    });

    setTimeout(async () => {
      try {
        await this.disconnect();
        await this.initialize();
      } catch (error) {
        logger.error('Reconnection failed', {
          integrationId: this.config.id,
          attempt: this.reconnectAttempts,
          error: error.message,
        });
      }
    }, this.reconnectDelay);
  }

  getStatus(): any {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      smtpReady: !!this.smtpTransporter,
      imapReady: !!this.imapConnection,
    };
  }
}
