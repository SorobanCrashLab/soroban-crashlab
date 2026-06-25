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
  isLoading?: boolean;
  error?: string | null;
}

const AdvancedDashboardFilters: React.FC<AdvancedDashboardFiltersProps> = ({
  filters,
  onFiltersChange,
  onReset,
  isLoading = false,
  error = null,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [focusedFilter, setFocusedFilter] = useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && isExpanded) {
      setIsExpanded(false);
    }
    if (e.key === 'Enter' && e.target instanceof HTMLButtonElement) {
      e.target.click();
    }
  }, [isExpanded]);

  // Focus management for accessibility
  const handleFocus = useCallback((filterName: string) => {
    setFocusedFilter(filterName);
  }, []);

  const handleBlur = useCallback(() => {
    setFocusedFilter(null);
  }, []);

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
    <div 
      ref={containerRef}
      className="bg-white dark:bg-zinc-950 rounded-lg shadow-sm border border-gray-200 dark:border-zinc-800 p-4 mb-6"
      role="region"
      aria-labelledby="dashboard-filters-heading"
      onKeyDown={handleKeyDown}
    >
      {/* Error state */}
      {error && (
        <div 
          className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md"
          role="alert"
          aria-live="polite"
        >
          <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Loading state overlay */}
      {isLoading && (
        <div 
          className="absolute inset-0 bg-white/50 dark:bg-zinc-950/50 flex items-center justify-center rounded-lg z-10"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" aria-hidden="true"></div>
            <span className="text-sm text-gray-600 dark:text-zinc-400">Loading filters...</span>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h3 id="dashboard-filters-heading" className="text-lg font-semibold text-gray-900 dark:text-zinc-100">
            Dashboard Filters
          </h3>
          {activeFiltersCount > 0 && (
            <span 
              className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs font-medium px-2.5 py-0.5 rounded-full"
              aria-label={`${activeFiltersCount} active filters`}
            >
              {activeFiltersCount} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onReset}
            disabled={isLoading}
            className="text-sm text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 px-3 py-1.5 rounded border border-gray-300 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Reset all filters to default values"
          >
            Reset All
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            disabled={isLoading}
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-expanded={isExpanded}
            aria-controls="advanced-filters-panel"
          >
            {isExpanded ? 'Simple View' : 'Advanced Filters'}
          </button>
        </div>
      </div>

      <div className="space-y-4" aria-busy={isLoading}>
        <div>
          <label 
            htmlFor="search-runs"
            className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2"
          >
            Search Runs
          </label>
          <input
            id="search-runs"
            type="text"
            value={filters.searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => handleFocus('search')}
            onBlur={handleBlur}
            placeholder="Search by ID, signature, or keywords..."
            disabled={isLoading}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors ${
              focusedFilter === 'search' 
                ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-500/20 dark:ring-blue-400/20' 
                : 'border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100'
            } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            aria-describedby="search-runs-description"
          />
          <span id="search-runs-description" className="sr-only">
            Enter keywords to filter runs by ID, signature, or other attributes
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <fieldset className="space-y-2">
              <legend className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                Status
              </legend>
              <div className="space-y-2" role="group" aria-label="Filter by run status">
                {(['running', 'completed', 'failed', 'cancelled'] as RunStatus[]).map(status => (
                  <label key={status} className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.status.includes(status)}
                      onChange={() => handleStatusChange(status)}
                      disabled={isLoading}
                      className="rounded border-gray-300 dark:border-zinc-700 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-50"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-zinc-300 capitalize">{status}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div>
            <fieldset className="space-y-2">
              <legend className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                Area
              </legend>
              <div className="space-y-2" role="group" aria-label="Filter by product area">
                {(['auth', 'state', 'budget', 'xdr'] as RunArea[]).map(area => (
                  <label key={area} className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.area.includes(area)}
                      onChange={() => handleAreaChange(area)}
                      disabled={isLoading}
                      className="rounded border-gray-300 dark:border-zinc-700 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-50"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-zinc-300 capitalize">{area}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div>
            <fieldset className="space-y-2">
              <legend className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                Severity
              </legend>
              <div className="space-y-2" role="group" aria-label="Filter by severity level">
                {(['low', 'medium', 'high', 'critical'] as RunSeverity[]).map(severity => (
                  <label key={severity} className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.severity.includes(severity)}
                      onChange={() => handleSeverityChange(severity)}
                      disabled={isLoading}
                      className="rounded border-gray-300 dark:border-zinc-700 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-50"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-zinc-300 capitalize">{severity}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>

        {isExpanded && (
          <div 
            id="advanced-filters-panel"
            className="space-y-4 pt-4 border-t border-gray-200 dark:border-zinc-800"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label 
                  htmlFor="date-start"
                  className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2"
                >
                  Date Range
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    id="date-start"
                    type="date"
                    value={filters.dateRange.start}
                    onChange={(e) => handleDateRangeChange('start', e.target.value)}
                    disabled={isLoading}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 disabled:opacity-50"
                    />
                  <span className="text-gray-500 dark:text-zinc-500" aria-hidden="true">to</span>
                  <input
                    id="date-end"
                    type="date"
                    value={filters.dateRange.end}
                    onChange={(e) => handleDateRangeChange('end', e.target.value)}
                    disabled={isLoading}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label 
                  htmlFor="crash-filter"
                  className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2"
                >
                  Has Crash
                </label>
                <select
                  id="crash-filter"
                  value={filters.hasCrash === null ? '' : filters.hasCrash.toString()}
                  onChange={(e) => handleCrashFilterChange(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 disabled:opacity-50"
                >
                  <option value="">All</option>
                  <option value="true">With Crash</option>
                  <option value="false">Without Crash</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label 
                  htmlFor="duration-min"
                  className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2"
                >
                  Duration Range (minutes)
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    id="duration-min"
                    type="number"
                    value={filters.durationRange.min || ''}
                    onChange={(e) => handleDurationRangeChange('min', e.target.value)}
                    placeholder="Min"
                    disabled={isLoading}
                    min="0"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 disabled:opacity-50"
                    />
                  <span className="text-gray-500 dark:text-zinc-500" aria-hidden="true">-</span>
                  <input
                    id="duration-max"
                    type="number"
                    value={filters.durationRange.max || ''}
                    onChange={(e) => handleDurationRangeChange('max', e.target.value)}
                    placeholder="Max"
                    disabled={isLoading}
                    min="0"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label 
                  htmlFor="fee-min"
                  className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2"
                >
                  Resource Fee Range
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    id="fee-min"
                    type="number"
                    value={filters.resourceFeeRange.min || ''}
                    onChange={(e) => handleResourceFeeRangeChange('min', e.target.value)}
                    placeholder="Min"
                    disabled={isLoading}
                    min="0"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 disabled:opacity-50"
                    />
                  <span className="text-gray-500 dark:text-zinc-500" aria-hidden="true">-</span>
                  <input
                    id="fee-max"
                    type="number"
                    value={filters.resourceFeeRange.max || ''}
                    onChange={(e) => handleResourceFeeRangeChange('max', e.target.value)}
                    placeholder="Max"
                    disabled={isLoading}
                    min="0"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 disabled:opacity-50"
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
