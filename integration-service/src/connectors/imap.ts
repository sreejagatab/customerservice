/**
 * IMAP Connector - Generic IMAP Email Reading
 */

import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { AbstractConnector, Message, FetchOptions, SyncResult } from './base';
import { IntegrationError } from '../middleware/error-handler';
import { integrationLogger } from '../utils/logger';

export class ImapConnector extends AbstractConnector {
  public readonly id = 'imap-connector';
  public readonly type = 'email';
  public readonly provider = 'imap';
  public readonly name = 'IMAP Email Reader';
  public readonly version = '1.0.0';
  public readonly supportedFeatures = [
    'read_messages',
    'mark_read',
    'delete_messages',
    'sync',
  ];

  private imap!: Imap;
  private imapConfig: any;

  constructor() {
    super();
  }

  // Authentication methods
  public async authenticate(credentials: any): Promise<any> {
    try {
      if (!credentials.user || !credentials.pass) {
        throw new IntegrationError('Username and password are required for IMAP authentication');
      }

      return {
        user: credentials.user,
        pass: credentials.pass,
      };
    } catch (error) {
      this.handleError(error, 'IMAP authentication failed');
    }
  }

  public async refreshAuth(credentials: any): Promise<any> {
    // IMAP doesn't typically need token refresh
    return credentials;
  }

  public async validateAuth(credentials: any): Promise<boolean> {
    try {
      const testImap = new Imap({
        user: credentials.user,
        password: credentials.pass,
        host: this.config.host,
        port: this.config.port,
        tls: this.config.tls !== false,
        tlsOptions: {
          rejectUnauthorized: this.config.rejectUnauthorized !== false,
        },
      });

      return new Promise((resolve) => {
        testImap.once('ready', () => {
          testImap.end();
          resolve(true);
        });

        testImap.once('error', () => {
          resolve(false);
        });

        testImap.connect();
      });
    } catch (error: any) {
      integrationLogger.warn('IMAP auth validation failed:', error.message);
      return false;
    }
  }

