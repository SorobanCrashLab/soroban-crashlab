'use client';

import { useState, useMemo } from 'react';

/**
 * API Error Report Page
 * 
 * Visualizes recurring API errors with counts and top occurrences.
 * Provides filtering, sorting, and detailed error information.
 * 
 * Acceptance Criteria:
 * - Shows counts and top occurrences
 * - Loading and error states handled
 * - Keyboard accessible
 * - Responsive layout
 * 
 * Issue: #57 - Add API error report page
 */

export interface ApiError {
  id: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  statusCode: number;
  errorMessage: string;
  count: number;
  firstOccurrence: string;
  lastOccurrence: string;
  affectedRuns: string[];
}

interface ApiErrorReportPageProps {
  errors?: ApiError[];
  loading?: boolean;
  error?: string;
}

// Mock data for demonstration
const MOCK_API_ERRORS: ApiError[] = [
  {
    id: 'err-001',
    endpoint: '/api/simulate-transaction',
    method: 'POST',
    statusCode: 503,
    errorMessage: 'Service Unavailable: RPC node temporarily offline',
    count: 47,
    firstOccurrence: '2026-04-20T10:15:00Z',
    lastOccurrence: '2026-04-23T09:30:00Z',
    affectedRuns: ['run-1001', 'run-1005', 'run-1012', 'run-1018'],
  },
  {
    id: 'err-002',
    endpoint: '/api/get-ledger-entries',
    method: 'GET',
    statusCode: 429,
    errorMessage: 'Rate Limit Exceeded: Too many requests',
    count: 32,
    firstOccurrence: '2026-04-21T14:22:00Z',
    lastOccurrence: '2026-04-23T08:45:00Z',
    affectedRuns: ['run-1003', 'run-1007', 'run-1015'],
  },
  {
    id: 'err-003',
    endpoint: '/api/send-transaction',
    method: 'POST',
    statusCode: 400,
    errorMessage: 'Bad Request: Invalid transaction envelope',
    count: 28,
    firstOccurrence: '2026-04-19T16:30:00Z',
    lastOccurrence: '2026-04-22T18:20:00Z',
    affectedRuns: ['run-1002', 'run-1009', 'run-1014'],
  },
  {
    id: 'err-004',
    endpoint: '/api/get-account',
    method: 'GET',
    statusCode: 404,
    errorMessage: 'Not Found: Account does not exist',
    count: 19,
    firstOccurrence: '2026-04-20T11:00:00Z',
    lastOccurrence: '2026-04-23T07:15:00Z',
    affectedRuns: ['run-1004', 'run-1011'],
  },
  {
    id: 'err-005',
    endpoint: '/api/simulate-transaction',
    method: 'POST',
    statusCode: 500,
    errorMessage: 'Internal Server Error: Contract execution failed',
    count: 15,
    firstOccurrence: '2026-04-21T09:45:00Z',
    lastOccurrence: '2026-04-23T06:30:00Z',
    affectedRuns: ['run-1006', 'run-1013'],
  },
  {
    id: 'err-006',
    endpoint: '/api/get-events',
    method: 'GET',
    statusCode: 408,
    errorMessage: 'Request Timeout: Query took too long',
    count: 12,
    firstOccurrence: '2026-04-22T12:00:00Z',
    lastOccurrence: '2026-04-23T05:00:00Z',
    affectedRuns: ['run-1008'],
  },
  {
    id: 'err-007',
    endpoint: '/api/get-transaction',
    method: 'GET',
    statusCode: 502,
    errorMessage: 'Bad Gateway: Upstream server error',
    count: 8,
    firstOccurrence: '2026-04-22T15:30:00Z',
    lastOccurrence: '2026-04-23T04:00:00Z',
    affectedRuns: ['run-1010'],
  },
];

const STATUS_CODE_COLORS: Record<number, string> = {
  400: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-200 dark:border-yellow-800',
  404: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border-orange-200 dark:border-orange-800',
  408: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800',
  429: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-800',
  500: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800',
  502: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800',
  503: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800',
};

const getStatusCodeColor = (code: number): string => {
  return STATUS_CODE_COLORS[code] || 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700';
};

const formatDate = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getStatusCodeCategory = (code: number): string => {
  if (code >= 400 && code < 500) return 'Client Error';
  if (code >= 500) return 'Server Error';
  return 'Unknown';
};

