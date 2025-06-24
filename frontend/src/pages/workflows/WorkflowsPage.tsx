import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input, Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui';

interface Workflow {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'draft';
  trigger: string;
  actions: number;
  messagesProcessed: number;
  successRate: number;
  lastRun: string;
  createdAt: string;
}

export const WorkflowsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');

  // Mock data - replace with real data from API
  const workflows: Workflow[] = [
    {
      id: '1',
      name: 'Order Status Inquiries',
      description: 'Automatically respond to order status questions with tracking information',
      status: 'active',
      trigger: 'Message contains "order status" or "tracking"',
      actions: 3,
      messagesProcessed: 1247,
      successRate: 94.2,
      lastRun: '2 minutes ago',
      createdAt: '2024-01-10',
    },
    {
      id: '2',
      name: 'Product Return Process',
      description: 'Guide customers through the return process and create return labels',
      status: 'active',
      trigger: 'Message contains "return" or "refund"',
      actions: 5,
      messagesProcessed: 567,
      successRate: 89.1,
      lastRun: '15 minutes ago',
      createdAt: '2024-01-08',
    },
    {
      id: '3',
      name: 'Technical Support Escalation',
      description: 'Escalate complex technical issues to the engineering team',
      status: 'active',
      trigger: 'Message classified as "technical" with high complexity',
      actions: 2,
      messagesProcessed: 234,
      successRate: 96.8,
      lastRun: '1 hour ago',
      createdAt: '2024-01-05',
    },
    {
      id: '4',
      name: 'Billing Inquiry Handler',
      description: 'Provide billing information and payment assistance',
      status: 'inactive',
      trigger: 'Message contains "billing" or "payment"',
      actions: 4,
      messagesProcessed: 0,
      successRate: 0,
      lastRun: 'Never',
      createdAt: '2024-01-12',
    },
    {
      id: '5',
      name: 'Welcome New Customers',
      description: 'Send welcome message and onboarding information to new customers',
      status: 'draft',
      trigger: 'New customer registration',
      actions: 1,
      messagesProcessed: 0,
      successRate: 0,
      lastRun: 'Never',
      createdAt: '2024-01-15',
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Active</Badge>;
      case 'inactive':
        return <Badge variant="default">Inactive</Badge>;
      case 'draft':
        return <Badge variant="warning">Draft</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const filteredWorkflows = workflows.filter((workflow) => {
    const matchesSearch = workflow.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         workflow.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || workflow.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: workflows.length,
    active: workflows.filter(w => w.status === 'active').length,
    totalProcessed: workflows.reduce((sum, w) => sum + w.messagesProcessed, 0),
    avgSuccessRate: workflows.filter(w => w.messagesProcessed > 0).reduce((sum, w) => sum + w.successRate, 0) / workflows.filter(w => w.messagesProcessed > 0).length || 0,
  };

  const handleCreateWorkflow = () => {
    if (!newWorkflowName.trim()) return;
    
    // TODO: Implement create workflow API call
    console.log('Creating workflow:', newWorkflowName);
    setShowCreateModal(false);
    setNewWorkflowName('');
  };

  const handleToggleStatus = (workflowId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    // TODO: Implement toggle status API call
    console.log('Toggling workflow status:', workflowId, newStatus);
  };

  const handleDeleteWorkflow = (workflowId: string) => {
    // TODO: Implement delete workflow API call
    console.log('Deleting workflow:', workflowId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Workflows
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Automate your customer service with intelligent workflows
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline">
            <span className="mr-2">📋</span>
            Templates
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            <span className="mr-2">➕</span>
            Create Workflow
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Total Workflows
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.total}
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
                  Active Workflows
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.active}
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
                  Messages Processed
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.totalProcessed.toLocaleString()}
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
                  Avg Success Rate
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.avgSuccessRate.toFixed(1)}%
                </p>
              </div>
              <div className="text-3xl">🎯</div>
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
                placeholder="Search workflows..."
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
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 text-sm"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workflows List */}
      <div className="grid grid-cols-1 gap-6">
        {filteredWorkflows.map((workflow) => (
          <Card key={workflow.id}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {workflow.name}
                    </h3>
                    {getStatusBadge(workflow.status)}
                  </div>
                  
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    {workflow.description}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Trigger</p>
                      <p className="text-sm text-gray-900 dark:text-white">{workflow.trigger}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Actions</p>
                      <p className="text-sm text-gray-900 dark:text-white">{workflow.actions} steps</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Messages Processed</p>
                      <p className="text-sm text-gray-900 dark:text-white">{workflow.messagesProcessed.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Success Rate</p>
                      <p className="text-sm text-gray-900 dark:text-white">{workflow.successRate}%</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                    <span>Last run: {workflow.lastRun}</span>
                    <span>•</span>
                    <span>Created: {new Date(workflow.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  <Link to={`/workflows/${workflow.id}/edit`}>
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  </Link>
                  <Button
                    variant={workflow.status === 'active' ? 'outline' : 'default'}
                    size="sm"
                    onClick={() => handleToggleStatus(workflow.id, workflow.status)}
                  >
                    {workflow.status === 'active' ? 'Pause' : 'Activate'}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeleteWorkflow(workflow.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredWorkflows.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-6xl mb-4">⚡</div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No workflows found
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Create your first workflow to automate customer service responses
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              Create Your First Workflow
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create Workflow Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Workflow"
      >
        <ModalBody>
          <div className="space-y-4">
            <Input
              label="Workflow Name"
              placeholder="Enter workflow name..."
              value={newWorkflowName}
              onChange={(e) => setNewWorkflowName(e.target.value)}
            />
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Choose a template
              </label>
              <div className="grid grid-cols-1 gap-3">
                <div className="p-3 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                  <h4 className="font-medium text-gray-900 dark:text-white">Order Status Automation</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Automatically respond to order status inquiries</p>
                </div>
                <div className="p-3 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                  <h4 className="font-medium text-gray-900 dark:text-white">Return Process</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Guide customers through returns and refunds</p>
                </div>
                <div className="p-3 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                  <h4 className="font-medium text-gray-900 dark:text-white">Custom Workflow</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Start from scratch with a blank workflow</p>
                </div>
              </div>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setShowCreateModal(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateWorkflow}>
            Create Workflow
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};
