/**
 * Advanced Analytics Dashboard
 * Comprehensive real-time analytics and reporting interface
 */

import React, { useState, useEffect } from 'react';
import {
  ChartBarIcon,
  ClockIcon,
  ChatBubbleLeftRightIcon,
  StarIcon,
  CpuChipIcon,
  UsersIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

import { DashboardHeader } from '@/components/analytics/DashboardHeader';
import { MetricCard } from '@/components/analytics/MetricCard';
import { MessageVolumeChart } from '@/components/analytics/MessageVolumeChart';
import { ResponseTimeChart } from '@/components/analytics/ResponseTimeChart';
import { SatisfactionChart } from '@/components/analytics/SatisfactionChart';
import { AIAccuracyChart } from '@/components/analytics/AIAccuracyChart';
import { ConversationFlowChart } from '@/components/analytics/ConversationFlowChart';
import { TopicTrendsChart } from '@/components/analytics/TopicTrendsChart';
import { IntegrationHealthPanel } from '@/components/analytics/IntegrationHealthPanel';
import { ROICalculator } from '@/components/analytics/ROICalculator';
import { PerformanceComparison } from '@/components/analytics/PerformanceComparison';
import { RealtimeMetrics } from '@/components/analytics/RealtimeMetrics';

import { useAnalyticsStore } from '@/store/analyticsStore';
import { useToast } from '@/hooks/useToast';

export const AnalyticsDashboard: React.FC = () => {
  const [timeRange, setTimeRange] = useState('24h');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([
    'overview',
    'messageVolume',
    'responseTime',
    'satisfaction',
    'aiAccuracy',
  ]);

  const {
    overview,
    realtimeMetrics,
    messageVolume,
    responseTime,
    satisfaction,
    aiAccuracy,
    conversationFlow,
    topicTrends,
    integrationHealth,
    roi,
    performanceComparison,
    isLoading,
    error,
    loadDashboardData,
    loadRealtimeMetrics,
  } = useAnalyticsStore();

  const { toast } = useToast();

  // Load initial data
  useEffect(() => {
    loadDashboardData(timeRange);
    loadRealtimeMetrics();

    // Set up real-time updates
    const interval = setInterval(() => {
      loadRealtimeMetrics();
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [timeRange, loadDashboardData, loadRealtimeMetrics]);

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadDashboardData(timeRange);
      await loadRealtimeMetrics();
      toast.success('Dashboard refreshed');
    } catch (error) {
      toast.error('Failed to refresh dashboard');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle time range change
  const handleTimeRangeChange = (newTimeRange: string) => {
    setTimeRange(newTimeRange);
  };

  // Handle metric selection
  const toggleMetric = (metricId: string) => {
    setSelectedMetrics(prev =>
      prev.includes(metricId)
        ? prev.filter(id => id !== metricId)
        : [...prev, metricId]
    );
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">Failed to load dashboard</div>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <DashboardHeader
        timeRange={timeRange}
        onTimeRangeChange={handleTimeRangeChange}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        selectedMetrics={selectedMetrics}
        onToggleMetric={toggleMetric}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Real-time Metrics Bar */}
        <RealtimeMetrics data={realtimeMetrics} isLoading={isLoading} />

        {/* Overview Metrics */}
        {selectedMetrics.includes('overview') && overview && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <MetricCard
              title="Total Messages"
              value={overview.totalMessages.toLocaleString()}
              trend={overview.trends.messages}
              icon={ChatBubbleLeftRightIcon}
              color="blue"
            />
            <MetricCard
              title="Avg Response Time"
              value={`${Math.round(overview.averageResponseTime)}ms`}
              trend={overview.trends.responseTime}
              icon={ClockIcon}
              color="green"
              invertTrend
            />
            <MetricCard
              title="Customer Satisfaction"
              value={`${(overview.customerSatisfactionScore * 20).toFixed(1)}%`}
              trend={overview.trends.satisfaction}
              icon={StarIcon}
              color="yellow"
            />
            <MetricCard
              title="AI Accuracy"
              value={`${(overview.aiAccuracy * 100).toFixed(1)}%`}
              trend={0} // AI accuracy trend would need separate calculation
              icon={CpuChipIcon}
              color="purple"
            />
          </div>
        )}

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Message Volume */}
          {selectedMetrics.includes('messageVolume') && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Message Volume</h3>
                <ChartBarIcon className="h-5 w-5 text-gray-400" />
              </div>
              <MessageVolumeChart data={messageVolume} isLoading={isLoading} />
            </div>
          )}

          {/* Response Time */}
          {selectedMetrics.includes('responseTime') && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Response Time</h3>
                <ClockIcon className="h-5 w-5 text-gray-400" />
              </div>
              <ResponseTimeChart data={responseTime} isLoading={isLoading} />
            </div>
          )}

          {/* Customer Satisfaction */}
          {selectedMetrics.includes('satisfaction') && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Customer Satisfaction</h3>
                <StarIcon className="h-5 w-5 text-gray-400" />
              </div>
              <SatisfactionChart data={satisfaction} isLoading={isLoading} />
            </div>
          )}

          {/* AI Accuracy */}
          {selectedMetrics.includes('aiAccuracy') && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">AI Accuracy</h3>
                <CpuChipIcon className="h-5 w-5 text-gray-400" />
              </div>
              <AIAccuracyChart data={aiAccuracy} isLoading={isLoading} />
            </div>
          )}
        </div>

        {/* Advanced Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Conversation Flow */}
          {selectedMetrics.includes('conversationFlow') && (
            <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Conversation Flow</h3>
                <ArrowPathIcon className="h-5 w-5 text-gray-400" />
              </div>
              <ConversationFlowChart data={conversationFlow} isLoading={isLoading} />
            </div>
          )}

          {/* Integration Health */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Integration Health</h3>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm text-gray-600">All Systems Operational</span>
              </div>
            </div>
            <IntegrationHealthPanel data={integrationHealth} isLoading={isLoading} />
          </div>
        </div>

        {/* Topic Trends */}
        {selectedMetrics.includes('topicTrends') && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Topic Trends</h3>
              <TrendingUpIcon className="h-5 w-5 text-gray-400" />
            </div>
            <TopicTrendsChart data={topicTrends} isLoading={isLoading} />
          </div>
        )}

        {/* Performance & ROI */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Performance Comparison */}
          {selectedMetrics.includes('performance') && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Team vs AI Performance</h3>
                <UsersIcon className="h-5 w-5 text-gray-400" />
              </div>
              <PerformanceComparison data={performanceComparison} isLoading={isLoading} />
            </div>
          )}

          {/* ROI Calculator */}
          {selectedMetrics.includes('roi') && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">ROI Analysis</h3>
                <TrendingUpIcon className="h-5 w-5 text-gray-400" />
              </div>
              <ROICalculator data={roi} isLoading={isLoading} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
