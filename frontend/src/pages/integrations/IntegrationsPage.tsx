import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input, Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui';

interface Integration {
  id: string;
  name: string;
  type: 'email' | 'chat' | 'ecommerce' | 'crm' | 'social';
  description: string;
  status: 'connected' | 'disconnected' | 'error' | 'configuring';
  icon: string;
  isPopular?: boolean;
  messageCount?: number;
  lastSync?: string;
  config?: Record<string, any>;
}

export const IntegrationsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Mock data - replace with real data from API
  const integrations: Integration[] = [
    {
      id: '1',
      name: 'Gmail',
      type: 'email',
      description: 'Connect your Gmail account to receive and send emails',
      status: 'connected',
      icon: '📧',
      isPopular: true,
      messageCount: 1247,
      lastSync: '2 minutes ago',
    },
    {
      id: '2',
      name: 'Outlook',
      type: 'email',
      description: 'Microsoft Outlook and Office 365 integration',
      status: 'connected',
      icon: '📮',
      isPopular: true,
      messageCount: 892,
      lastSync: '5 minutes ago',
    },
    {
      id: '3',
      name: 'WhatsApp Business',
      type: 'chat',
      description: 'WhatsApp Business API for customer messaging',
      status: 'connected',
      icon: '💬',
      isPopular: true,
      messageCount: 456,
      lastSync: '1 minute ago',
    },
    {
      id: '4',
      name: 'Shopify',
      type: 'ecommerce',
      description: 'Connect your Shopify store for order-related inquiries',
      status: 'connected',
      icon: '🛒',
      messageCount: 234,
      lastSync: '10 minutes ago',
    },
    {
      id: '5',
      name: 'Salesforce',
      type: 'crm',
      description: 'Salesforce CRM integration for customer data',
      status: 'error',
      icon: '☁️',
      messageCount: 0,
      lastSync: 'Failed',
    },
    {
      id: '6',
      name: 'Slack',
      type: 'chat',
      description: 'Internal team communication and notifications',
      status: 'connected',
      icon: '💼',
      messageCount: 89,
      lastSync: '30 minutes ago',
    },
    {
      id: '7',
      name: 'Facebook Messenger',
      type: 'social',
      description: 'Facebook Messenger for social media customer service',
      status: 'disconnected',
      icon: '📘',
      isPopular: true,
    },
    {
      id: '8',
      name: 'HubSpot',
      type: 'crm',
      description: 'HubSpot CRM and marketing automation',
      status: 'disconnected',
      icon: '🧡',
    },
    {
      id: '9',
      name: 'Zendesk',
      type: 'email',
      description: 'Zendesk ticketing system integration',
      status: 'disconnected',
      icon: '🎫',
    },
    {
      id: '10',
      name: 'Custom SMTP',
      type: 'email',
      description: 'Generic SMTP/IMAP email server connection',
      status: 'disconnected',
      icon: '📨',
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return <Badge variant="success">Connected</Badge>;
      case 'disconnected':
        return <Badge variant="default">Not Connected</Badge>;
      case 'error':
        return <Badge variant="danger">Error</Badge>;
      case 'configuring':
        return <Badge variant="warning">Configuring</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'email': return '📧';
      case 'chat': return '💬';
      case 'ecommerce': return '🛒';
      case 'crm': return '👥';
      case 'social': return '📱';
      default: return '🔌';
    }
  };

  const filteredIntegrations = integrations.filter((integration) => {
    const matchesSearch = integration.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         integration.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || integration.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const connectedCount = integrations.filter(i => i.status === 'connected').length;
  const totalMessages = integrations.reduce((sum, i) => sum + (i.messageCount || 0), 0);

  const handleConnect = (integration: Integration) => {
    setSelectedIntegration(integration);
    setShowConfigModal(true);
  };

  const handleDisconnect = async (integrationId: string) => {
    // TODO: Implement disconnect API call
    console.log('Disconnecting integration:', integrationId);
  };

  const handleConfigure = async () => {
    // TODO: Implement configuration API call
    console.log('Configuring integration:', selectedIntegration);
    setShowConfigModal(false);
    setSelectedIntegration(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Integrations
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Connect your favorite platforms and automate your customer service
          </p>
        </div>
        <Button>
          <span className="mr-2">➕</span>
          Add Custom Integration
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Connected Integrations
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {connectedCount}
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
                  Total Messages
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {totalMessages.toLocaleString()}
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
                  Available Integrations
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {integrations.length}
                </p>
              </div>
              <div className="text-3xl">📦</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search integrations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                leftIcon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                }
              />
            </div>
            <div className="flex gap-4">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 text-sm"
              >
                <option value="all">All Types</option>
                <option value="email">Email</option>
                <option value="chat">Chat</option>
                <option value="ecommerce">E-commerce</option>
                <option value="crm">CRM</option>
                <option value="social">Social</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Popular Integrations */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Popular Integrations
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredIntegrations
            .filter(i => i.isPopular)
            .map((integration) => (
              <Card key={integration.id} className="relative">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="text-3xl">{integration.icon}</div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {integration.name}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                          {integration.type}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(integration.status)}
                  </div>
                  
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {integration.description}
                  </p>

                  {integration.status === 'connected' && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                      <p>{integration.messageCount?.toLocaleString()} messages</p>
                      <p>Last sync: {integration.lastSync}</p>
                    </div>
                  )}

                  <div className="flex space-x-2">
                    {integration.status === 'connected' ? (
                      <>
                        <Button variant="outline" size="sm" className="flex-1">
                          Configure
                        </Button>
                        <Button 
                          variant="danger" 
                          size="sm"
                          onClick={() => handleDisconnect(integration.id)}
                        >
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button 
                        className="flex-1"
                        onClick={() => handleConnect(integration)}
                      >
                        Connect
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      </div>

      {/* All Integrations */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          All Integrations ({filteredIntegrations.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredIntegrations
            .filter(i => !i.isPopular)
            .map((integration) => (
              <Card key={integration.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="text-3xl">{integration.icon}</div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {integration.name}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                          {integration.type}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(integration.status)}
                  </div>
                  
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {integration.description}
                  </p>

                  {integration.status === 'connected' && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                      <p>{integration.messageCount?.toLocaleString()} messages</p>
                      <p>Last sync: {integration.lastSync}</p>
                    </div>
                  )}

                  <div className="flex space-x-2">
                    {integration.status === 'connected' ? (
                      <>
                        <Button variant="outline" size="sm" className="flex-1">
                          Configure
                        </Button>
                        <Button 
                          variant="danger" 
                          size="sm"
                          onClick={() => handleDisconnect(integration.id)}
                        >
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button 
                        className="flex-1"
                        onClick={() => handleConnect(integration)}
                      >
                        Connect
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      </div>

      {/* Configuration Modal */}
      <Modal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        title={`Connect ${selectedIntegration?.name}`}
        size="lg"
      >
        <ModalBody>
          {selectedIntegration && (
            <div className="space-y-4">
              <div className="flex items-center space-x-3 mb-4">
                <div className="text-4xl">{selectedIntegration.icon}</div>
                <div>
                  <h3 className="text-lg font-semibold">{selectedIntegration.name}</h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {selectedIntegration.description}
                  </p>
                </div>
              </div>

              {selectedIntegration.type === 'email' && (
                <div className="space-y-4">
                  <Input label="Email Address" type="email" placeholder="your-email@example.com" />
                  <Input label="Password" type="password" placeholder="Your password or app password" />
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      💡 For Gmail, you'll need to use an App Password instead of your regular password.
                      <a href="#" className="underline ml-1">Learn how to create one</a>
                    </p>
                  </div>
                </div>
              )}

              {selectedIntegration.type === 'chat' && (
                <div className="space-y-4">
                  <Input label="API Token" type="password" placeholder="Your API token" />
                  <Input label="Webhook URL" type="url" placeholder="https://your-webhook-url.com" />
                </div>
              )}

              {selectedIntegration.type === 'ecommerce' && (
                <div className="space-y-4">
                  <Input label="Store URL" type="url" placeholder="https://your-store.myshopify.com" />
                  <Input label="API Key" type="password" placeholder="Your API key" />
                  <Input label="API Secret" type="password" placeholder="Your API secret" />
                </div>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setShowConfigModal(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfigure}>
            Connect Integration
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};
