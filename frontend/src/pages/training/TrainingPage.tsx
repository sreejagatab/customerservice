import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input, Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui';

interface TrainingExample {
  id: string;
  input: string;
  expectedCategory: string;
  expectedIntent: string;
  expectedResponse: string;
  confidence: number;
  status: 'active' | 'pending' | 'archived';
  createdAt: string;
  updatedAt: string;
}

interface KnowledgeBaseEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  status: 'published' | 'draft' | 'archived';
  usage: number;
  lastUsed: string;
  createdAt: string;
}

export const TrainingPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('examples');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedExample, setSelectedExample] = useState<TrainingExample | null>(null);

  // Mock data - replace with real data from API
  const trainingExamples: TrainingExample[] = [
    {
      id: '1',
      input: 'Where is my order #12345?',
      expectedCategory: 'order_inquiry',
      expectedIntent: 'track_order',
      expectedResponse: 'Let me help you track your order #12345. I\'ll look up the current status and shipping information for you.',
      confidence: 0.95,
      status: 'active',
      createdAt: '2024-01-15',
      updatedAt: '2024-01-15',
    },
    {
      id: '2',
      input: 'I want to return this product',
      expectedCategory: 'return_request',
      expectedIntent: 'initiate_return',
      expectedResponse: 'I can help you start the return process. To begin, I\'ll need your order number and the reason for the return.',
      confidence: 0.92,
      status: 'active',
      createdAt: '2024-01-14',
      updatedAt: '2024-01-14',
    },
    {
      id: '3',
      input: 'How do I change my password?',
      expectedCategory: 'account_support',
      expectedIntent: 'change_password',
      expectedResponse: 'To change your password, go to Account Settings > Security > Change Password. You\'ll need to enter your current password and then your new password twice.',
      confidence: 0.98,
      status: 'active',
      createdAt: '2024-01-13',
      updatedAt: '2024-01-13',
    },
  ];

  const knowledgeBase: KnowledgeBaseEntry[] = [
    {
      id: '1',
      title: 'Order Tracking Process',
      content: 'When customers ask about order status, first verify the order number, then check our tracking system...',
      category: 'order_management',
      tags: ['orders', 'tracking', 'shipping'],
      status: 'published',
      usage: 247,
      lastUsed: '2 hours ago',
      createdAt: '2024-01-10',
    },
    {
      id: '2',
      title: 'Return Policy Guidelines',
      content: 'Our return policy allows returns within 30 days of purchase. Items must be in original condition...',
      category: 'returns',
      tags: ['returns', 'refunds', 'policy'],
      status: 'published',
      usage: 189,
      lastUsed: '1 hour ago',
      createdAt: '2024-01-08',
    },
    {
      id: '3',
      title: 'Password Reset Instructions',
      content: 'Step-by-step guide for helping customers reset their passwords...',
      category: 'account_support',
      tags: ['password', 'account', 'security'],
      status: 'published',
      usage: 156,
      lastUsed: '30 minutes ago',
      createdAt: '2024-01-05',
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
      case 'published':
        return <Badge variant="success">{status}</Badge>;
      case 'pending':
      case 'draft':
        return <Badge variant="warning">{status}</Badge>;
      case 'archived':
        return <Badge variant="default">{status}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const filteredExamples = trainingExamples.filter(example =>
    example.input.toLowerCase().includes(searchTerm.toLowerCase()) ||
    example.expectedCategory.toLowerCase().includes(searchTerm.toLowerCase()) ||
    example.expectedIntent.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredKnowledgeBase = knowledgeBase.filter(entry =>
    entry.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    entry.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
    entry.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const tabs = [
    { id: 'examples', name: 'Training Examples', icon: '📚', count: trainingExamples.length },
    { id: 'knowledge', name: 'Knowledge Base', icon: '🧠', count: knowledgeBase.length },
    { id: 'validation', name: 'Validation', icon: '✅', count: 0 },
    { id: 'analytics', name: 'Training Analytics', icon: '📊', count: 0 },
  ];

  const handleAddExample = () => {
    setShowAddModal(true);
  };

  const handleEditExample = (example: TrainingExample) => {
    setSelectedExample(example);
    setShowAddModal(true);
  };

  const handleSaveExample = () => {
    // TODO: Implement save example API call
    console.log('Saving example:', selectedExample);
    setShowAddModal(false);
    setSelectedExample(null);
  };

  const handleDeleteExample = (exampleId: string) => {
    // TODO: Implement delete example API call
    console.log('Deleting example:', exampleId);
  };

  const handleTrainModel = () => {
    // TODO: Implement model training API call
    console.log('Starting model training...');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            AI Training
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Train and improve your AI assistant with custom examples and knowledge
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline">
            <span className="mr-2">📤</span>
            Export Data
          </Button>
          <Button variant="outline">
            <span className="mr-2">📥</span>
            Import Data
          </Button>
          <Button onClick={handleTrainModel}>
            <span className="mr-2">🚀</span>
            Train Model
          </Button>
        </div>
      </div>

      {/* Training Status */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">94.2%</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Current Accuracy</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{trainingExamples.length}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Training Examples</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-600">{knowledgeBase.length}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Knowledge Articles</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600">2 days ago</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Last Training</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span>{tab.name}</span>
              {tab.count > 0 && (
                <Badge variant="default" size="sm">
                  {tab.count}
                </Badge>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-6">
          <Input
            placeholder="Search training data..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
          />
        </CardContent>
      </Card>

      {/* Content */}
      {activeTab === 'examples' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Training Examples ({filteredExamples.length})</CardTitle>
              <Button onClick={handleAddExample}>
                <span className="mr-2">➕</span>
                Add Example
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredExamples.map((example) => (
                <div
                  key={example.id}
                  className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <Badge variant="info" size="sm">{example.expectedCategory}</Badge>
                        <Badge variant="default" size="sm">{example.expectedIntent}</Badge>
                        {getStatusBadge(example.status)}
                        <span className="text-sm text-gray-500">
                          Confidence: {(example.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                      <p className="font-medium text-gray-900 dark:text-white mb-2">
                        Input: "{example.input}"
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Expected Response: {example.expectedResponse}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditExample(example)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteExample(example.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Created: {new Date(example.createdAt).toLocaleDateString()} • 
                    Updated: {new Date(example.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'knowledge' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Knowledge Base ({filteredKnowledgeBase.length})</CardTitle>
              <Button>
                <span className="mr-2">➕</span>
                Add Article
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredKnowledgeBase.map((entry) => (
                <div
                  key={entry.id}
                  className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {entry.title}
                        </h3>
                        {getStatusBadge(entry.status)}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {entry.content.substring(0, 150)}...
                      </p>
                      <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                        <span>Category: {entry.category}</span>
                        <span>Used: {entry.usage} times</span>
                        <span>Last used: {entry.lastUsed}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {entry.tags.map((tag) => (
                          <Badge key={tag} variant="default" size="sm">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                      <Button variant="danger" size="sm">
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'validation' && (
        <Card>
          <CardHeader>
            <CardTitle>Model Validation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12">
              <div className="text-6xl mb-4">✅</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Validation Results
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Run validation tests to check model accuracy and performance
              </p>
              <Button>
                Run Validation Tests
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'analytics' && (
        <Card>
          <CardHeader>
            <CardTitle>Training Analytics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📊</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Training Analytics
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                View detailed analytics about your AI training progress
              </p>
              <Button>
                View Analytics
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Example Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={selectedExample ? 'Edit Training Example' : 'Add Training Example'}
        size="lg"
      >
        <ModalBody>
          <div className="space-y-4">
            <Input
              label="Input Text"
              placeholder="Enter the customer input..."
              defaultValue={selectedExample?.input || ''}
            />
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Expected Category
                </label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 text-sm">
                  <option value="order_inquiry">Order Inquiry</option>
                  <option value="return_request">Return Request</option>
                  <option value="account_support">Account Support</option>
                  <option value="technical_support">Technical Support</option>
                  <option value="billing_inquiry">Billing Inquiry</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Expected Intent
                </label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 text-sm">
                  <option value="track_order">Track Order</option>
                  <option value="initiate_return">Initiate Return</option>
                  <option value="change_password">Change Password</option>
                  <option value="get_support">Get Support</option>
                  <option value="billing_question">Billing Question</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Expected Response
              </label>
              <textarea
                rows={4}
                placeholder="Enter the expected AI response..."
                defaultValue={selectedExample?.expectedResponse || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setShowAddModal(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveExample}>
            {selectedExample ? 'Update Example' : 'Add Example'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};
