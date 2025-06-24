/**
 * AI Node Component
 * Visual node for AI processing steps
 */

import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import {
  CpuChipIcon,
  ChatBubbleLeftRightIcon,
  EyeIcon,
  LanguageIcon,
  DocumentTextIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { StepType } from '@universal-ai-cs/shared';

interface AiNodeData {
  type: StepType;
  label: string;
  config: Record<string, any>;
  isProcessing?: boolean;
  hasError?: boolean;
  executionTime?: number;
}

const aiIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  [StepType.AI_CLASSIFY]: CpuChipIcon,
  [StepType.AI_GENERATE_RESPONSE]: ChatBubbleLeftRightIcon,
  [StepType.AI_ANALYZE_SENTIMENT]: EyeIcon,
  [StepType.AI_EXTRACT_ENTITIES]: DocumentTextIcon,
  [StepType.AI_TRANSLATE]: LanguageIcon,
  [StepType.AI_SUMMARIZE]: DocumentTextIcon,
};

const aiColors: Record<string, string> = {
  [StepType.AI_CLASSIFY]: 'bg-indigo-500',
  [StepType.AI_GENERATE_RESPONSE]: 'bg-purple-500',
  [StepType.AI_ANALYZE_SENTIMENT]: 'bg-pink-500',
  [StepType.AI_EXTRACT_ENTITIES]: 'bg-cyan-500',
  [StepType.AI_TRANSLATE]: 'bg-emerald-500',
  [StepType.AI_SUMMARIZE]: 'bg-amber-500',
};

export const AiNode: React.FC<NodeProps<AiNodeData>> = ({ 
  data, 
  selected,
  id 
}) => {
  const Icon = aiIcons[data.type] || CpuChipIcon;
  const colorClass = aiColors[data.type] || 'bg-indigo-500';

  return (
    <div
      className={`
        relative bg-white rounded-lg shadow-lg border-2 min-w-[220px]
        ${selected ? 'border-blue-500 shadow-blue-200' : 'border-gray-200'}
        ${data.hasError ? 'border-red-500 shadow-red-200' : ''}
        transition-all duration-200 hover:shadow-xl
      `}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-gray-400 border-2 border-white"
        style={{ left: -6 }}
      />

      {/* Header */}
      <div className={`${colorClass} text-white px-4 py-3 rounded-t-lg flex items-center space-x-2`}>
        <Icon className="h-5 w-5" />
        <span className="font-medium text-sm">AI</span>
        {data.isProcessing && (
          <div className="ml-auto">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 mb-2">{data.label}</h3>
        
        {/* AI Configuration */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Provider:</span>
            <span className="font-medium capitalize">
              {data.config.provider || 'OpenAI'}
            </span>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Model:</span>
            <span className="font-medium text-xs bg-gray-100 px-2 py-1 rounded">
              {data.config.model || 'gpt-3.5-turbo'}
            </span>
          </div>

          {/* Type-specific configurations */}
          {data.type === StepType.AI_CLASSIFY && data.config.categories && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Categories:</span>
              <span className="font-medium text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                {data.config.categories.length} types
              </span>
            </div>
          )}

          {data.type === StepType.AI_GENERATE_RESPONSE && (
            <>
              {data.config.temperature !== undefined && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Temperature:</span>
                  <span className="font-medium">{data.config.temperature}</span>
                </div>
              )}
              {data.config.maxTokens && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Max Tokens:</span>
                  <span className="font-medium">{data.config.maxTokens}</span>
                </div>
              )}
            </>
          )}

          {data.type === StepType.AI_TRANSLATE && data.config.targetLanguage && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Target:</span>
              <span className="font-medium capitalize">{data.config.targetLanguage}</span>
            </div>
          )}
        </div>

        {/* Advanced Settings Indicator */}
        {(data.config.customPrompt || data.config.fallbackAction || data.config.confidenceThreshold) && (
          <div className="mt-3 flex items-center space-x-2">
            <ShieldCheckIcon className="h-4 w-4 text-gray-400" />
            <span className="text-xs text-gray-500">Advanced settings configured</span>
          </div>
        )}

        {/* Performance Metrics */}
        {data.executionTime && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Last execution:</span>
              <span className="font-medium">{data.executionTime}ms</span>
            </div>
          </div>
        )}

        {/* Status */}
        <div className="mt-3 flex items-center justify-between">
          {data.isProcessing ? (
            <div className="flex items-center space-x-1 text-blue-600">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium">Processing</span>
            </div>
          ) : data.hasError ? (
            <div className="flex items-center space-x-1 text-red-600">
              <div className="w-2 h-2 bg-red-500 rounded-full" />
              <span className="text-xs font-medium">Error</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1 text-green-600">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="text-xs font-medium">Ready</span>
            </div>
          )}

          {/* Cost Indicator */}
          {data.config.provider && (
            <div className="text-xs text-gray-400">
              ${(Math.random() * 0.01).toFixed(4)}
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
