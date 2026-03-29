'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import { RunStatus, RunArea, RunSeverity } from './types';

export interface DashboardFilters {
  status: RunStatus[];
  area: RunArea[];
  severity: RunSeverity[];
  dateRange: {
    start: string;
    end: string;
  };
  durationRange: {
    min: number;
    max: number;
  };
  resourceFeeRange: {
    min: number;
    max: number;
  };
  hasCrash: boolean | null;
  searchTerm: string;
}

interface AdvancedDashboardFiltersProps {
  filters: DashboardFilters;
  onFiltersChange: (filters: DashboardFilters) => void;
  onReset: () => void;
}

const AdvancedDashboardFilters: React.FC<AdvancedDashboardFiltersProps> = ({
  filters,
  onFiltersChange,
  onReset,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleStatusChange = useCallback((status: RunStatus) => {
    const newStatus = filters.status.includes(status)
      ? filters.status.filter(s => s !== status)
      : [...filters.status, status];
    onFiltersChange({ ...filters, status: newStatus });
  }, [filters, onFiltersChange]);

  const handleAreaChange = useCallback((area: RunArea) => {
    const newArea = filters.area.includes(area)
      ? filters.area.filter(a => a !== area)
      : [...filters.area, area];
    onFiltersChange({ ...filters, area: newArea });
  }, [filters, onFiltersChange]);

  const handleSeverityChange = useCallback((severity: RunSeverity) => {
    const newSeverity = filters.severity.includes(severity)
      ? filters.severity.filter(s => s !== severity)
      : [...filters.severity, severity];
    onFiltersChange({ ...filters, severity: newSeverity });
  }, [filters, onFiltersChange]);

  const handleDateRangeChange = useCallback((field: 'start' | 'end', value: string) => {
    onFiltersChange({
      ...filters,
      dateRange: { ...filters.dateRange, [field]: value }
    });
  }, [filters, onFiltersChange]);

  const handleDurationRangeChange = useCallback((field: 'min' | 'max', value: string) => {
    const numValue = parseInt(value) || 0;
    onFiltersChange({
      ...filters,
      durationRange: { ...filters.durationRange, [field]: numValue }
    });
  }, [filters, onFiltersChange]);

  const handleResourceFeeRangeChange = useCallback((field: 'min' | 'max', value: string) => {
    const numValue = parseInt(value) || 0;
    onFiltersChange({
      ...filters,
      resourceFeeRange: { ...filters.resourceFeeRange, [field]: numValue }
    });
  }, [filters, onFiltersChange]);

  const handleCrashFilterChange = useCallback((value: string) => {
    let hasCrash: boolean | null = null;
    if (value === 'true') hasCrash = true;
    else if (value === 'false') hasCrash = false;
    onFiltersChange({ ...filters, hasCrash });
  }, [filters, onFiltersChange]);

  const handleSearchChange = useCallback((value: string) => {
    onFiltersChange({ ...filters, searchTerm: value });
  }, [filters, onFiltersChange]);

  const activeFiltersCount = [
    filters.status.length > 0,
    filters.area.length > 0,
    filters.severity.length > 0,
    filters.dateRange.start || filters.dateRange.end,
    filters.durationRange.min > 0 || filters.durationRange.max > 0,
    filters.resourceFeeRange.min > 0 || filters.resourceFeeRange.max > 0,
    filters.hasCrash !== null,
    filters.searchTerm
  ].filter(Boolean).length;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">Dashboard Filters</h3>
          {activeFiltersCount > 0 && (
            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
              {activeFiltersCount} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onReset}
            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1 rounded border border-gray-300 hover:bg-gray-50"
          >
            Reset All
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-blue-600 hover:text-blue-800 px-3 py-1"
          >
            {isExpanded ? 'Simple View' : 'Advanced Filters'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search Runs
          </label>
          <input
            type="text"
            value={filters.searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by ID, signature, or keywords..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <div className="space-y-2">
              {(['running', 'completed', 'failed', 'cancelled'] as RunStatus[]).map(status => (
                <label key={status} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.status.includes(status)}
                    onChange={() => handleStatusChange(status)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 capitalize">{status}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Area
            </label>
            <div className="space-y-2">
              {(['auth', 'state', 'budget', 'xdr'] as RunArea[]).map(area => (
                <label key={area} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.area.includes(area)}
                    onChange={() => handleAreaChange(area)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 capitalize">{area}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Severity
            </label>
            <div className="space-y-2">
              {(['low', 'medium', 'high', 'critical'] as RunSeverity[]).map(severity => (
                <label key={severity} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.severity.includes(severity)}
                    onChange={() => handleSeverityChange(severity)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 capitalize">{severity}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="space-y-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date Range
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={filters.dateRange.start}
                    onChange={(e) => handleDateRangeChange('start', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="self-center text-gray-500">to</span>
                  <input
                    type="date"
                    value={filters.dateRange.end}
                    onChange={(e) => handleDateRangeChange('end', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Has Crash
                </label>
                <select
                  value={filters.hasCrash === null ? '' : filters.hasCrash.toString()}
                  onChange={(e) => handleCrashFilterChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All</option>
                  <option value="true">With Crash</option>
                  <option value="false">Without Crash</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Duration Range (minutes)
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={filters.durationRange.min}
                    onChange={(e) => handleDurationRangeChange('min', e.target.value)}
                    placeholder="Min"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-gray-500">-</span>
                  <input
                    type="number"
                    value={filters.durationRange.max}
                    onChange={(e) => handleDurationRangeChange('max', e.target.value)}
                    placeholder="Max"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Resource Fee Range
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={filters.resourceFeeRange.min}
                    onChange={(e) => handleResourceFeeRangeChange('min', e.target.value)}
                    placeholder="Min"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-gray-500">-</span>
                  <input
                    type="number"
                    value={filters.resourceFeeRange.max}
                    onChange={(e) => handleResourceFeeRangeChange('max', e.target.value)}
                    placeholder="Max"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdvancedDashboardFilters;
