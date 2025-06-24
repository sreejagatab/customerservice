/**
 * Workflow Toolbar Component
 * Top toolbar with save, validate, test, and view controls
 */

import React from 'react';
import {
  PlayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  Bars3Icon,
  Cog6ToothIcon,
  DocumentArrowUpIcon,
  EyeIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Tooltip } from '@/components/ui/Tooltip';

interface WorkflowToolbarProps {
  onSave: () => void;
  onValidate: () => void;
  onTest: () => void;
  onToggleSidebar: () => void;
  onToggleProperties: () => void;
  isLoading?: boolean;
  isValidating?: boolean;
  validationErrors?: string[];
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const WorkflowToolbar: React.FC<WorkflowToolbarProps> = ({
  onSave,
  onValidate,
  onTest,
  onToggleSidebar,
  onToggleProperties,
  isLoading = false,
  isValidating = false,
  validationErrors = [],
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) => {
  const hasValidationErrors = validationErrors.length > 0;

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Left Section - Navigation and Actions */}
        <div className="flex items-center space-x-4">
          {/* Sidebar Toggle */}
          <Tooltip content="Toggle Sidebar">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleSidebar}
              className="p-2"
            >
              <Bars3Icon className="h-5 w-5" />
            </Button>
          </Tooltip>

          {/* Undo/Redo */}
          <div className="flex items-center space-x-1">
            <Tooltip content="Undo">
              <Button
                variant="ghost"
                size="sm"
                onClick={onUndo}
                disabled={!canUndo}
                className="p-2"
              >
                <ArrowUturnLeftIcon className="h-4 w-4" />
              </Button>
            </Tooltip>
            <Tooltip content="Redo">
              <Button
                variant="ghost"
                size="sm"
                onClick={onRedo}
                disabled={!canRedo}
                className="p-2"
              >
                <ArrowUturnRightIcon className="h-4 w-4" />
              </Button>
            </Tooltip>
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-gray-300" />

          {/* Primary Actions */}
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onValidate}
              disabled={isValidating}
              className="flex items-center space-x-2"
            >
              {isValidating ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" />
              ) : hasValidationErrors ? (
                <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
              ) : (
                <CheckCircleIcon className="h-4 w-4 text-green-500" />
              )}
              <span>Validate</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onTest}
              className="flex items-center space-x-2"
            >
              <PlayIcon className="h-4 w-4" />
              <span>Test</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={onSave}
              disabled={isLoading}
              className="flex items-center space-x-2"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : (
                <DocumentArrowUpIcon className="h-4 w-4" />
              )}
              <span>Save</span>
            </Button>
          </div>
        </div>

        {/* Center Section - Workflow Info */}
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-600">
            <span className="font-medium">Customer Support Workflow</span>
            <span className="mx-2">•</span>
            <span>Draft</span>
          </div>

          {/* Validation Status */}
          {hasValidationErrors && (
            <Badge variant="error" className="flex items-center space-x-1">
              <ExclamationTriangleIcon className="h-3 w-3" />
              <span>{validationErrors.length} error{validationErrors.length !== 1 ? 's' : ''}</span>
            </Badge>
          )}
        </div>

        {/* Right Section - View Controls */}
        <div className="flex items-center space-x-2">
          {/* Zoom Controls */}
          <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
            <Button
              variant="ghost"
              size="xs"
              className="px-2 py-1 text-xs"
            >
              50%
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="px-2 py-1 text-xs"
            >
              100%
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="px-2 py-1 text-xs"
            >
              Fit
            </Button>
          </div>

          {/* View Options */}
          <Tooltip content="View Options">
            <Button
              variant="ghost"
              size="sm"
              className="p-2"
            >
              <EyeIcon className="h-5 w-5" />
            </Button>
          </Tooltip>

          {/* Properties Panel Toggle */}
          <Tooltip content="Toggle Properties">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleProperties}
              className="p-2"
            >
              <Cog6ToothIcon className="h-5 w-5" />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Validation Errors Bar */}
      {hasValidationErrors && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start space-x-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-red-800 mb-1">
                Validation Errors
              </h4>
              <ul className="text-sm text-red-700 space-y-1">
                {validationErrors.slice(0, 3).map((error, index) => (
                  <li key={index} className="flex items-start space-x-1">
                    <span className="text-red-500">•</span>
                    <span>{error}</span>
                  </li>
                ))}
                {validationErrors.length > 3 && (
                  <li className="text-red-600 font-medium">
                    +{validationErrors.length - 3} more errors
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
