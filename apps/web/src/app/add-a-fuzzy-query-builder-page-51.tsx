'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FuzzingRun } from './types';

/* ── Types ─────────────────────────────────────────────────────────── */

export interface QueryFilter {
  id: string;
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'between' | 'in';
  value: string | number | string[];
  value2?: string | number; // For 'between' operator
}

export interface SavedQuery {
  id: string;
  name: string;
  filters: QueryFilter[];
  createdAt: string;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const STORAGE_KEY = 'crashlab-saved-queries';

const FIELD_OPTIONS = [
  { value: 'status', label: 'Status', type: 'select', options: ['running', 'completed', 'failed', 'cancelled'] },
  { value: 'area', label: 'Area', type: 'select', options: ['auth', 'state', 'budget', 'xdr'] },
  { value: 'severity', label: 'Severity', type: 'select', options: ['low', 'medium', 'high', 'critical'] },
  { value: 'duration', label: 'Duration (ms)', type: 'number' },
  { value: 'seedCount', label: 'Seed Count', type: 'number' },
  { value: 'cpuInstructions', label: 'CPU Instructions', type: 'number' },
  { value: 'memoryBytes', label: 'Memory Bytes', type: 'number' },
  { value: 'minResourceFee', label: 'Min Resource Fee', type: 'number' },
  { value: 'crashDetail.failureCategory', label: 'Failure Category', type: 'text' },
  { value: 'crashDetail.signature', label: 'Crash Signature', type: 'text' },
];

const OPERATOR_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  select: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'in', label: 'In' },
  ],
  number: [
    { value: 'equals', label: 'Equals' },
    { value: 'greater_than', label: 'Greater Than' },
    { value: 'less_than', label: 'Less Than' },
    { value: 'between', label: 'Between' },
  ],
  text: [
    { value: 'contains', label: 'Contains' },
    { value: 'equals', label: 'Equals' },
  ],
};

/* ── Helpers ────────────────────────────────────────────────────────── */

function loadQueries(): SavedQuery[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedQuery[]) : [];
  } catch {
    return [];
  }
}

function saveQueries(queries: SavedQuery[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queries));
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current: unknown, key) => (current as Record<string, unknown>)?.[key], obj);
}

function applyFilter(run: FuzzingRun, filter: QueryFilter): boolean {
  const value = getNestedValue(run as unknown as Record<string, unknown>, filter.field);

  switch (filter.operator) {
    case 'equals':
      return value === filter.value;
    case 'not_equals':
      return value !== filter.value;
    case 'contains':
      return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
    case 'greater_than':
      return Number(value) > Number(filter.value);
    case 'less_than':
      return Number(value) < Number(filter.value);
    case 'between':
      return Number(value) >= Number(filter.value) && Number(value) <= Number(filter.value2);
    case 'in':
      return Array.isArray(filter.value) && filter.value.includes(String(value));
    default:
      return true;
  }
}


function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/* ── Component ──────────────────────────────────────────────────────── */

interface Props {
  runs?: FuzzingRun[];
}

