import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';

export const AnalyticsPage: React.FC = () => {
  const [timeRange, setTimeRange] = useState('7d');

  // Mock data - replace with real data from API
  const metrics = {
    totalMessages: 12847,
    responseTime: 2.3,
    aiAccuracy: 94.2,
    customerSatisfaction: 4.6,
    resolutionRate: 87.5,
    escalationRate: 12.5,
  };

  const messageVolumeData = [
    { date: '2024-01-15', messages: 145, resolved: 127 },
    { date: '2024-01-16', messages: 189, resolved: 165 },
    { date: '2024-01-17', messages: 234, resolved: 201 },
    { date: '2024-01-18', messages: 198, resolved: 178 },
    { date: '2024-01-19', messages: 267, resolved: 234 },
    { date: '2024-01-20', messages: 156, resolved: 142 },
    { date: '2024-01-21', messages: 178, resolved: 159 },
  ];

  const topIssues = [
    { category: 'Order Issues', count: 1247, percentage: 32.1 },
    { category: 'Product Questions', count: 892, percentage: 23.0 },
    { category: 'Billing Inquiries', count: 567, percentage: 14.6 },
    { category: 'Technical Support', count: 445, percentage: 11.5 },
    { category: 'Returns & Refunds', count: 334, percentage: 8.6 },
    { category: 'Other', count: 398, percentage: 10.2 },
  ];

  const integrationStats = [
    { name: 'Gmail', messages: 4567, accuracy: 96.2, avgResponse: 1.8 },
    { name: 'WhatsApp', messages: 3234, accuracy: 94.8, avgResponse: 0.9 },
    { name: 'Outlook', messages: 2891, accuracy: 93.1, avgResponse: 2.1 },
    { name: 'Shopify', messages: 1456, accuracy: 91.7, avgResponse: 3.2 },
    { name: 'Slack', messages: 699, accuracy: 97.3, avgResponse: 0.5 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Analytics
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Track performance and gain insights into your customer service
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 text-sm"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Total Messages
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {metrics.totalMessages.toLocaleString()}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  +12% from last period
                </p>
              </div>
              <div className="text-3xl">💬</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Avg Response Time
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {metrics.responseTime}s
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  -0.5s improvement
                </p>
              </div>
              <div className="text-3xl">⚡</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  AI Accuracy
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {metrics.aiAccuracy}%
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  +2.1% this month
                </p>
              </div>
              <div className="text-3xl">🎯</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Customer Satisfaction
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {metrics.customerSatisfaction}/5
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  +0.3 improvement
                </p>
              </div>
              <div className="text-3xl">⭐</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Resolution Rate
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {metrics.resolutionRate}%
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  +5.2% this month
                </p>
              </div>
              <div className="text-3xl">✅</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Escalation Rate
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {metrics.escalationRate}%
                </p>
                <p className="text-xs text-red-600 dark:text-red-400">
                  +1.1% this month
                </p>
              </div>
              <div className="text-3xl">🚨</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Message Volume Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Message Volume Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-end justify-between space-x-2">
              {messageVolumeData.map((day, index) => (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-t relative" style={{ height: '200px' }}>
                    <div
                      className="bg-blue-500 rounded-t absolute bottom-0 w-full"
                      style={{ height: `${(day.messages / 300) * 100}%` }}
                    />
                    <div
                      className="bg-green-500 rounded-t absolute bottom-0 w-full"
                      style={{ height: `${(day.resolved / 300) * 100}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-2 text-center">
                    {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center space-x-4 mt-4">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-blue-500 rounded"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Total Messages</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Resolved</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Issues */}
        <Card>
          <CardHeader>
            <CardTitle>Top Issue Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topIssues.map((issue, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {issue.category}
                      </span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {issue.count} ({issue.percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${issue.percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Integration Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Integration Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">
                    Integration
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">
                    Messages
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">
                    AI Accuracy
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">
                    Avg Response Time
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {integrationStats.map((integration, index) => (
                  <tr key={index} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="text-lg">
                          {integration.name === 'Gmail' && '📧'}
                          {integration.name === 'WhatsApp' && '💬'}
                          {integration.name === 'Outlook' && '📮'}
                          {integration.name === 'Shopify' && '🛒'}
                          {integration.name === 'Slack' && '💼'}
                        </div>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {integration.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                      {integration.messages.toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-gray-900 dark:text-white">
                          {integration.accuracy}%
                        </span>
                        {integration.accuracy >= 95 && <Badge variant="success" size="sm">Excellent</Badge>}
                        {integration.accuracy >= 90 && integration.accuracy < 95 && <Badge variant="info" size="sm">Good</Badge>}
                        {integration.accuracy < 90 && <Badge variant="warning" size="sm">Needs Improvement</Badge>}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                      {integration.avgResponse}s
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="success">Connected</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
