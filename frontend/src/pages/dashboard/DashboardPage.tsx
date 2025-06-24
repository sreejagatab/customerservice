import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';

export const DashboardPage: React.FC = () => {
  // Mock data - replace with real data from API
  const stats = {
    totalMessages: 1247,
    activeIntegrations: 8,
    responseTime: '2.3s',
    aiAccuracy: '94%',
    messagesThisWeek: 342,
    messagesGrowth: '+12%',
    integrationsGrowth: '+2',
    responseTimeChange: '-0.5s',
    accuracyChange: '+2%',
  };

  const recentMessages = [
    {
      id: '1',
      sender: 'john@example.com',
      subject: 'Order status inquiry',
      status: 'resolved',
      timestamp: '2 minutes ago',
      integration: 'Gmail',
    },
    {
      id: '2',
      sender: 'sarah@company.com',
      subject: 'Product question',
      status: 'pending',
      timestamp: '5 minutes ago',
      integration: 'Outlook',
    },
    {
      id: '3',
      sender: 'mike@business.com',
      subject: 'Billing issue',
      status: 'in_progress',
      timestamp: '12 minutes ago',
      integration: 'WhatsApp',
    },
  ];

  const integrations = [
    { name: 'Gmail', status: 'connected', messages: 456 },
    { name: 'Outlook', status: 'connected', messages: 234 },
    { name: 'WhatsApp', status: 'connected', messages: 189 },
    { name: 'Shopify', status: 'connected', messages: 123 },
    { name: 'Salesforce', status: 'error', messages: 0 },
    { name: 'Slack', status: 'connected', messages: 67 },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
        return <Badge variant="success">Resolved</Badge>;
      case 'pending':
        return <Badge variant="warning">Pending</Badge>;
      case 'in_progress':
        return <Badge variant="info">In Progress</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getIntegrationStatus = (status: string) => {
    switch (status) {
      case 'connected':
        return <Badge variant="success">Connected</Badge>;
      case 'error':
        return <Badge variant="danger">Error</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Welcome back! Here's what's happening with your customer service.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Total Messages
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.totalMessages.toLocaleString()}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  {stats.messagesGrowth} from last week
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
                  Active Integrations
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.activeIntegrations}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  {stats.integrationsGrowth} new this month
                </p>
              </div>
              <div className="text-3xl">🔌</div>
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
                  {stats.responseTime}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  {stats.responseTimeChange} improvement
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
                  {stats.aiAccuracy}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  {stats.accuracyChange} this month
                </p>
              </div>
              <div className="text-3xl">🎯</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Messages */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Messages</CardTitle>
              <Link
                to="/conversations"
                className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400"
              >
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentMessages.map((message) => (
                <div
                  key={message.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {message.subject}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      From: {message.sender} • {message.integration}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {message.timestamp}
                    </p>
                  </div>
                  <div className="ml-4">
                    {getStatusBadge(message.status)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Integration Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Integration Status</CardTitle>
              <Link
                to="/integrations"
                className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400"
              >
                Manage
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {integrations.map((integration) => (
                <div
                  key={integration.name}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <div className="text-lg">
                      {integration.name === 'Gmail' && '📧'}
                      {integration.name === 'Outlook' && '📮'}
                      {integration.name === 'WhatsApp' && '💬'}
                      {integration.name === 'Shopify' && '🛒'}
                      {integration.name === 'Salesforce' && '☁️'}
                      {integration.name === 'Slack' && '💼'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {integration.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {integration.messages} messages
                      </p>
                    </div>
                  </div>
                  <div>
                    {getIntegrationStatus(integration.status)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link
              to="/integrations"
              className="flex items-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
            >
              <div className="text-2xl mr-3">🔌</div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  Add Integration
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Connect new platforms
                </p>
              </div>
            </Link>

            <Link
              to="/workflows"
              className="flex items-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            >
              <div className="text-2xl mr-3">⚡</div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  Create Workflow
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Automate responses
                </p>
              </div>
            </Link>

            <Link
              to="/analytics"
              className="flex items-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
            >
              <div className="text-2xl mr-3">📊</div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  View Analytics
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Track performance
                </p>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
