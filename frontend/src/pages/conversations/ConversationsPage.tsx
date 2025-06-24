import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input } from '@/components/ui';

interface Conversation {
  id: string;
  subject: string;
  sender: string;
  senderEmail: string;
  status: 'open' | 'resolved' | 'pending' | 'escalated';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  integration: string;
  lastMessage: string;
  lastActivity: string;
  messageCount: number;
  assignedTo?: string;
}

export const ConversationsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Mock data - replace with real data from API
  const conversations: Conversation[] = [
    {
      id: '1',
      subject: 'Order #12345 delivery issue',
      sender: 'John Smith',
      senderEmail: 'john@example.com',
      status: 'open',
      priority: 'high',
      integration: 'Gmail',
      lastMessage: 'I still haven\'t received my order...',
      lastActivity: '5 minutes ago',
      messageCount: 3,
      assignedTo: 'Sarah Johnson',
    },
    {
      id: '2',
      subject: 'Product return request',
      sender: 'Emily Davis',
      senderEmail: 'emily@company.com',
      status: 'pending',
      priority: 'medium',
      integration: 'Outlook',
      lastMessage: 'I would like to return this item because...',
      lastActivity: '1 hour ago',
      messageCount: 2,
    },
    {
      id: '3',
      subject: 'Billing question',
      sender: 'Mike Wilson',
      senderEmail: 'mike@business.com',
      status: 'resolved',
      priority: 'low',
      integration: 'WhatsApp',
      lastMessage: 'Thank you for the clarification!',
      lastActivity: '2 hours ago',
      messageCount: 5,
      assignedTo: 'Alex Chen',
    },
    {
      id: '4',
      subject: 'Technical support needed',
      sender: 'Lisa Brown',
      senderEmail: 'lisa@startup.com',
      status: 'escalated',
      priority: 'urgent',
      integration: 'Slack',
      lastMessage: 'The system is completely down...',
      lastActivity: '30 minutes ago',
      messageCount: 8,
      assignedTo: 'Tech Team',
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge variant="info">Open</Badge>;
      case 'resolved':
        return <Badge variant="success">Resolved</Badge>;
      case 'pending':
        return <Badge variant="warning">Pending</Badge>;
      case 'escalated':
        return <Badge variant="danger">Escalated</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <Badge variant="danger">Urgent</Badge>;
      case 'high':
        return <Badge variant="warning">High</Badge>;
      case 'medium':
        return <Badge variant="info">Medium</Badge>;
      case 'low':
        return <Badge variant="default">Low</Badge>;
      default:
        return <Badge>{priority}</Badge>;
    }
  };

  const filteredConversations = conversations.filter((conversation) => {
    const matchesSearch = 
      conversation.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conversation.sender.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conversation.senderEmail.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || conversation.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || conversation.priority === priorityFilter;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  const stats = {
    total: conversations.length,
    open: conversations.filter(c => c.status === 'open').length,
    pending: conversations.filter(c => c.status === 'pending').length,
    resolved: conversations.filter(c => c.status === 'resolved').length,
    escalated: conversations.filter(c => c.status === 'escalated').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Conversations
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage customer conversations across all channels
          </p>
        </div>
        <Button>
          <span className="mr-2">➕</span>
          New Conversation
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.open}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Open</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.resolved}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Resolved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.escalated}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Escalated</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search conversations..."
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
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
                <option value="escalated">Escalated</option>
              </select>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 text-sm"
              >
                <option value="all">All Priority</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conversations List */}
      <Card>
        <CardHeader>
          <CardTitle>
            Conversations ({filteredConversations.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredConversations.map((conversation) => (
              <Link
                key={conversation.id}
                to={`/conversations/${conversation.id}`}
                className="block p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-2">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white truncate">
                        {conversation.subject}
                      </h3>
                      {getStatusBadge(conversation.status)}
                      {getPriorityBadge(conversation.priority)}
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400 mb-2">
                      <span>From: {conversation.sender} ({conversation.senderEmail})</span>
                      <span>•</span>
                      <span>{conversation.integration}</span>
                      <span>•</span>
                      <span>{conversation.messageCount} messages</span>
                      {conversation.assignedTo && (
                        <>
                          <span>•</span>
                          <span>Assigned to: {conversation.assignedTo}</span>
                        </>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                      {conversation.lastMessage}
                    </p>
                  </div>
                  <div className="ml-4 text-right">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {conversation.lastActivity}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {filteredConversations.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400">
                No conversations found matching your criteria.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
