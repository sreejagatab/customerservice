/**
 * Message Repository
 * Handles database operations for messages and conversations
 */

import { PoolClient } from 'pg';
import { db } from '@/services/database';
import { logger, logDatabaseQuery } from '@/utils/logger';
import { DatabaseError, NotFoundError } from '@/utils/errors';

export interface MessageEntity {
  id: string;
  conversationId: string;
  externalId?: string;
  direction: 'inbound' | 'outbound';
  content: {
    text: string;
    html?: string;
    format: 'text' | 'html' | 'markdown';
    language?: string;
    encoding?: string;
  };
  sender: {
    email?: string;
    name?: string;
    phone?: string;
    userId?: string;
    type: 'customer' | 'agent' | 'system' | 'ai';
  };
  recipient?: {
    email?: string;
    name?: string;
    phone?: string;
    userId?: string;
  };
  status: 'received' | 'processing' | 'processed' | 'sent' | 'delivered' | 'read' | 'failed' | 'spam';
  aiClassification?: any;
  aiResponse?: any;
  attachments: any[];
  metadata: Record<string, any>;
  processedAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationEntity {
  id: string;
  organizationId: string;
  integrationId: string;
  externalId?: string;
  customerEmail: string;
  customerName?: string;
  customerPhone?: string;
  subject?: string;
  status: 'open' | 'in_progress' | 'waiting_for_customer' | 'waiting_for_agent' | 'resolved' | 'closed' | 'spam';
  priority: 'low' | 'normal' | 'high' | 'urgent' | 'critical';
  assignedTo?: string;
  tags: string[];
  metadata: Record<string, any>;
  aiSummary?: string;
  sentiment?: any;
  lastMessageAt: Date;
  responseTime?: number;
  resolutionTime?: number;
  satisfactionRating?: number;
  satisfactionFeedback?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageFilters {
  conversationId?: string;
  direction?: 'inbound' | 'outbound';
  status?: string;
  startDate?: Date;
  endDate?: Date;
  organizationId?: string;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class MessageRepository {
  private static instance: MessageRepository;

  private constructor() {}

  public static getInstance(): MessageRepository {
    if (!MessageRepository.instance) {
      MessageRepository.instance = new MessageRepository();
    }
    return MessageRepository.instance;
  }

  // Message operations
  public async createMessage(message: Omit<MessageEntity, 'id' | 'createdAt' | 'updatedAt'>, client?: PoolClient): Promise<MessageEntity> {
    const query = `
      INSERT INTO messages (
        conversation_id, external_id, direction, content, sender, recipient,
        status, ai_classification, ai_response, attachments, metadata,
        processed_at, delivered_at, read_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const values = [
      message.conversationId,
      message.externalId,
      message.direction,
      JSON.stringify(message.content),
      JSON.stringify(message.sender),
      message.recipient ? JSON.stringify(message.recipient) : null,
      message.status,
      message.aiClassification ? JSON.stringify(message.aiClassification) : null,
      message.aiResponse ? JSON.stringify(message.aiResponse) : null,
      JSON.stringify(message.attachments),
      JSON.stringify(message.metadata),
      message.processedAt,
      message.deliveredAt,
      message.readAt,
    ];

    try {
      const result = await db.query<MessageEntity>(query, values, client);
      
      if (result.rows.length === 0) {
        throw new DatabaseError('Failed to create message');
      }

      const createdMessage = this.mapRowToMessage(result.rows[0]);
      
      // Update conversation last_message_at
      await this.updateConversationLastMessage(message.conversationId, client);
      
      logger.info('Message created', { messageId: createdMessage.id });
      
      return createdMessage;
    } catch (error) {
      logger.error('Error creating message', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  public async getMessageById(id: string, client?: PoolClient): Promise<MessageEntity | null> {
    const query = 'SELECT * FROM messages WHERE id = $1';
    
    try {
      const result = await db.query<any>(query, [id], client);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToMessage(result.rows[0]);
    } catch (error) {
      logger.error('Error getting message by ID', {
        messageId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  public async updateMessage(id: string, updates: Partial<MessageEntity>, client?: PoolClient): Promise<MessageEntity> {
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build dynamic update query
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id' && key !== 'createdAt') {
        const dbColumn = this.mapFieldToColumn(key);
        if (dbColumn) {
          updateFields.push(`${dbColumn} = $${paramIndex}`);
          
          // Handle JSON fields
          if (['content', 'sender', 'recipient', 'aiClassification', 'aiResponse', 'attachments', 'metadata'].includes(key)) {
            values.push(JSON.stringify(value));
          } else {
            values.push(value);
          }
          paramIndex++;
        }
      }
    });

    if (updateFields.length === 0) {
      throw new DatabaseError('No valid fields to update');
    }

    updateFields.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE messages 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    try {
      const result = await db.query<any>(query, values, client);
      
      if (result.rows.length === 0) {
        throw new NotFoundError('Message', id);
      }
      
      return this.mapRowToMessage(result.rows[0]);
    } catch (error) {
      logger.error('Error updating message', {
        messageId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  public async deleteMessage(id: string, client?: PoolClient): Promise<boolean> {
    const query = 'DELETE FROM messages WHERE id = $1';
    
    try {
      const result = await db.query(query, [id], client);
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      logger.error('Error deleting message', {
        messageId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  public async getMessages(filters: MessageFilters, pagination: PaginationOptions, client?: PoolClient): Promise<PaginatedResult<MessageEntity>> {
    const whereConditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build WHERE clause
    if (filters.conversationId) {
      whereConditions.push(`conversation_id = $${paramIndex}`);
      values.push(filters.conversationId);
      paramIndex++;
    }

    if (filters.direction) {
      whereConditions.push(`direction = $${paramIndex}`);
      values.push(filters.direction);
      paramIndex++;
    }

    if (filters.status) {
      whereConditions.push(`status = $${paramIndex}`);
      values.push(filters.status);
      paramIndex++;
    }

    if (filters.startDate) {
      whereConditions.push(`created_at >= $${paramIndex}`);
      values.push(filters.startDate);
      paramIndex++;
    }

    if (filters.endDate) {
      whereConditions.push(`created_at <= $${paramIndex}`);
      values.push(filters.endDate);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM messages ${whereClause}`;
    const countResult = await db.query<{ total: string }>(countQuery, values, client);
    const total = parseInt(countResult.rows[0]?.total || '0');

    // Data query with pagination
    const offset = (pagination.page - 1) * pagination.limit;
    const orderBy = pagination.orderBy || 'created_at';
    const orderDirection = pagination.orderDirection || 'DESC';

    const dataQuery = `
      SELECT * FROM messages 
      ${whereClause}
      ORDER BY ${orderBy} ${orderDirection}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    values.push(pagination.limit, offset);

    try {
      const result = await db.query<any>(dataQuery, values, client);
      const messages = result.rows.map(row => this.mapRowToMessage(row));

      return {
        data: messages,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: Math.ceil(total / pagination.limit),
        },
      };
    } catch (error) {
      logger.error('Error getting messages', {
        filters,
        pagination,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  public async searchMessages(query: string, filters: MessageFilters, pagination: PaginationOptions, client?: PoolClient): Promise<PaginatedResult<MessageEntity>> {
    const whereConditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Full-text search condition
    whereConditions.push(`(content->>'text' ILIKE $${paramIndex} OR content->>'html' ILIKE $${paramIndex})`);
    values.push(`%${query}%`);
    paramIndex++;

    // Add filters
    if (filters.conversationId) {
      whereConditions.push(`conversation_id = $${paramIndex}`);
      values.push(filters.conversationId);
      paramIndex++;
    }

    if (filters.direction) {
      whereConditions.push(`direction = $${paramIndex}`);
      values.push(filters.direction);
      paramIndex++;
    }

    if (filters.status) {
      whereConditions.push(`status = $${paramIndex}`);
      values.push(filters.status);
      paramIndex++;
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
    
    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM messages ${whereClause}`;
    const countResult = await db.query<{ total: string }>(countQuery, values, client);
    const total = parseInt(countResult.rows[0]?.total || '0');

    // Data query with pagination
    const offset = (pagination.page - 1) * pagination.limit;
    const dataQuery = `
      SELECT * FROM messages 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    values.push(pagination.limit, offset);

    try {
      const result = await db.query<any>(dataQuery, values, client);
      const messages = result.rows.map(row => this.mapRowToMessage(row));

      return {
        data: messages,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: Math.ceil(total / pagination.limit),
        },
      };
    } catch (error) {
      logger.error('Error searching messages', {
        query,
        filters,
        pagination,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // Conversation operations
  public async getConversationById(id: string, client?: PoolClient): Promise<ConversationEntity | null> {
    const query = 'SELECT * FROM conversations WHERE id = $1';
    
    try {
      const result = await db.query<any>(query, [id], client);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToConversation(result.rows[0]);
    } catch (error) {
      logger.error('Error getting conversation by ID', {
        conversationId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async updateConversationLastMessage(conversationId: string, client?: PoolClient): Promise<void> {
    const query = `
      UPDATE conversations 
      SET last_message_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `;
    
    try {
      await db.query(query, [conversationId], client);
    } catch (error) {
      logger.error('Error updating conversation last message time', {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw here as it's not critical
    }
  }

  // Helper methods
  private mapRowToMessage(row: any): MessageEntity {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      externalId: row.external_id,
      direction: row.direction,
      content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
      sender: typeof row.sender === 'string' ? JSON.parse(row.sender) : row.sender,
      recipient: row.recipient ? (typeof row.recipient === 'string' ? JSON.parse(row.recipient) : row.recipient) : undefined,
      status: row.status,
      aiClassification: row.ai_classification ? (typeof row.ai_classification === 'string' ? JSON.parse(row.ai_classification) : row.ai_classification) : undefined,
      aiResponse: row.ai_response ? (typeof row.ai_response === 'string' ? JSON.parse(row.ai_response) : row.ai_response) : undefined,
      attachments: typeof row.attachments === 'string' ? JSON.parse(row.attachments) : row.attachments,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      processedAt: row.processed_at,
      deliveredAt: row.delivered_at,
      readAt: row.read_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapRowToConversation(row: any): ConversationEntity {
    return {
      id: row.id,
      organizationId: row.organization_id,
      integrationId: row.integration_id,
      externalId: row.external_id,
      customerEmail: row.customer_email,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      subject: row.subject,
      status: row.status,
      priority: row.priority,
      assignedTo: row.assigned_to,
      tags: row.tags || [],
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      aiSummary: row.ai_summary,
      sentiment: row.sentiment ? (typeof row.sentiment === 'string' ? JSON.parse(row.sentiment) : row.sentiment) : undefined,
      lastMessageAt: row.last_message_at,
      responseTime: row.response_time,
      resolutionTime: row.resolution_time,
      satisfactionRating: row.satisfaction_rating,
      satisfactionFeedback: row.satisfaction_feedback,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapFieldToColumn(field: string): string | null {
    const fieldMap: Record<string, string> = {
      conversationId: 'conversation_id',
      externalId: 'external_id',
      direction: 'direction',
      content: 'content',
      sender: 'sender',
      recipient: 'recipient',
      status: 'status',
      aiClassification: 'ai_classification',
      aiResponse: 'ai_response',
      attachments: 'attachments',
      metadata: 'metadata',
      processedAt: 'processed_at',
      deliveredAt: 'delivered_at',
      readAt: 'read_at',
    };

    return fieldMap[field] || null;
  }
}

// Export singleton instance
export const messageRepository = MessageRepository.getInstance();
