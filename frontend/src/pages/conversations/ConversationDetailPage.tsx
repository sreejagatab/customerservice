import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input } from '@/components/ui';

interface Message {
  id: string;
  sender: string;
  senderEmail: string;
  content: string;
  timestamp: string;
  isFromCustomer: boolean;
  aiGenerated?: boolean;
  confidence?: number;
}

interface ConversationDetail {
  id: string;
  subject: string;
  sender: string;
  senderEmail: string;
  status: 'open' | 'resolved' | 'pending' | 'escalated';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  integration: string;
  assignedTo?: string;
  tags: string[];
  createdAt: string;
  messages: Message[];
}

export const ConversationDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Mock data - replace with real data from API
  const conversation: ConversationDetail = {
    id: id || '1',
    subject: 'Order #12345 delivery issue',
    sender: 'John Smith',
    senderEmail: 'john@example.com',
    status: 'open',
    priority: 'high',
    integration: 'Gmail',
    assignedTo: 'Sarah Johnson',
    tags: ['delivery', 'urgent', 'order-issue'],
    createdAt: '2024-01-15T10:30:00Z',
    messages: [
      {
        id: '1',
        sender: 'John Smith',
        senderEmail: 'john@example.com',
        content: 'Hi, I ordered item #12345 three days ago and it still hasn\'t arrived. The tracking shows it was delivered but I never received it. Can you help me figure out what happened?',
        timestamp: '2024-01-15T10:30:00Z',
        isFromCustomer: true,
      },
      {
        id: '2',
        sender: 'AI Assistant',
        senderEmail: 'ai@universalai-cs.com',
        content: 'Hello John! I understand your concern about order #12345. Let me help you track down your package. I\'ve checked our system and can see that the package was marked as delivered to your address on January 14th at 2:30 PM. Sometimes packages are left in secure locations or with neighbors. Have you checked around your property or with nearby neighbors?',
        timestamp: '2024-01-15T10:35:00Z',
        isFromCustomer: false,
        aiGenerated: true,
        confidence: 0.92,
      },
      {
        id: '3',
        sender: 'John Smith',
        senderEmail: 'john@example.com',
        content: 'I checked everywhere and asked my neighbors. Nobody has seen the package. This is really frustrating. I need this item for an important meeting tomorrow.',
        timestamp: '2024-01-15T11:15:00Z',
        isFromCustomer: true,
      },
    ],
  };

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

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    setIsLoading(true);
    try {
      // TODO: Implement send message API call
      console.log('Sending message:', newMessage);
      setNewMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      // TODO: Implement status change API call
      console.log('Changing status to:', newStatus);
    } catch (error) {
      console.error('Failed to change status:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            to="/conversations"
            className="text-blue-600 hover:text-blue-500 dark:text-blue-400"
          >
            ← Back to Conversations
          </Link>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            Escalate
          </Button>
          <Button variant="outline" size="sm">
            Assign
          </Button>
          <select
            value={conversation.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 text-sm"
          >
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
            <option value="escalated">Escalated</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main conversation */}
        <div className="lg:col-span-3 space-y-6">
          {/* Conversation header */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl">{conversation.subject}</CardTitle>
                  <div className="flex items-center space-x-2 mt-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      From: {conversation.sender} ({conversation.senderEmail})
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">•</span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {conversation.integration}
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {getStatusBadge(conversation.status)}
                  {getPriorityBadge(conversation.priority)}
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Messages */}
          <Card>
            <CardContent className="p-0">
              <div className="max-h-96 overflow-y-auto">
                {conversation.messages.map((message, index) => (
                  <div
                    key={message.id}
                    className={`p-6 ${index !== conversation.messages.length - 1 ? 'border-b border-gray-200 dark:border-gray-700' : ''}`}
                  >
                    <div className={`flex ${message.isFromCustomer ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-3xl ${message.isFromCustomer ? 'bg-gray-100 dark:bg-gray-800' : 'bg-blue-100 dark:bg-blue-900'} rounded-lg p-4`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-sm">
                              {message.sender}
                            </span>
                            {message.aiGenerated && (
                              <Badge variant="info" size="sm">
                                AI Generated ({Math.round((message.confidence || 0) * 100)}%)
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(message.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-900 dark:text-gray-100">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Reply box */}
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your response..."
                  className="w-full h-32 p-3 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Button variant="outline" size="sm">
                      🤖 Generate AI Response
                    </Button>
                    <Button variant="outline" size="sm">
                      📎 Attach File
                    </Button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button variant="outline" onClick={() => setNewMessage('')}>
                      Cancel
                    </Button>
                    <Button onClick={handleSendMessage} loading={isLoading}>
                      Send Reply
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Assigned To
                </label>
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  {conversation.assignedTo || 'Unassigned'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Created
                </label>
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  {new Date(conversation.createdAt).toLocaleString()}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Tags
                </label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {conversation.tags.map((tag) => (
                    <Badge key={tag} size="sm">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start">
                📋 Add Note
              </Button>
              <Button variant="outline" className="w-full justify-start">
                🏷️ Add Tag
              </Button>
              <Button variant="outline" className="w-full justify-start">
                📧 Forward
              </Button>
              <Button variant="outline" className="w-full justify-start">
                🔄 Merge
              </Button>
              <Button variant="danger" className="w-full justify-start">
                🗑️ Delete
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
