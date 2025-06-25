/**
 * WebSocket Service for Real-time Message Sync
 * Provides real-time updates for message status changes and new messages
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { redis } from '@/services/redis';
import { MessageEntity } from '@/repositories/message.repository';

export interface WebSocketClient {
  id: string;
  organizationId: string;
  userId?: string;
  conversationIds: Set<string>;
  lastSeen: Date;
}

export interface MessageUpdate {
  type: 'message_created' | 'message_updated' | 'message_status_changed' | 'conversation_updated';
  messageId?: string;
  conversationId: string;
  organizationId: string;
  data: any;
  timestamp: Date;
}

export class WebSocketService {
  private static instance: WebSocketService;
  private io: SocketIOServer | null = null;
  private clients: Map<string, WebSocketClient> = new Map();
  private conversationSubscriptions: Map<string, Set<string>> = new Map(); // conversationId -> Set of socketIds

  private constructor() {}

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  public initialize(httpServer: HttpServer): void {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.security.corsOrigin === '*' ? true : config.security.corsOrigin.split(','),
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupEventHandlers();
    logger.info('WebSocket service initialized');
  }

  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      logger.info('WebSocket client connected', { socketId: socket.id });

      // Handle authentication
      socket.on('authenticate', async (data: { token: string; organizationId: string; userId?: string }) => {
        try {
          // Validate token (implement your auth logic here)
          const isValid = await this.validateToken(data.token, data.organizationId);
          
          if (isValid) {
            const client: WebSocketClient = {
              id: socket.id,
              organizationId: data.organizationId,
              userId: data.userId,
              conversationIds: new Set(),
              lastSeen: new Date(),
            };

            this.clients.set(socket.id, client);
            socket.join(`org:${data.organizationId}`);
            
            socket.emit('authenticated', { success: true });
            logger.info('WebSocket client authenticated', {
              socketId: socket.id,
              organizationId: data.organizationId,
              userId: data.userId,
            });
          } else {
            socket.emit('authentication_failed', { error: 'Invalid token' });
            socket.disconnect();
          }
        } catch (error) {
          logger.error('WebSocket authentication error', {
            socketId: socket.id,
            error: error instanceof Error ? error.message : String(error),
          });
          socket.emit('authentication_failed', { error: 'Authentication failed' });
          socket.disconnect();
        }
      });

      // Handle conversation subscription
      socket.on('subscribe_conversation', (data: { conversationId: string }) => {
        const client = this.clients.get(socket.id);
        if (!client) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        const { conversationId } = data;
        
        // Add to client's subscriptions
        client.conversationIds.add(conversationId);
        
        // Add to conversation subscriptions
        if (!this.conversationSubscriptions.has(conversationId)) {
          this.conversationSubscriptions.set(conversationId, new Set());
        }
        this.conversationSubscriptions.get(conversationId)!.add(socket.id);
        
        socket.join(`conversation:${conversationId}`);
        
        logger.info('Client subscribed to conversation', {
          socketId: socket.id,
          conversationId,
        });
      });

      // Handle conversation unsubscription
      socket.on('unsubscribe_conversation', (data: { conversationId: string }) => {
        const client = this.clients.get(socket.id);
        if (!client) return;

        const { conversationId } = data;
        
        // Remove from client's subscriptions
        client.conversationIds.delete(conversationId);
        
        // Remove from conversation subscriptions
        const subscribers = this.conversationSubscriptions.get(conversationId);
        if (subscribers) {
          subscribers.delete(socket.id);
          if (subscribers.size === 0) {
            this.conversationSubscriptions.delete(conversationId);
          }
        }
        
        socket.leave(`conversation:${conversationId}`);
        
        logger.info('Client unsubscribed from conversation', {
          socketId: socket.id,
          conversationId,
        });
      });

      // Handle heartbeat
      socket.on('heartbeat', () => {
        const client = this.clients.get(socket.id);
        if (client) {
          client.lastSeen = new Date();
        }
        socket.emit('heartbeat_ack');
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        logger.info('WebSocket client disconnected', {
          socketId: socket.id,
          reason,
        });

        const client = this.clients.get(socket.id);
        if (client) {
          // Clean up conversation subscriptions
          for (const conversationId of client.conversationIds) {
            const subscribers = this.conversationSubscriptions.get(conversationId);
            if (subscribers) {
              subscribers.delete(socket.id);
              if (subscribers.size === 0) {
                this.conversationSubscriptions.delete(conversationId);
              }
            }
          }
        }

        this.clients.delete(socket.id);
      });
    });

    // Clean up inactive clients periodically
    setInterval(() => {
      this.cleanupInactiveClients();
    }, 60000); // Every minute
  }

  /**
   * Broadcast message update to relevant clients
   */
  public async broadcastMessageUpdate(update: MessageUpdate): Promise<void> {
    if (!this.io) return;

    try {
      // Broadcast to organization room
      this.io.to(`org:${update.organizationId}`).emit('message_update', update);

      // Broadcast to specific conversation room
      this.io.to(`conversation:${update.conversationId}`).emit('message_update', update);

      // Cache the update for clients that might reconnect
      await this.cacheUpdate(update);

      logger.debug('Message update broadcasted', {
        type: update.type,
        conversationId: update.conversationId,
        organizationId: update.organizationId,
      });
    } catch (error) {
      logger.error('Error broadcasting message update', {
        error: error instanceof Error ? error.message : String(error),
        update,
      });
    }
  }

  /**
   * Send typing indicator
   */
  public sendTypingIndicator(conversationId: string, userId: string, isTyping: boolean): void {
    if (!this.io) return;

    this.io.to(`conversation:${conversationId}`).emit('typing_indicator', {
      conversationId,
      userId,
      isTyping,
      timestamp: new Date(),
    });
  }

  /**
   * Send presence update
   */
  public sendPresenceUpdate(organizationId: string, userId: string, status: 'online' | 'away' | 'offline'): void {
    if (!this.io) return;

    this.io.to(`org:${organizationId}`).emit('presence_update', {
      userId,
      status,
      timestamp: new Date(),
    });
  }

  /**
   * Get connected clients count
   */
  public getConnectedClientsCount(): number {
    return this.clients.size;
  }

  /**
   * Get clients for organization
   */
  public getOrganizationClients(organizationId: string): WebSocketClient[] {
    return Array.from(this.clients.values()).filter(client => client.organizationId === organizationId);
  }

  /**
   * Get clients subscribed to conversation
   */
  public getConversationClients(conversationId: string): string[] {
    return Array.from(this.conversationSubscriptions.get(conversationId) || []);
  }

  private async validateToken(token: string, organizationId: string): Promise<boolean> {
    try {
      // Implement your token validation logic here
      // This could involve calling your auth service or validating JWT
      
      // For now, return true for demo purposes
      // In production, you would validate the token properly
      return token.length > 0 && organizationId.length > 0;
    } catch (error) {
      logger.error('Token validation error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async cacheUpdate(update: MessageUpdate): Promise<void> {
    try {
      const cacheKey = `ws_update:${update.conversationId}:${Date.now()}`;
      await redis.set(cacheKey, update, { ttl: 3600 }); // Cache for 1 hour
    } catch (error) {
      logger.error('Error caching WebSocket update', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private cleanupInactiveClients(): void {
    const now = new Date();
    const inactiveThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [socketId, client] of this.clients.entries()) {
      if (now.getTime() - client.lastSeen.getTime() > inactiveThreshold) {
        logger.info('Cleaning up inactive WebSocket client', {
          socketId,
          lastSeen: client.lastSeen,
        });

        // Clean up subscriptions
        for (const conversationId of client.conversationIds) {
          const subscribers = this.conversationSubscriptions.get(conversationId);
          if (subscribers) {
            subscribers.delete(socketId);
            if (subscribers.size === 0) {
              this.conversationSubscriptions.delete(conversationId);
            }
          }
        }

        this.clients.delete(socketId);
      }
    }
  }

  public async close(): Promise<void> {
    if (this.io) {
      this.io.close();
      this.io = null;
      logger.info('WebSocket service closed');
    }
  }
}

// Export singleton instance
export const webSocketService = WebSocketService.getInstance();