export default function ApiErrorReportPage({
  errors = MOCK_API_ERRORS,
  loading = false,
  error = undefined,
}: ApiErrorReportPageProps) {
  const [sortBy, setSortBy] = useState<'count' | 'recent' | 'status'>('count');
  const [filterStatus, setFilterStatus] = useState<'all' | 'client' | 'server'>('all');
  const [expandedError, setExpandedError] = useState<string | null>(null);

  const sortedAndFilteredErrors = useMemo(() => {
    let filtered = errors;

    // Filter by status code category
    if (filterStatus === 'client') {
      filtered = filtered.filter(e => e.statusCode >= 400 && e.statusCode < 500);
    } else if (filterStatus === 'server') {
      filtered = filtered.filter(e => e.statusCode >= 500);
    }

    // Sort
    const sorted = [...filtered];
    if (sortBy === 'count') {
      sorted.sort((a, b) => b.count - a.count);
    } else if (sortBy === 'recent') {
      sorted.sort((a, b) => new Date(b.lastOccurrence).getTime() - new Date(a.lastOccurrence).getTime());
    } else if (sortBy === 'status') {
      sorted.sort((a, b) => a.statusCode - b.statusCode);
    }

    return sorted;
  }, [errors, sortBy, filterStatus]);

  const totalErrors = errors.reduce((sum, e) => sum + e.count, 0);
  const uniqueEndpoints = new Set(errors.map(e => e.endpoint)).size;
  const clientErrors = errors.filter(e => e.statusCode >= 400 && e.statusCode < 500).reduce((sum, e) => sum + e.count, 0);
  const serverErrors = errors.filter(e => e.statusCode >= 500).reduce((sum, e) => sum + e.count, 0);

  if (loading) {
    return (
      <div className="w-full max-w-6xl mx-auto p-6">
        <div className="mb-8">
          <div className="h-8 w-64 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse mb-2" />
          <div className="h-4 w-96 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-6xl mx-auto p-6">
        <div className="border border-red-200 dark:border-red-900/50 rounded-xl p-8 bg-red-50/60 dark:bg-red-950/20 text-center">
          <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <p className="font-semibold text-red-900 dark:text-red-100 mb-2">Failed to load API error report</p>
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
          API Error Report
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Recurring API errors detected during fuzzing runs
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Total Errors</div>
          <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">{totalErrors}</div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Unique Endpoints</div>
          <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">{uniqueEndpoints}</div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Client Errors (4xx)</div>
          <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{clientErrors}</div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Server Errors (5xx)</div>
          <div className="text-3xl font-bold text-red-600 dark:text-red-400">{serverErrors}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Sort by</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'count' | 'recent' | 'status')}
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="count">Error Count</option>
              <option value="recent">Most Recent</option>
              <option value="status">Status Code</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Filter</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | 'client' | 'server')}
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Errors</option>
              <option value="client">Client Errors (4xx)</option>
              <option value="server">Server Errors (5xx)</option>
            </select>
          </label>
        </div>

        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          Showing {sortedAndFilteredErrors.length} of {errors.length} errors
        </div>
      </div>

      {/* Error List */}
      {sortedAndFilteredErrors.length === 0 ? (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-12 bg-zinc-50 dark:bg-zinc-900/50 text-center">
          <div className="h-16 w-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-zinc-600 dark:text-zinc-400 font-medium">No errors match the current filter</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedAndFilteredErrors.map((apiError) => {
            const isExpanded = expandedError === apiError.id;

            return (
              <div
                key={apiError.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden transition-all hover:shadow-md"
              >
                <button
                  onClick={() => setExpandedError(isExpanded ? null : apiError.id)}
                  className="w-full p-6 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-mono font-bold border ${getStatusCodeColor(apiError.statusCode)}`}>
                          {apiError.statusCode}
                        </span>
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-mono font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                          {apiError.method}
                        </span>
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">
                          {getStatusCodeCategory(apiError.statusCode)}
                        </span>
                      </div>
                      <div className="font-mono text-sm text-zinc-900 dark:text-zinc-50 mb-2">
                        {apiError.endpoint}
                      </div>
                      <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
                        {apiError.errorMessage}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                        <span>Last: {formatDate(apiError.lastOccurrence)}</span>
                        <span>•</span>
                        <span>{apiError.affectedRuns.length} affected runs</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                          {apiError.count}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          occurrences
                        </div>
                      </div>
                      <svg
                        className={`w-5 h-5 text-zinc-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-zinc-200 dark:border-zinc-800 p-6 bg-zinc-50 dark:bg-zinc-900/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
                          Timeline
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-zinc-600 dark:text-zinc-400">First occurrence:</span>
                            <span className="font-mono text-zinc-900 dark:text-zinc-50">
                              {formatDate(apiError.firstOccurrence)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-600 dark:text-zinc-400">Last occurrence:</span>
                            <span className="font-mono text-zinc-900 dark:text-zinc-50">
                              {formatDate(apiError.lastOccurrence)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-600 dark:text-zinc-400">Total count:</span>
                            <span className="font-bold text-zinc-900 dark:text-zinc-50">
                              {apiError.count}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
                          Affected Runs ({apiError.affectedRuns.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {apiError.affectedRuns.map((runId) => (
                            <a
                              key={runId}
                              href={`/?run=${runId}`}
                              className="inline-flex items-center px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-mono hover:bg-blue-200 dark:hover:bg-blue-900/50 transition"
                            >
                              {runId}
                            </a>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