  // Connection methods
  public async connect(): Promise<void> {
    try {
      this.imap = new Imap({
        user: this.credentials.user,
        password: this.credentials.pass,
        host: this.config.host,
        port: this.config.port,
        tls: this.config.tls !== false,
        tlsOptions: {
          rejectUnauthorized: this.config.rejectUnauthorized !== false,
        },
        keepalive: true,
      });

      return new Promise((resolve, reject) => {
        this.imap.once('ready', () => {
          integrationLogger.info('Connected to IMAP server', {
            host: this.config.host,
            port: this.config.port,
            tls: this.config.tls,
          });

          this.emit('connected');
          resolve();
        });

        this.imap.once('error', (error: any) => {
          reject(this.handleError(error, 'IMAP connection failed'));
        });

        this.imap.connect();
      });
    } catch (error) {
      this.handleError(error, 'IMAP connection failed');
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.imap) {
        this.imap.end();
      }
      this.emit('disconnected');
    } catch (error: any) {
      integrationLogger.warn('Error during IMAP disconnect:', error.message);
    }
  }

  // Health check
  protected async performHealthCheck(): Promise<boolean> {
    try {
      if (!this.imap || this.imap.state !== 'authenticated') {
        return false;
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  // Message operations
  public async fetchMessages(options: FetchOptions = {}): Promise<Message[]> {
    try {
      const {
        limit = 50,
        since,
        before,
      } = options;

      const mailbox = this.config.mailbox || 'INBOX';

      return new Promise((resolve, reject) => {
        this.imap.openBox(mailbox, true, (error, box) => {
          if (error) {
            return reject(this.handleError(error, 'Failed to open IMAP mailbox'));
          }

          // Build search criteria
          const searchCriteria: any[] = ['ALL'];
          if (since) {
            searchCriteria.push(['SINCE', since]);
          }
          if (before) {
            searchCriteria.push(['BEFORE', before]);
          }

          this.imap.search(searchCriteria, (searchError, results) => {
            if (searchError) {
              return reject(this.handleError(searchError, 'IMAP search failed'));
            }

            if (!results || results.length === 0) {
              return resolve([]);
            }

            // Limit results
            const limitedResults = results.slice(-limit);
            const messages: Message[] = [];
            let processed = 0;

            const fetch = this.imap.fetch(limitedResults, {
              bodies: '',
              struct: true,
            });

            fetch.on('message', (msg, seqno) => {
              let buffer = '';

              msg.on('body', (stream) => {
                stream.on('data', (chunk) => {
                  buffer += chunk.toString('utf8');
                });
              });

              msg.once('attributes', (attrs) => {
                msg.once('end', async () => {
                  try {
                    const parsed = await simpleParser(buffer);
                    const message = this.parseImapMessage(parsed, attrs);
                    messages.push(message);
                    processed++;

                    if (processed === limitedResults.length) {
                      resolve(messages);
                    }
                  } catch (parseError) {
                    integrationLogger.error('Failed to parse IMAP message:', parseError);
                    processed++;
                    if (processed === limitedResults.length) {
                      resolve(messages);
                    }
                  }
                });
              });
            });

            fetch.once('error', (fetchError) => {
              reject(this.handleError(fetchError, 'IMAP fetch failed'));
            });

            fetch.once('end', () => {
              if (processed === 0) {
                resolve([]);
              }
            });
          });
        });
      });
    } catch (error) {
      this.handleError(error, 'Failed to fetch IMAP messages');
    }
  }

  public async markAsRead(messageId: string): Promise<void> {
    try {
      const uid = parseInt(messageId);
      if (isNaN(uid)) {
        throw new IntegrationError('Invalid message ID for IMAP');
      }

      return new Promise((resolve, reject) => {
        this.imap.addFlags(uid, '\\Seen', (error) => {
          if (error) {
            reject(this.handleError(error, 'Failed to mark IMAP message as read'));
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      this.handleError(error, 'Failed to mark IMAP message as read');
    }
  }

  public async deleteMessage(messageId: string): Promise<void> {
    try {
      const uid = parseInt(messageId);
      if (isNaN(uid)) {
        throw new IntegrationError('Invalid message ID for IMAP');
      }

      return new Promise((resolve, reject) => {
        this.imap.addFlags(uid, '\\Deleted', (error) => {
          if (error) {
            reject(this.handleError(error, 'Failed to delete IMAP message'));
          } else {
            this.imap.expunge((expungeError) => {
              if (expungeError) {
                reject(this.handleError(expungeError, 'Failed to expunge IMAP message'));
              } else {
                resolve();
              }
            });
          }
        });
      });
    } catch (error) {
      this.handleError(error, 'Failed to delete IMAP message');
    }
  }

  // Sync operation
  public async sync(lastSyncAt?: Date): Promise<SyncResult> {
    try {
      const messages = await this.fetchMessages({
        limit: this.config.maxResults || 100,
        since: lastSyncAt,
      });

      return {
        messages,
        hasMore: messages.length === (this.config.maxResults || 100),
      };
    } catch (error) {
      this.handleError(error, 'IMAP sync failed');
    }
  }

  // Helper methods
  private parseImapMessage(parsed: ParsedMail, attrs: any): Message {
    return {
      id: attrs.uid.toString(),
      from: {
        email: parsed.from?.value[0]?.address || '',
        name: parsed.from?.value[0]?.name,
      },
      to: parsed.to ? (Array.isArray(parsed.to) ? parsed.to.map((addr: any) => ({
        email: addr.address || '',
        name: addr.name,
      })) : [{
        email: (parsed.to as any).address || '',
        name: (parsed.to as any).name,
      }]) : [],
      cc: parsed.cc ? (Array.isArray(parsed.cc) ? parsed.cc.map((addr: any) => ({
        email: addr.address || '',
        name: addr.name,
      })) : [{
        email: (parsed.cc as any).address || '',
        name: (parsed.cc as any).name,
      }]) : undefined,
      subject: parsed.subject || '',
      body: {
        text: parsed.text,
        html: typeof parsed.html === 'string' ? parsed.html : undefined,
      },
      date: parsed.date || new Date(),
      isRead: attrs.flags.includes('\\Seen'),
      attachments: parsed.attachments?.map(att => ({
        filename: att.filename || 'attachment',
        contentType: att.contentType,
        size: att.size || 0,
        contentId: att.cid,
      })),
      metadata: {
        uid: attrs.uid,
        flags: attrs.flags,
        size: attrs.size,
      },
    };
  }

  // Configuration validation
  protected async validateConfig(config: any): Promise<void> {
    if (!config.host) {
      throw new IntegrationError('IMAP host is required');
    }
    if (!config.port) {
      throw new IntegrationError('IMAP port is required');
    }
    
    this.imapConfig = config;
  }
}

export default ImapConnector;
