/**
 * Trigger Node Component
 * Visual node for workflow triggers
 */

import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import {
  BoltIcon,
  ChatBubbleLeftRightIcon,
  EnvelopeIcon,
  ClockIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';
import { TriggerType } from '@universal-ai-cs/shared';

interface TriggerNodeData {
  type: TriggerType;
  label: string;
  config: Record<string, any>;
  isActive?: boolean;
  hasError?: boolean;
}

const triggerIcons: Record<TriggerType, React.ComponentType<{ className?: string }>> = {
  [TriggerType.MESSAGE_RECEIVED]: ChatBubbleLeftRightIcon,
  [TriggerType.EMAIL_RECEIVED]: EnvelopeIcon,
  [TriggerType.SCHEDULE]: ClockIcon,
  [TriggerType.WEBHOOK]: GlobeAltIcon,
  [TriggerType.MANUAL]: BoltIcon,
  [TriggerType.INTEGRATION_EVENT]: GlobeAltIcon,
};

const triggerColors: Record<TriggerType, string> = {
  [TriggerType.MESSAGE_RECEIVED]: 'bg-green-500',
  [TriggerType.EMAIL_RECEIVED]: 'bg-blue-500',
  [TriggerType.SCHEDULE]: 'bg-purple-500',
  [TriggerType.WEBHOOK]: 'bg-orange-500',
  [TriggerType.MANUAL]: 'bg-gray-500',
  [TriggerType.INTEGRATION_EVENT]: 'bg-teal-500',
};

export const TriggerNode: React.FC<NodeProps<TriggerNodeData>> = ({ 
  data, 
  selected,
  id 
}) => {
  const Icon = triggerIcons[data.type] || BoltIcon;
  const colorClass = triggerColors[data.type] || 'bg-gray-500';

  return (
    <div
      className={`
        relative bg-white rounded-lg shadow-lg border-2 min-w-[200px]
        ${selected ? 'border-blue-500 shadow-blue-200' : 'border-gray-200'}
        ${data.hasError ? 'border-red-500 shadow-red-200' : ''}
        transition-all duration-200 hover:shadow-xl
      `}
    >
      {/* Header */}
      <div className={`${colorClass} text-white px-4 py-3 rounded-t-lg flex items-center space-x-2`}>
        <Icon className="h-5 w-5" />
        <span className="font-medium text-sm">TRIGGER</span>
        {data.isActive && (
          <div className="ml-auto">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 mb-2">{data.label}</h3>
        
        {/* Configuration Summary */}
        <div className="space-y-2">
          {data.type === TriggerType.MESSAGE_RECEIVED && (
            <div className="text-sm text-gray-600">
              <div className="flex items-center justify-between">
                <span>Channel:</span>
                <span className="font-medium">{data.config.channel || 'All'}</span>
              </div>
              {data.config.keywords && (
                <div className="flex items-center justify-between">
                  <span>Keywords:</span>
                  <span className="font-medium text-xs bg-gray-100 px-2 py-1 rounded">
                    {data.config.keywords.length} set
                  </span>
                </div>
              )}
            </div>
          )}

          {data.type === TriggerType.EMAIL_RECEIVED && (
            <div className="text-sm text-gray-600">
              <div className="flex items-center justify-between">
                <span>From:</span>
                <span className="font-medium">{data.config.fromPattern || 'Any'}</span>
              </div>
              {data.config.subject && (
                <div className="flex items-center justify-between">
                  <span>Subject:</span>
                  <span className="font-medium text-xs bg-gray-100 px-2 py-1 rounded truncate">
                    {data.config.subject}
                  </span>
                </div>
              )}
            </div>
          )}

          {data.type === TriggerType.SCHEDULE && (
            <div className="text-sm text-gray-600">
              <div className="flex items-center justify-between">
                <span>Schedule:</span>
                <span className="font-medium">{data.config.cron || data.config.interval}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Timezone:</span>
                <span className="font-medium">{data.config.timezone || 'UTC'}</span>
              </div>
            </div>
          )}

          {data.type === TriggerType.WEBHOOK && (
            <div className="text-sm text-gray-600">
              <div className="flex items-center justify-between">
                <span>Method:</span>
                <span className="font-medium">{data.config.method || 'POST'}</span>
              </div>
              {data.config.path && (
                <div className="flex items-center justify-between">
                  <span>Path:</span>
                  <span className="font-medium text-xs bg-gray-100 px-2 py-1 rounded truncate">
                    {data.config.path}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status Indicators */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {data.isActive ? (
              <div className="flex items-center space-x-1 text-green-600">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-xs font-medium">Active</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1 text-gray-500">
                <div className="w-2 h-2 bg-gray-400 rounded-full" />
                <span className="text-xs font-medium">Inactive</span>
              </div>
            )}
          </div>

          {data.hasError && (
            <div className="text-red-500 text-xs font-medium">
              Error
            </div>
          )}
        </div>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-gray-400 border-2 border-white"
        style={{ right: -6 }}
      />

      {/* Node ID for debugging */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute -top-6 left-0 text-xs text-gray-400 font-mono">
          {id}
        </div>
      )}
    </div>
  );
};