export default function AddAFuzzyQueryBuilderPage51({ runs = [] }: Props) {
  const [filters, setFilters] = useState<QueryFilter[]>([]);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [queryName, setQueryName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [selectedQueryId, setSelectedQueryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load saved queries on mount
  useEffect(() => {
    setSavedQueries(loadQueries());
  }, []);

  // Persist whenever saved queries change (skip initial empty render)
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) {
      saveQueries(savedQueries);
    } else {
      mounted.current = true;
    }
  }, [savedQueries]);

  /* ── Query execution ────────────────────────────────────────────── */

  const filteredRuns = useMemo(() => {
    if (filters.length === 0) return runs;
    return runs.filter((run) => filters.every((filter) => applyFilter(run, filter)));
  }, [runs, filters]);

  /* ── Filter management ──────────────────────────────────────────── */

  const addFilter = useCallback(() => {
    const newFilter: QueryFilter = {
      id: `filter-${Date.now()}`,
      field: 'status',
      operator: 'equals',
      value: '',
    };
    setFilters((prev) => [...prev, newFilter]);
  }, []);

  const updateFilter = useCallback((id: string, updates: Partial<QueryFilter>) => {
    setFilters((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  }, []);

  const removeFilter = useCallback((id: string) => {
    setFilters((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters([]);
    setSelectedQueryId(null);
  }, []);

  /* ── Query execution ────────────────────────────────────────────── */


  /* ── Query persistence ──────────────────────────────────────────── */

  const saveQuery = useCallback(async () => {
    if (!queryName.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      // Simulate persistence delay
      await new Promise(resolve => setTimeout(resolve, 800));

      const newQuery: SavedQuery = {
        id: `query-${Date.now()}`,
        name: queryName.trim(),
        filters: [...filters],
        createdAt: new Date().toISOString(),
      };

      setSavedQueries((prev) => [...prev, newQuery]);
      setQueryName('');
      setShowSaveDialog(false);
      setSelectedQueryId(newQuery.id);
    } catch {
      setError('Failed to save query. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [queryName, filters]);

  const loadQuery = useCallback((query: SavedQuery) => {
    setFilters([...query.filters]);
    setSelectedQueryId(query.id);
  }, []);

  const deleteQuery = useCallback((id: string) => {
    setSavedQueries((prev) => prev.filter((q) => q.id !== id));
    if (selectedQueryId === id) {
      setSelectedQueryId(null);
    }
  }, [selectedQueryId]);

  /* ── Render helpers ─────────────────────────────────────────────── */

  const getFieldConfig = (fieldValue: string) => {
    return FIELD_OPTIONS.find((f) => f.value === fieldValue) || FIELD_OPTIONS[0];
  };

  const renderFilterValue = (filter: QueryFilter) => {
    const fieldConfig = getFieldConfig(filter.field);

    if (fieldConfig.type === 'select') {
      if (filter.operator === 'in') {
        return (
          <div className="flex flex-wrap gap-2">
            {fieldConfig.options?.map((opt) => (
              <label key={opt} className="inline-flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={Array.isArray(filter.value) && filter.value.includes(opt)}
                  onChange={(e) => {
                    const currentValues = Array.isArray(filter.value) ? filter.value : [];
                    const newValues = e.target.checked
                      ? [...currentValues, opt]
                      : currentValues.filter((v) => v !== opt);
                    updateFilter(filter.id, { value: newValues });
                  }}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                {opt}
              </label>
            ))}
          </div>
        );
      }
      return (
        <select
          value={String(filter.value)}
          onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
        >
          <option value="">Select...</option>
          {fieldConfig.options?.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    if (fieldConfig.type === 'number') {
      if (filter.operator === 'between') {
        return (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={String(filter.value)}
              onChange={(e) => updateFilter(filter.id, { value: Number(e.target.value) })}
              placeholder="Min"
              className="w-24 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
            />
            <span className="text-zinc-500">to</span>
            <input
              type="number"
              value={String(filter.value2 || '')}
              onChange={(e) => updateFilter(filter.id, { value2: Number(e.target.value) })}
              placeholder="Max"
              className="w-24 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
            />
          </div>
        );
      }
      return (
        <input
          type="number"
          value={String(filter.value)}
          onChange={(e) => updateFilter(filter.id, { value: Number(e.target.value) })}
          placeholder="Value"
          className="w-32 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
        />
      );
    }

    return (
      <input
        type="text"
        value={String(filter.value)}
        onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
        placeholder="Value"
        className="w-48 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
      />
    );
  };

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <section aria-label="Fuzzy query builder" className="w-full">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Fuzzy Query Builder</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Build complex queries to filter fuzzing runs. Save queries for reuse.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Query Builder Panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Query Filters</h3>
              <div className="flex gap-2">
                <button
                  onClick={addFilter}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition"
                >
                  + Add Filter
                </button>
                {filters.length > 0 && (
                  <button
                    onClick={clearFilters}
                    className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {filters.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                <p>No filters added yet.</p>
                <p className="text-sm mt-1">Click &quot;+ Add Filter&quot; to start building your query.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filters.map((filter, index) => (
                  <div
                    key={filter.id}
                    className="flex flex-wrap items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg"
                  >
                    {index > 0 && (
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                        AND
                      </span>
                    )}
                    <select
                      value={filter.field}
                      onChange={(e) => {
                        const newField = e.target.value;
                        const fieldConfig = getFieldConfig(newField);
                        const defaultOperator = OPERATOR_OPTIONS[fieldConfig.type]?.[0]?.value || 'equals';
                        updateFilter(filter.id, {
                          field: newField,
                          operator: defaultOperator as unknown as QueryFilter['operator'],
                          value: '',
                          value2: undefined,
                        });
                      }}
                      className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
                    >
                      {FIELD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <select
                      value={filter.operator}
                      onChange={(e) => updateFilter(filter.id, { operator: e.target.value as unknown as QueryFilter['operator'] })}
                      className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
                    >
                      {OPERATOR_OPTIONS[getFieldConfig(filter.field).type]?.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {renderFilterValue(filter)}
                    <button
                      onClick={() => removeFilter(filter.id)}
                      className="ml-auto text-zinc-400 hover:text-red-500 transition"
                      aria-label="Remove filter"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {filters.length > 0 && (
              <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium">{filteredRuns.length}</span> of {runs.length} runs match
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowSaveDialog(true)}
                      className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
                    >
                      Save Query
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Results */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
            <h3 className="text-lg font-semibold mb-4">Query Results</h3>
            {filteredRuns.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                No runs match the current query.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-700">
                      <th className="text-left py-2 px-3 font-medium">ID</th>
                      <th className="text-left py-2 px-3 font-medium">Status</th>
                      <th className="text-left py-2 px-3 font-medium">Area</th>
                      <th className="text-left py-2 px-3 font-medium">Severity</th>
                      <th className="text-left py-2 px-3 font-medium">Duration</th>
                      <th className="text-left py-2 px-3 font-medium">Seeds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRuns.slice(0, 20).map((run) => (
                      <tr key={run.id} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td className="py-2 px-3 font-mono">{run.id}</td>
                        <td className="py-2 px-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            run.status === 'running' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                            run.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                            run.status === 'failed' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                            'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                          }`}>
                            {run.status}
                          </span>
                        </td>
                        <td className="py-2 px-3">{run.area}</td>
                        <td className="py-2 px-3">
                          <span className={`${
                            run.severity === 'critical' ? 'text-red-600 dark:text-red-400' :
                            run.severity === 'high' ? 'text-orange-600 dark:text-orange-400' :
                            run.severity === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
                            'text-green-600 dark:text-green-400'
                          }`}>
                            {run.severity}
                          </span>
                        </td>
                        <td className="py-2 px-3">{formatDuration(run.duration)}</td>
                        <td className="py-2 px-3">{run.seedCount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredRuns.length > 20 && (
                  <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 text-center">
                    Showing 20 of {filteredRuns.length} results
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Saved Queries Panel */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
            <h3 className="text-lg font-semibold mb-4">Saved Queries</h3>
            {savedQueries.length === 0 ? (
              <div className="text-center py-4 text-zinc-500 dark:text-zinc-400 text-sm">
                No saved queries yet.
              </div>
            ) : (
              <div className="space-y-2">
                {savedQueries.map((query) => (
                  <div
                    key={query.id}
                    className={`p-3 rounded-lg border cursor-pointer transition ${
                      selectedQueryId === query.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                        : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    }`}
                    onClick={() => loadQuery(query)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{query.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteQuery(query.id);
                        }}
                        className="text-zinc-400 hover:text-red-500 transition"
                        aria-label="Delete query"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      {query.filters.length} filter{query.filters.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Query Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Save Query</h3>
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-xs">
                {error}
              </div>
            )}
            <input
              type="text"
              value={queryName}
              onChange={(e) => setQueryName(e.target.value)}
              placeholder="Query name"
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm mb-4"
              autoFocus
              disabled={isLoading}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={saveQuery}
                disabled={!queryName.trim() || isLoading}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
