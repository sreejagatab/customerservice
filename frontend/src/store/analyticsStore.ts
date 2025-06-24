/**
 * Analytics Store
 * Zustand store for analytics dashboard state management
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { analyticsApi } from '@/services/api/analytics';

interface AnalyticsState {
  // Dashboard data
  overview: any;
  realtimeMetrics: any;
  messageVolume: any[];
  responseTime: any;
  satisfaction: any;
  aiAccuracy: any;
  conversationFlow: any;
  topicTrends: any;
  integrationHealth: any;
  roi: any;
  performanceComparison: any;
  costAnalysis: any;
  
  // Loading states
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadDashboardData: (timeRange: string) => Promise<void>;
  loadRealtimeMetrics: () => Promise<void>;
  exportDashboardData: (options: any) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const initialState = {
  overview: null,
  realtimeMetrics: null,
  messageVolume: [],
  responseTime: null,
  satisfaction: null,
  aiAccuracy: null,
  conversationFlow: null,
  topicTrends: null,
  integrationHealth: null,
  roi: null,
  performanceComparison: null,
  costAnalysis: null,
  isLoading: false,
  error: null,
};

export const useAnalyticsStore = create<AnalyticsState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Load all dashboard data
      loadDashboardData: async (timeRange: string) => {
        set({ isLoading: true, error: null });
        
        try {
          const [
            overview,
            messageVolume,
            responseTime,
            satisfaction,
            aiAccuracy,
            conversationFlow,
            topicTrends,
            integrationHealth,
            roi,
            performanceComparison,
            costAnalysis,
          ] = await Promise.all([
            analyticsApi.getOverview(timeRange),
            analyticsApi.getMessageVolume(timeRange),
            analyticsApi.getResponseTime(timeRange),
            analyticsApi.getSatisfaction(timeRange),
            analyticsApi.getAiAccuracy(timeRange),
            analyticsApi.getConversationFlow(timeRange),
            analyticsApi.getTopicTrends(timeRange),
            analyticsApi.getIntegrationHealth(),
            analyticsApi.getROI(timeRange),
            analyticsApi.getPerformanceComparison(timeRange),
            analyticsApi.getCostAnalysis(timeRange),
          ]);

          set({
            overview,
            messageVolume,
            responseTime,
            satisfaction,
            aiAccuracy,
            conversationFlow,
            topicTrends,
            integrationHealth,
            roi,
            performanceComparison,
            costAnalysis,
            isLoading: false,
          });
        } catch (error: any) {
          set({
            error: error.message || 'Failed to load dashboard data',
            isLoading: false,
          });
        }
      },

      // Load real-time metrics
      loadRealtimeMetrics: async () => {
        try {
          const realtimeMetrics = await analyticsApi.getRealtimeMetrics();
          set({ realtimeMetrics });
        } catch (error: any) {
          console.error('Failed to load real-time metrics:', error);
        }
      },

      // Export dashboard data
      exportDashboardData: async (options: any) => {
        try {
          await analyticsApi.exportDashboard(options);
        } catch (error: any) {
          set({ error: error.message || 'Failed to export dashboard data' });
          throw error;
        }
      },

      // Clear error
      clearError: () => {
        set({ error: null });
      },

      // Reset store
      reset: () => {
        set(initialState);
      },
    }),
    {
      name: 'analytics-store',
    }
  )
);
