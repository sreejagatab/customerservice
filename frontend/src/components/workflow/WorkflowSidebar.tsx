/**
 * Workflow Sidebar Component
 * Drag-and-drop component palette for building workflows
 */

import React, { useState } from 'react';
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  BoltIcon,
  ChatBubbleLeftRightIcon,
  EnvelopeIcon,
  CpuChipIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  UserIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import { StepType, TriggerType } from '@universal-ai-cs/shared';

interface WorkflowSidebarProps {
  onClose: () => void;
}

interface ComponentCategory {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  components: ComponentItem[];
}

interface ComponentItem {
  id: string;
  type: StepType | TriggerType;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const componentCategories: ComponentCategory[] = [
  {
    id: 'triggers',
    name: 'Triggers',
    icon: BoltIcon,
    components: [
      {
        id: 'message-received',
        type: TriggerType.MESSAGE_RECEIVED,
        name: 'Message Received',
        description: 'Triggers when a new message is received',
        icon: ChatBubbleLeftRightIcon,
        color: 'bg-green-100 text-green-700 border-green-200',
      },
      {
        id: 'email-received',
        type: TriggerType.EMAIL_RECEIVED,
        name: 'Email Received',
        description: 'Triggers when a new email is received',
        icon: EnvelopeIcon,
        color: 'bg-blue-100 text-blue-700 border-blue-200',
      },
      {
        id: 'schedule',
        type: TriggerType.SCHEDULE,
        name: 'Schedule',
        description: 'Triggers at specified times or intervals',
        icon: ClockIcon,
        color: 'bg-purple-100 text-purple-700 border-purple-200',
      },
    ],
  },
  {
    id: 'ai-actions',
    name: 'AI Actions',
    icon: CpuChipIcon,
    components: [
      {
        id: 'ai-classify',
        type: StepType.AI_CLASSIFY,
        name: 'AI Classify',
        description: 'Classify messages using AI',
        icon: CpuChipIcon,
        color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      },
      {
        id: 'ai-generate-response',
        type: StepType.AI_GENERATE_RESPONSE,
        name: 'Generate Response',
        description: 'Generate AI-powered responses',
        icon: ChatBubbleLeftRightIcon,
        color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      },
      {
        id: 'ai-analyze-sentiment',
        type: StepType.AI_ANALYZE_SENTIMENT,
        name: 'Analyze Sentiment',
        description: 'Analyze message sentiment',
        icon: CpuChipIcon,
        color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      },
    ],
  },
  {
    id: 'messaging',
    name: 'Messaging',
    icon: ChatBubbleLeftRightIcon,
    components: [
      {
        id: 'send-message',
        type: StepType.SEND_MESSAGE,
        name: 'Send Message',
        description: 'Send a message to the customer',
        icon: ChatBubbleLeftRightIcon,
        color: 'bg-green-100 text-green-700 border-green-200',
      },
      {
        id: 'send-email',
        type: StepType.SEND_EMAIL,
        name: 'Send Email',
        description: 'Send an email to the customer',
        icon: EnvelopeIcon,
        color: 'bg-blue-100 text-blue-700 border-blue-200',
      },
      {
        id: 'forward-message',
        type: StepType.FORWARD_MESSAGE,
        name: 'Forward Message',
        description: 'Forward message to another recipient',
        icon: ArrowPathIcon,
        color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      },
    ],
  },
  {
    id: 'control-flow',
    name: 'Control Flow',
    icon: ArrowPathIcon,
    components: [
      {
        id: 'condition',
        type: StepType.CONDITION,
        name: 'Condition',
        description: 'Branch workflow based on conditions',
        icon: ArrowPathIcon,
        color: 'bg-orange-100 text-orange-700 border-orange-200',
      },
      {
        id: 'delay',
        type: StepType.DELAY,
        name: 'Delay',
        description: 'Wait for a specified amount of time',
        icon: ClockIcon,
        color: 'bg-gray-100 text-gray-700 border-gray-200',
      },
      {
        id: 'parallel',
        type: StepType.PARALLEL,
        name: 'Parallel',
        description: 'Execute multiple steps in parallel',
        icon: ArrowPathIcon,
        color: 'bg-teal-100 text-teal-700 border-teal-200',
      },
    ],
  },
  {
    id: 'human-actions',
    name: 'Human Actions',
    icon: UserIcon,
    components: [
      {
        id: 'escalate-to-human',
        type: StepType.ESCALATE_TO_HUMAN,
        name: 'Escalate to Human',
        description: 'Transfer conversation to a human agent',
        icon: UserIcon,
        color: 'bg-red-100 text-red-700 border-red-200',
      },
      {
        id: 'request-approval',
        type: StepType.REQUEST_APPROVAL,
        name: 'Request Approval',
        description: 'Request approval from a supervisor',
        icon: ExclamationTriangleIcon,
        color: 'bg-amber-100 text-amber-700 border-amber-200',
      },
      {
        id: 'notify-agent',
        type: StepType.NOTIFY_AGENT,
        name: 'Notify Agent',
        description: 'Send notification to an agent',
        icon: UserIcon,
        color: 'bg-pink-100 text-pink-700 border-pink-200',
      },
    ],
  },
];

export const WorkflowSidebar: React.FC<WorkflowSidebarProps> = ({ onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['triggers', 'ai-actions'])
  );

  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const filteredCategories = componentCategories.map(category => ({
    ...category,
    components: category.components.filter(component =>
      component.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      component.description.toLowerCase().includes(searchTerm.toLowerCase())
    ),
  })).filter(category => category.components.length > 0);

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Components</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-100 transition-colors"
          >
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search components..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Component Categories */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredCategories.map((category) => (
          <div key={category.id} className="space-y-2">
            {/* Category Header */}
            <button
              onClick={() => toggleCategory(category.id)}
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <category.icon className="h-5 w-5 text-gray-600" />
                <span className="font-medium text-gray-900">{category.name}</span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  {category.components.length}
                </span>
              </div>
              <div className={`transform transition-transform ${
                expandedCategories.has(category.id) ? 'rotate-90' : ''
              }`}>
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>

            {/* Category Components */}
            {expandedCategories.has(category.id) && (
              <div className="space-y-2 ml-2">
                {category.components.map((component) => (
                  <div
                    key={component.id}
                    draggable
                    onDragStart={(event) => onDragStart(event, component.type)}
                    className={`p-3 rounded-lg border-2 border-dashed cursor-move hover:shadow-md transition-all ${component.color}`}
                  >
                    <div className="flex items-start space-x-3">
                      <component.icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm">{component.name}</h4>
                        <p className="text-xs opacity-75 mt-1">{component.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {filteredCategories.length === 0 && (
          <div className="text-center py-8">
            <MagnifyingGlassIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No components found</p>
            <p className="text-sm text-gray-400 mt-1">Try adjusting your search terms</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="text-xs text-gray-600">
          <p className="font-medium mb-1">How to use:</p>
          <p>Drag components from here onto the canvas to build your workflow.</p>
        </div>
      </div>
    </div>
  );
};
