/**
 * Workflow API Service
 * API client for workflow operations
 */

import { apiClient } from './client';
import { 
  Workflow, 
  WorkflowExecution, 
  WorkflowValidationResult,
  WorkflowStatus 
} from '@universal-ai-cs/shared';

export interface WorkflowListParams {
  page?: number;
  limit?: number;
  status?: WorkflowStatus;
  tags?: string[];
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface WorkflowListResponse {
  data: Workflow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ExecutionListParams {
  workflowId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

class WorkflowApiService {
  private baseUrl = '/api/v1/workflows';

  /**
   * Get list of workflows
   */
  async getWorkflows(params: WorkflowListParams = {}): Promise<WorkflowListResponse> {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          searchParams.append(key, value.join(','));
        } else {
          searchParams.append(key, value.toString());
        }
      }
    });

    const response = await apiClient.get(`${this.baseUrl}?${searchParams.toString()}`);
    return response.data;
  }

  /**
   * Get single workflow by ID
   */
  async getWorkflow(id: string): Promise<Workflow> {
    const response = await apiClient.get(`${this.baseUrl}/${id}`);
    return response.data.data;
  }

  /**
   * Create new workflow
   */
  async createWorkflow(data: Partial<Workflow>): Promise<Workflow> {
    const response = await apiClient.post(this.baseUrl, data);
    return response.data.data;
  }

  /**
   * Update workflow
   */
  async updateWorkflow(id: string, data: Partial<Workflow>): Promise<Workflow> {
    const response = await apiClient.put(`${this.baseUrl}/${id}`, data);
    return response.data.data;
  }

  /**
   * Delete workflow
   */
  async deleteWorkflow(id: string): Promise<void> {
    await apiClient.delete(`${this.baseUrl}/${id}`);
  }

  /**
   * Activate workflow
   */
  async activateWorkflow(id: string): Promise<Workflow> {
    const response = await apiClient.post(`${this.baseUrl}/${id}/activate`);
    return response.data.data;
  }

  /**
   * Deactivate workflow
   */
  async deactivateWorkflow(id: string): Promise<Workflow> {
    const response = await apiClient.post(`${this.baseUrl}/${id}/deactivate`);
    return response.data.data;
  }

  /**
   * Validate workflow
   */
  async validateWorkflow(workflow: Partial<Workflow>): Promise<WorkflowValidationResult> {
    const response = await apiClient.post(`${this.baseUrl}/validate`, workflow);
    return response.data.data;
  }

  /**
   * Test workflow
   */
  async testWorkflow(id: string, testData: any = {}): Promise<WorkflowExecution> {
    const response = await apiClient.post(`${this.baseUrl}/${id}/test`, testData);
    return response.data.data;
  }

  /**
   * Get workflow executions
   */
  async getExecutions(workflowId?: string): Promise<WorkflowExecution[]> {
    const params = new URLSearchParams();
    if (workflowId) {
      params.append('workflowId', workflowId);
    }

    const response = await apiClient.get(`/api/v1/executions?${params.toString()}`);
    return response.data.data;
  }

  /**
   * Get single execution
   */
  async getExecution(id: string): Promise<WorkflowExecution> {
    const response = await apiClient.get(`/api/v1/executions/${id}`);
    return response.data.data;
  }

  /**
   * Cancel execution
   */
  async cancelExecution(id: string): Promise<void> {
    await apiClient.post(`/api/v1/executions/${id}/cancel`);
  }

  /**
   * Get workflow templates
   */
  async getTemplates(): Promise<Workflow[]> {
    const response = await apiClient.get('/api/v1/templates');
    return response.data.data;
  }

  /**
   * Create workflow from template
   */
  async createFromTemplate(templateId: string, data: Partial<Workflow>): Promise<Workflow> {
    const response = await apiClient.post(`/api/v1/templates/${templateId}/create`, data);
    return response.data.data;
  }

  /**
   * Export workflow
   */
  async exportWorkflow(id: string, format: 'json' | 'yaml' = 'json'): Promise<Blob> {
    const response = await apiClient.get(`${this.baseUrl}/${id}/export`, {
      params: { format },
      responseType: 'blob',
    });
    return response.data;
  }

  /**
   * Import workflow
   */
  async importWorkflow(file: File): Promise<Workflow> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post(`${this.baseUrl}/import`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data;
  }

  /**
   * Get workflow statistics
   */
  async getWorkflowStats(id: string, timeRange: string = '7d'): Promise<any> {
    const response = await apiClient.get(`${this.baseUrl}/${id}/stats`, {
      params: { timeRange },
    });
    return response.data.data;
  }

  /**
   * Get workflow logs
   */
  async getWorkflowLogs(
    id: string, 
    params: { 
      page?: number; 
      limit?: number; 
      level?: string; 
      startDate?: string; 
      endDate?: string; 
    } = {}
  ): Promise<any> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, value.toString());
      }
    });

    const response = await apiClient.get(
      `${this.baseUrl}/${id}/logs?${searchParams.toString()}`
    );
    return response.data.data;
  }

  /**
   * Clone workflow
   */
  async cloneWorkflow(id: string, name?: string): Promise<Workflow> {
    const response = await apiClient.post(`${this.baseUrl}/${id}/clone`, {
      name: name || `Copy of Workflow`,
    });
    return response.data.data;
  }

  /**
   * Get workflow versions
   */
  async getWorkflowVersions(id: string): Promise<Workflow[]> {
    const response = await apiClient.get(`${this.baseUrl}/${id}/versions`);
    return response.data.data;
  }

  /**
   * Restore workflow version
   */
  async restoreWorkflowVersion(id: string, version: number): Promise<Workflow> {
    const response = await apiClient.post(`${this.baseUrl}/${id}/versions/${version}/restore`);
    return response.data.data;
  }

  /**
   * Get workflow performance metrics
   */
  async getPerformanceMetrics(
    id: string, 
    timeRange: string = '24h'
  ): Promise<{
    executionCount: number;
    successRate: number;
    averageExecutionTime: number;
    errorRate: number;
    throughput: number;
  }> {
    const response = await apiClient.get(`${this.baseUrl}/${id}/metrics`, {
      params: { timeRange },
    });
    return response.data.data;
  }
}

export const workflowApi = new WorkflowApiService();
