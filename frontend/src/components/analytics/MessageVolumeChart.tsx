/**
 * Message Volume Chart Component
 * Displays message and conversation volume trends over time
 */

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  ComposedChart,
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface MessageVolumeData {
  timestamp: string;
  messages: number;
  conversations: number;
}

interface MessageVolumeChartProps {
  data: MessageVolumeData[];
  isLoading?: boolean;
  height?: number;
  showConversations?: boolean;
  chartType?: 'line' | 'bar' | 'composed';
}

export const MessageVolumeChart: React.FC<MessageVolumeChartProps> = ({
  data = [],
  isLoading = false,
  height = 300,
  showConversations = true,
  chartType = 'composed',
}) => {
  // Format data for chart
  const chartData = data.map(item => ({
    ...item,
    timestamp: format(parseISO(item.timestamp), 'MMM dd HH:mm'),
    date: parseISO(item.timestamp),
  }));

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="text-sm font-medium text-gray-900 mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center space-x-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm text-gray-600">{entry.dataKey}:</span>
              <span className="text-sm font-medium text-gray-900">
                {entry.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="w-full" style={{ height }}>
        <div className="animate-pulse bg-gray-200 rounded h-full flex items-center justify-center">
          <div className="text-gray-400">Loading chart...</div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!data || data.length === 0) {
    return (
      <div className="w-full flex items-center justify-center" style={{ height }}>
        <div className="text-center">
          <div className="text-gray-400 text-lg mb-2">No data available</div>
          <div className="text-gray-500 text-sm">
            Message volume data will appear here once you start receiving messages
          </div>
        </div>
      </div>
    );
  }

  // Render different chart types
  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 5, right: 30, left: 20, bottom: 5 },
    };

    switch (chartType) {
      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="timestamp"
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={{ stroke: '#e5e7eb' }}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="messages"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2 }}
              name="Messages"
            />
            {showConversations && (
              <Line
                type="monotone"
                dataKey="conversations"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#10b981', strokeWidth: 2 }}
                name="Conversations"
              />
            )}
          </LineChart>
        );

      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="timestamp"
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={{ stroke: '#e5e7eb' }}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="messages" fill="#3b82f6" name="Messages" radius={[2, 2, 0, 0]} />
            {showConversations && (
              <Bar dataKey="conversations" fill="#10b981" name="Conversations" radius={[2, 2, 0, 0]} />
            )}
          </BarChart>
        );

      case 'composed':
      default:
        return (
          <ComposedChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="timestamp"
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={{ stroke: '#e5e7eb' }}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="messages" fill="#3b82f6" name="Messages" radius={[2, 2, 0, 0]} />
            {showConversations && (
              <Line
                type="monotone"
                dataKey="conversations"
                stroke="#10b981"
                strokeWidth={3}
                dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#10b981', strokeWidth: 2 }}
                name="Conversations"
              />
            )}
          </ComposedChart>
        );
    }
  };

  return (
    <div className="w-full">
      {/* Chart Stats */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full" />
            <span className="text-sm text-gray-600">
              Total Messages: {data.reduce((sum, item) => sum + item.messages, 0).toLocaleString()}
            </span>
          </div>
          {showConversations && (
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded-full" />
              <span className="text-sm text-gray-600">
                Total Conversations: {data.reduce((sum, item) => sum + item.conversations, 0).toLocaleString()}
              </span>
            </div>
          )}
        </div>
        
        {/* Peak indicator */}
        {data.length > 0 && (
          <div className="text-sm text-gray-500">
            Peak: {Math.max(...data.map(d => d.messages)).toLocaleString()} messages
          </div>
        )}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
};
