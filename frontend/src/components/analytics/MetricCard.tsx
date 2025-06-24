/**
 * Metric Card Component
 * Displays key metrics with trends and visual indicators
 */

import React from 'react';
import {
  TrendingUpIcon,
  TrendingDownIcon,
  MinusIcon,
} from '@heroicons/react/24/outline';

interface MetricCardProps {
  title: string;
  value: string | number;
  trend?: number;
  icon: React.ComponentType<{ className?: string }>;
  color: 'blue' | 'green' | 'yellow' | 'purple' | 'red' | 'gray';
  invertTrend?: boolean;
  subtitle?: string;
  isLoading?: boolean;
}

const colorClasses = {
  blue: {
    bg: 'bg-blue-50',
    icon: 'text-blue-600',
    trend: 'text-blue-600',
  },
  green: {
    bg: 'bg-green-50',
    icon: 'text-green-600',
    trend: 'text-green-600',
  },
  yellow: {
    bg: 'bg-yellow-50',
    icon: 'text-yellow-600',
    trend: 'text-yellow-600',
  },
  purple: {
    bg: 'bg-purple-50',
    icon: 'text-purple-600',
    trend: 'text-purple-600',
  },
  red: {
    bg: 'bg-red-50',
    icon: 'text-red-600',
    trend: 'text-red-600',
  },
  gray: {
    bg: 'bg-gray-50',
    icon: 'text-gray-600',
    trend: 'text-gray-600',
  },
};

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  trend,
  icon: Icon,
  color,
  invertTrend = false,
  subtitle,
  isLoading = false,
}) => {
  const colors = colorClasses[color];
  
  // Determine trend direction and color
  const getTrendInfo = () => {
    if (trend === undefined || trend === null) {
      return { icon: MinusIcon, color: 'text-gray-400', text: 'No change' };
    }

    const actualTrend = invertTrend ? -trend : trend;
    const isPositive = actualTrend > 0;
    const isNegative = actualTrend < 0;

    if (isPositive) {
      return {
        icon: TrendingUpIcon,
        color: 'text-green-600',
        text: `+${Math.abs(actualTrend).toFixed(1)}%`,
      };
    } else if (isNegative) {
      return {
        icon: TrendingDownIcon,
        color: 'text-red-600',
        text: `-${Math.abs(actualTrend).toFixed(1)}%`,
      };
    } else {
      return {
        icon: MinusIcon,
        color: 'text-gray-400',
        text: '0%',
      };
    }
  };

  const trendInfo = getTrendInfo();
  const TrendIcon = trendInfo.icon;

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="h-4 bg-gray-200 rounded w-24"></div>
            <div className={`w-10 h-10 ${colors.bg} rounded-lg flex items-center justify-center`}>
              <div className="w-5 h-5 bg-gray-200 rounded"></div>
            </div>
          </div>
          <div className="h-8 bg-gray-200 rounded w-20 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-16"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
        <div className={`w-10 h-10 ${colors.bg} rounded-lg flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${colors.icon}`} />
        </div>
      </div>

      {/* Value */}
      <div className="mb-2">
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        {subtitle && (
          <div className="text-sm text-gray-500">{subtitle}</div>
        )}
      </div>

      {/* Trend */}
      {trend !== undefined && (
        <div className="flex items-center space-x-1">
          <TrendIcon className={`w-4 h-4 ${trendInfo.color}`} />
          <span className={`text-sm font-medium ${trendInfo.color}`}>
            {trendInfo.text}
          </span>
          <span className="text-sm text-gray-500">vs last period</span>
        </div>
      )}
    </div>
  );
};
