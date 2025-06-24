/**
 * Workflow Service
 * Core business logic for workflow management
 */

import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from './database';
import { logger } from '@/utils/logger';
import { 
  Workflow, 
  WorkflowStatus, 
  WorkflowTrigger, 
  WorkflowStep,
  WorkflowVariable,
  WorkflowSettings,
  WorkflowStatistics
} from '@universal-ai-cs/shared';

export interface CreateWorkflowData {
  organizationId: string;
  name: string;
  description?: string;
  triggers: WorkflowTrigger[];
  steps: WorkflowStep[];
  variables?: WorkflowVariable[];
  settings?: WorkflowSettings;
  tags?: string[];
  createdBy: string;
  status: WorkflowStatus;
}

export interface UpdateWorkflowData {
  name?: string;
  description?: string;
  status?: WorkflowStatus;
  triggers?: WorkflowTrigger[];
  steps?: WorkflowStep[];
  variables?: WorkflowVariable[];
  settings?: WorkflowSettings;
  tags?: string[];
}

export interface WorkflowFilters {
  status?: WorkflowStatus;
  tags?: string[];
  search?: string;
}

export interface WorkflowPagination {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface WorkflowListResult {
  workflows: Workflow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class WorkflowService {
  /**
   * Get workflows for organization with filtering and pagination
   */
  static async getWorkflows(
    organizationId: string,
    filters: WorkflowFilters = {},
    pagination: WorkflowPagination
  ): Promise<WorkflowListResult> {
    const db = DatabaseService.getClient();
    
    let query = `
      SELECT 
        w.*,
        u.email as created_by_email,
        u.name as created_by_name
      FROM workflows w
      LEFT JOIN users u ON w.created_by = u.id
      WHERE w.organization_id = $1
    `;
    
    const params: any[] = [organizationId];
    let paramIndex = 2;

    // Apply filters
    if (filters.status) {
      query += ` AND w.status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.tags && filters.tags.length > 0) {
      query += ` AND w.tags && $${paramIndex}`;
      params.push(filters.tags);
      paramIndex++;
    }

    if (filters.search) {
      query += ` AND (w.name ILIKE $${paramIndex} OR w.description ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    // Count total records
    const countQuery = query.replace(
      'SELECT w.*, u.email as created_by_email, u.name as created_by_name',
      'SELECT COUNT(*)'
    );
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    // Apply sorting and pagination
    query += ` ORDER BY w.${pagination.sortBy} ${pagination.sortOrder.toUpperCase()}`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(pagination.limit, (pagination.page - 1) * pagination.limit);

    const result = await db.query(query, params);
    
    const workflows = result.rows.map(row => this.mapRowToWorkflow(row));
    const totalPages = Math.ceil(total / pagination.limit);

    return {
      workflows,
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages,
    };
  }

  /**
   * Get workflow by ID
   */
  static async getWorkflowById(id: string, organizationId: string): Promise<Workflow | null> {
    const db = DatabaseService.getClient();
    
    const query = `
      SELECT 
        w.*,
        u.email as created_by_email,
        u.name as created_by_name
      FROM workflows w
      LEFT JOIN users u ON w.created_by = u.id
      WHERE w.id = $1 AND w.organization_id = $2
    `;
    
    const result = await db.query(query, [id, organizationId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToWorkflow(result.rows[0]);
  }

  /**
   * Create new workflow
   */
  static async createWorkflow(data: CreateWorkflowData): Promise<Workflow> {
    const db = DatabaseService.getClient();
    const id = uuidv4();
    
    const query = `
      INSERT INTO workflows (
        id, organization_id, name, description, version, status,
        triggers, steps, variables, settings, tags, statistics,
        created_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()
      ) RETURNING *
    `;
    
    const statistics: WorkflowStatistics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      lastExecutionStatus: null,
    };

    const params = [
      id,
      data.organizationId,
      data.name,
      data.description || null,
      1, // version
      data.status,
      JSON.stringify(data.triggers),
      JSON.stringify(data.steps),
      JSON.stringify(data.variables || []),
      JSON.stringify(data.settings || {}),
      data.tags || [],
      JSON.stringify(statistics),
      data.createdBy,
    ];

    const result = await db.query(query, params);
    
    logger.info('Workflow created in database', {
      workflowId: id,
      organizationId: data.organizationId,
      name: data.name,
    });

    return this.mapRowToWorkflow(result.rows[0]);
  }

  /**
   * Update workflow
   */
  static async updateWorkflow(
    id: string,
    organizationId: string,
    updates: UpdateWorkflowData
  ): Promise<Workflow | null> {
    const db = DatabaseService.getClient();
    
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Build dynamic update query
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        if (['triggers', 'steps', 'variables', 'settings'].includes(key)) {
          updateFields.push(`${key} = $${paramIndex}`);
          params.push(JSON.stringify(value));
        } else {
          updateFields.push(`${key} = $${paramIndex}`);
          params.push(value);
        }
        paramIndex++;
      }
    });

    if (updateFields.length === 0) {
      // No updates to apply
      return this.getWorkflowById(id, organizationId);
    }

    updateFields.push(`updated_at = NOW()`);
    
    const query = `
      UPDATE workflows 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
      RETURNING *
    `;
    
    params.push(id, organizationId);

    const result = await db.query(query, params);
    
    if (result.rows.length === 0) {
      return null;
    }

    logger.info('Workflow updated in database', {
      workflowId: id,
      organizationId,
      updates: Object.keys(updates),
    });

    return this.mapRowToWorkflow(result.rows[0]);
  }

  /**
   * Delete workflow
   */
  static async deleteWorkflow(id: string, organizationId: string): Promise<boolean> {
    const db = DatabaseService.getClient();
    
    const query = `
      DELETE FROM workflows 
      WHERE id = $1 AND organization_id = $2
    `;
    
    const result = await db.query(query, [id, organizationId]);
    
    const deleted = result.rowCount > 0;
    
    if (deleted) {
      logger.info('Workflow deleted from database', {
        workflowId: id,
        organizationId,
      });
    }

    return deleted;
  }

  /**
   * Activate workflow
   */
  static async activateWorkflow(id: string, organizationId: string): Promise<Workflow | null> {
    return this.updateWorkflow(id, organizationId, { status: WorkflowStatus.ACTIVE });
  }

  /**
   * Deactivate workflow
   */
  static async deactivateWorkflow(id: string, organizationId: string): Promise<Workflow | null> {
    return this.updateWorkflow(id, organizationId, { status: WorkflowStatus.INACTIVE });
  }

  /**
   * Get workflows by trigger type
   */
  static async getWorkflowsByTrigger(
    organizationId: string,
    triggerType: string
  ): Promise<Workflow[]> {
    const db = DatabaseService.getClient();
    
    const query = `
      SELECT * FROM workflows 
      WHERE organization_id = $1 
      AND status = 'active'
      AND triggers::text LIKE $2
    `;
    
    const result = await db.query(query, [organizationId, `%"type":"${triggerType}"%`]);
    
    return result.rows.map(row => this.mapRowToWorkflow(row));
  }

  /**
   * Update workflow statistics
   */
  static async updateWorkflowStatistics(
    id: string,
    organizationId: string,
    statistics: Partial<WorkflowStatistics>
  ): Promise<void> {
    const db = DatabaseService.getClient();
    
    const query = `
      UPDATE workflows 
      SET 
        statistics = statistics::jsonb || $1::jsonb,
        last_executed_at = NOW(),
        updated_at = NOW()
      WHERE id = $2 AND organization_id = $3
    `;
    
    await db.query(query, [JSON.stringify(statistics), id, organizationId]);
  }

  /**
   * Map database row to Workflow object
   */
  private static mapRowToWorkflow(row: any): Workflow {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      version: row.version,
      status: row.status,
      triggers: JSON.parse(row.triggers || '[]'),
      steps: JSON.parse(row.steps || '[]'),
      variables: JSON.parse(row.variables || '[]'),
      settings: JSON.parse(row.settings || '{}'),
      tags: row.tags || [],
      statistics: JSON.parse(row.statistics || '{}'),
      lastExecutedAt: row.last_executed_at,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
