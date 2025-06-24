/**
 * Workflow Store
 * Zustand store for workflow state management
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { workflowApi } from '@/services/api/workflow';
import { 
  Workflow, 
  WorkflowStatus, 
  WorkflowExecution,
  WorkflowValidationResult 
} from '@universal-ai-cs/shared';

interface WorkflowState {
  // Current workflow being edited
  currentWorkflow: Workflow | null;
  
  // List of workflows
  workflows: Workflow[];
  
  // Workflow executions
  executions: WorkflowExecution[];
  
  // Loading states
  isLoading: boolean;
  isSaving: boolean;
  isValidating: boolean;
  isTesting: boolean;
  
  // Error states
  error: string | null;
  validationErrors: string[];
  
  // Pagination
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  
  // Filters
  filters: {
    status?: WorkflowStatus;
    tags?: string[];
    search?: string;
  };
  
  // Actions
  loadWorkflows: (filters?: any, pagination?: any) => Promise<void>;
  loadWorkflow: (id: string) => Promise<void>;
  createWorkflow: (data: Partial<Workflow>) => Promise<Workflow>;
  updateWorkflow: (id: string, data: Partial<Workflow>) => Promise<Workflow>;
  deleteWorkflow: (id: string) => Promise<void>;
  saveWorkflow: (workflow: Workflow) => Promise<void>;
  validateWorkflow: (workflow: Partial<Workflow>) => Promise<WorkflowValidationResult>;
  testWorkflow: (workflow: Workflow, testData?: any) => Promise<WorkflowExecution>;
  activateWorkflow: (id: string) => Promise<void>;
  deactivateWorkflow: (id: string) => Promise<void>;
  duplicateWorkflow: (id: string) => Promise<Workflow>;
  
  // Execution actions
  loadExecutions: (workflowId?: string) => Promise<void>;
  getExecution: (id: string) => Promise<WorkflowExecution>;
  cancelExecution: (id: string) => Promise<void>;
  
  // Utility actions
  setCurrentWorkflow: (workflow: Workflow | null) => void;
  setFilters: (filters: any) => void;
  setPagination: (pagination: any) => void;
  clearError: () => void;
  reset: () => void;
}

const initialState = {
  currentWorkflow: null,
  workflows: [],
  executions: [],
  isLoading: false,
  isSaving: false,
  isValidating: false,
  isTesting: false,
  error: null,
  validationErrors: [],
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
  filters: {},
};

export const useWorkflowStore = create<WorkflowState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Load workflows with filtering and pagination
      loadWorkflows: async (filters = {}, pagination = {}) => {
        set({ isLoading: true, error: null });
        
        try {
          const currentFilters = { ...get().filters, ...filters };
          const currentPagination = { ...get().pagination, ...pagination };
          
          const response = await workflowApi.getWorkflows({
            ...currentFilters,
            page: currentPagination.page,
            limit: currentPagination.limit,
          });
          
          set({
            workflows: response.data,
            pagination: response.pagination,
            filters: currentFilters,
            isLoading: false,
          });
        } catch (error: any) {
          set({
            error: error.message || 'Failed to load workflows',
            isLoading: false,
          });
        }
      },

      // Load single workflow
      loadWorkflow: async (id: string) => {
        set({ isLoading: true, error: null });
        
        try {
          const workflow = await workflowApi.getWorkflow(id);
          set({
            currentWorkflow: workflow,
            isLoading: false,
          });
        } catch (error: any) {
          set({
            error: error.message || 'Failed to load workflow',
            isLoading: false,
          });
        }
      },

      // Create new workflow
      createWorkflow: async (data: Partial<Workflow>) => {
        set({ isSaving: true, error: null });
        
        try {
          const workflow = await workflowApi.createWorkflow(data);
          
          set((state) => ({
            workflows: [workflow, ...state.workflows],
            currentWorkflow: workflow,
            isSaving: false,
          }));
          
          return workflow;
        } catch (error: any) {
          set({
            error: error.message || 'Failed to create workflow',
            isSaving: false,
          });
          throw error;
        }
      },

      // Update workflow
      updateWorkflow: async (id: string, data: Partial<Workflow>) => {
        set({ isSaving: true, error: null });
        
        try {
          const workflow = await workflowApi.updateWorkflow(id, data);
          
          set((state) => ({
            workflows: state.workflows.map(w => w.id === id ? workflow : w),
            currentWorkflow: state.currentWorkflow?.id === id ? workflow : state.currentWorkflow,
            isSaving: false,
          }));
          
          return workflow;
        } catch (error: any) {
          set({
            error: error.message || 'Failed to update workflow',
            isSaving: false,
          });
          throw error;
        }
      },

      // Delete workflow
      deleteWorkflow: async (id: string) => {
        set({ isLoading: true, error: null });
        
        try {
          await workflowApi.deleteWorkflow(id);
          
          set((state) => ({
            workflows: state.workflows.filter(w => w.id !== id),
            currentWorkflow: state.currentWorkflow?.id === id ? null : state.currentWorkflow,
            isLoading: false,
          }));
        } catch (error: any) {
          set({
            error: error.message || 'Failed to delete workflow',
            isLoading: false,
          });
          throw error;
        }
      },

      // Save current workflow
      saveWorkflow: async (workflow: Workflow) => {
        const { updateWorkflow, createWorkflow } = get();
        
        if (workflow.id) {
          await updateWorkflow(workflow.id, workflow);
        } else {
          await createWorkflow(workflow);
        }
      },

      // Validate workflow
      validateWorkflow: async (workflow: Partial<Workflow>) => {
        set({ isValidating: true, validationErrors: [], error: null });
        
        try {
          const result = await workflowApi.validateWorkflow(workflow);
          
          set({
            validationErrors: result.errors || [],
            isValidating: false,
          });
          
          return result;
        } catch (error: any) {
          set({
            error: error.message || 'Failed to validate workflow',
            isValidating: false,
          });
          throw error;
        }
      },

      // Test workflow
      testWorkflow: async (workflow: Workflow, testData = {}) => {
        set({ isTesting: true, error: null });
        
        try {
          const execution = await workflowApi.testWorkflow(workflow.id, testData);
          
          set((state) => ({
            executions: [execution, ...state.executions],
            isTesting: false,
          }));
          
          return execution;
        } catch (error: any) {
          set({
            error: error.message || 'Failed to test workflow',
            isTesting: false,
          });
          throw error;
        }
      },

      // Activate workflow
      activateWorkflow: async (id: string) => {
        try {
          const workflow = await workflowApi.activateWorkflow(id);
          
          set((state) => ({
            workflows: state.workflows.map(w => w.id === id ? workflow : w),
            currentWorkflow: state.currentWorkflow?.id === id ? workflow : state.currentWorkflow,
          }));
        } catch (error: any) {
          set({ error: error.message || 'Failed to activate workflow' });
          throw error;
        }
      },

      // Deactivate workflow
      deactivateWorkflow: async (id: string) => {
        try {
          const workflow = await workflowApi.deactivateWorkflow(id);
          
          set((state) => ({
            workflows: state.workflows.map(w => w.id === id ? workflow : w),
            currentWorkflow: state.currentWorkflow?.id === id ? workflow : state.currentWorkflow,
          }));
        } catch (error: any) {
          set({ error: error.message || 'Failed to deactivate workflow' });
          throw error;
        }
      },

      // Duplicate workflow
      duplicateWorkflow: async (id: string) => {
        const { createWorkflow } = get();
        
        try {
          const original = await workflowApi.getWorkflow(id);
          const duplicate = await createWorkflow({
            ...original,
            name: `${original.name} (Copy)`,
            status: WorkflowStatus.DRAFT,
          });
          
          return duplicate;
        } catch (error: any) {
          set({ error: error.message || 'Failed to duplicate workflow' });
          throw error;
        }
      },

      // Load executions
      loadExecutions: async (workflowId?: string) => {
        set({ isLoading: true, error: null });
        
        try {
          const executions = await workflowApi.getExecutions(workflowId);
          set({
            executions,
            isLoading: false,
          });
        } catch (error: any) {
          set({
            error: error.message || 'Failed to load executions',
            isLoading: false,
          });
        }
      },

      // Get single execution
      getExecution: async (id: string) => {
        try {
          return await workflowApi.getExecution(id);
        } catch (error: any) {
          set({ error: error.message || 'Failed to load execution' });
          throw error;
        }
      },

      // Cancel execution
      cancelExecution: async (id: string) => {
        try {
          await workflowApi.cancelExecution(id);
          
          set((state) => ({
            executions: state.executions.map(e => 
              e.id === id ? { ...e, status: 'cancelled' } : e
            ),
          }));
        } catch (error: any) {
          set({ error: error.message || 'Failed to cancel execution' });
          throw error;
        }
      },

      // Utility actions
      setCurrentWorkflow: (workflow: Workflow | null) => {
        set({ currentWorkflow: workflow });
      },

      setFilters: (filters: any) => {
        set({ filters });
      },

      setPagination: (pagination: any) => {
        set((state) => ({
          pagination: { ...state.pagination, ...pagination },
        }));
      },

      clearError: () => {
        set({ error: null, validationErrors: [] });
      },

      reset: () => {
        set(initialState);
      },
    }),
    {
      name: 'workflow-store',
    }
  )
);
