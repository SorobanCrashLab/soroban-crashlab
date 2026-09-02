'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  WebhookDeliveryHistoryItem,
  DeliveryStatusFilter,
  DeliveryStats,
  formatStatusCode,
  getStatusBadgeClass,
  formatTimestamp,
  computeDeliveryStats,
  filterDeliveryItems,
} from '../../../webhook-retry-dashboard-utils';
import { MOCK_WEBHOOK_DELIVERY_HISTORY } from '../../../../fixtures/webhook-delivery-history';
import { ListState } from '../../../../components/ListState';

export default function WebhookRetryDashboardComponent() {
  const [items, setItems] = useState<WebhookDeliveryHistoryItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<DeliveryStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [selectedPayloadItem, setSelectedPayloadItem] = useState<WebhookDeliveryHistoryItem | null>(null);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Fetch history data from API or fall back to fixtures
  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/webhooks/history?status=${statusFilter}&search=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.data?.items ?? []);
      } else {
        // Fallback to local computation if API unavailable (e.g. static export)
        const filtered = filterDeliveryItems(MOCK_WEBHOOK_DELIVERY_HISTORY, statusFilter, searchQuery);
        setItems(filtered);
      }
    } catch {
      // Fallback
      const filtered = filterDeliveryItems(MOCK_WEBHOOK_DELIVERY_HISTORY, statusFilter, searchQuery);
      setItems(filtered);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchHistory();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [fetchHistory]);

  // Auto-refresh interval if enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchHistory();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchHistory]);

  // Trigger manual retry for a specific item
  const handleRetry = async (id: string) => {
    setRetryingId(id);
    try {
      const res = await fetch('/api/webhooks/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.data?.item) {
          // Update selected payload item if open in drawer
          if (selectedPayloadItem && selectedPayloadItem.id === id) {
            setSelectedPayloadItem(data.data.item);
          }
        }
      }
      await fetchHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger retry');
    } finally {
      setRetryingId(null);
    }
  };

  // Derived stats: recomputed reactively whenever the item list changes (e.g. after a
  // manual retry transitions an item from failed to delivered). Keeping this as a memo
  // of `items` — rather than duplicate state — guarantees the stat cards always agree
  // with the table below them without requiring a full remount or refetch.
  const stats = useMemo<DeliveryStats>(() => computeDeliveryStats(items), [items]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  return (
    <div className="space-y-8">
      {/* Header & Navigation */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-zinc-200 dark:border-zinc-800 pb-6">
        <div>
          <nav aria-label="Breadcrumb" className="mb-2">
            <ol className="flex items-center space-x-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              <li>
                <Link href="/integrations" className="hover:text-purple-600 dark:hover:text-purple-400 transition">
                  Integrations
                </Link>
              </li>
              <li>/</li>
              <li>
                <Link href="/integrations/webhooks" className="hover:text-purple-600 dark:hover:text-purple-400 transition">
                  Webhooks
                </Link>
              </li>
              <li>/</li>
              <li className="text-purple-600 dark:text-purple-400 font-bold">Retry Dashboard</li>
            </ol>
          </nav>
          <h1 className="heading-page text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
            Webhook Delivery & Retry Dashboard
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Monitor real-time delivery logs, inspect failure payloads, and trigger retries for failed event webhooks.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto">
          <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="checkbox"
            />
            Auto-refresh (10s)
          </label>

          <button
            onClick={fetchHistory}
            disabled={isLoading}
            className="btn-outline text-xs px-3 py-2 h-9 rounded-xl flex items-center gap-2"
          >
            <svg
              className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>


      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Total Deliveries
            </span>
            <div className="p-2 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          {isLoading ? (
            <div className="h-8 w-24 skeleton my-1" />
          ) : (
            <div className="text-2xl font-bold text-zinc-900 dark:text-white">
              {stats?.totalCount ?? 0}
            </div>
          )}
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Avg {stats?.averageAttempts ?? 1} attempts/delivery</span>
        </div>

        <div className="card p-5 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Success Rate
            </span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          {isLoading ? (
            <div className="h-8 w-24 skeleton my-1" />
          ) : (
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {stats?.successRate ?? 100}%
              </div>
              <span className="text-xs text-emerald-700 dark:text-emerald-300">({stats?.deliveredCount ?? 0} ok)</span>
            </div>
          )}
          <div className="mt-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${stats?.successRate ?? 100}%` }}
            />
          </div>
        </div>

        <div className="card p-5 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Failed Deliveries
            </span>
            <div className="p-2 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          {isLoading ? (
            <div className="h-8 w-24 skeleton my-1" />
          ) : (
            <div className={`text-2xl font-bold ${stats?.failedCount ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-white'}`}>
              {stats?.failedCount ?? 0}
            </div>
          )}
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Requires retry or fix</span>
        </div>

        <div className="card p-5 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Queued Retries
            </span>
            <div className="p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          {isLoading ? (
            <div className="h-8 w-24 skeleton my-1" />
          ) : (
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {stats?.queuedCount ?? 0}
              </div>
              {stats?.queuedCount ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 animate-pulse">
                  Pending
                </span>
              ) : null}
            </div>
          )}
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Scheduled for worker retry</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        {/* Status Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
          {(['all', 'delivered', 'failed', 'queued'] as DeliveryStatusFilter[]).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition uppercase tracking-wider ${
                statusFilter === st
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {st === 'all' ? 'All Logs' : st}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Search URL, event type, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field text-xs pl-9 pr-8"
          />
          <svg
            className="w-4 h-4 text-zinc-400 absolute left-3 top-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Delivery History Table */}
      <ListState
        {...(isLoading
          ? { state: 'loading' }
          : error
          ? { state: 'error', message: error, onRetry: fetchHistory }
          : items.length === 0
          ? {
              state: 'empty',
              message:
                searchQuery || statusFilter !== 'all'
                  ? 'No delivery history records match your search or filter criteria. Try clearing filters.'
                  : 'No event webhooks have been triggered yet.',
            }
          : { state: 'success' })}
      >
        <div className="card overflow-hidden bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="table-responsive">
            <table className="data-table w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Delivery ID & Event</th>
                  <th className="py-3 px-4">Endpoint URL</th>
                  <th className="py-3 px-4">HTTP Status</th>
                  <th className="py-3 px-4">Attempts</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-sm">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    {/* Status Badge */}
                    <td className="py-3 px-4">
                      <span className={`badge ${getStatusBadgeClass(item.status)} text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider`}>
                        {item.status}
                      </span>
                    </td>

                    {/* Delivery ID & Event */}
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-zinc-900 dark:text-white text-xs font-mono">{item.id}</span>
                        <span className="inline-block mt-0.5 text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                          {item.eventType}
                        </span>
                      </div>
                    </td>

                    {/* Endpoint URL */}
                    <td className="py-3 px-4">
                      <span
                        className="font-mono text-xs text-zinc-700 dark:text-zinc-300 truncate max-w-xs block"
                        title={item.url}
                      >
                        {item.url}
                      </span>
                    </td>

                    {/* HTTP Status Code */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-bold font-mono ${
                          item.statusCode && item.statusCode >= 200 && item.statusCode < 300
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                        }`}
                      >
                        {formatStatusCode(item.statusCode)}
                      </span>
                    </td>

                    {/* Attempts */}
                    <td className="py-3 px-4 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {item.attempts} / {item.maxAttempts}
                    </td>

                    {/* Timestamp */}
                    <td className="py-3 px-4 text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                      {formatTimestamp(item.lastAttemptedAt || item.createdAt)}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedPayloadItem(item)}
                          className="px-2.5 py-1 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-lg transition"
                          title="Inspect payload and response headers"
                        >
                          Payload
                        </button>

                        <button
                          onClick={() => handleRetry(item.id)}
                          disabled={retryingId === item.id || item.status === 'delivered'}
                          className={`px-3 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 ${
                            item.status === 'delivered'
                              ? 'opacity-40 cursor-not-allowed text-zinc-400 bg-zinc-100 dark:bg-zinc-800'
                              : 'bg-purple-600 text-white hover:bg-purple-700 active:scale-95 shadow-xs'
                          }`}
                        >
                          {retryingId === item.id ? (
                            <>
                              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                              Retrying...
                            </>
                          ) : (
                            'Retry'
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </ListState>

      {/* Payload Inspector Modal / Drawer */}
      {selectedPayloadItem && (
        <div className="modal-overlay" onClick={() => setSelectedPayloadItem(null)}>
          <div
            className="modal-content max-w-2xl p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4 mb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                  Delivery Payload Inspector
                </span>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-mono mt-0.5">
                  {selectedPayloadItem.id} ({selectedPayloadItem.eventType})
                </h3>
              </div>
              <button
                onClick={() => setSelectedPayloadItem(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* Endpoint & Status info */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200/60 dark:border-zinc-800">
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400 block font-semibold">Endpoint:</span>
                  <span className="font-mono text-zinc-800 dark:text-zinc-200 truncate block">{selectedPayloadItem.url}</span>
                </div>
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400 block font-semibold">Status Code:</span>
                  <span className="font-bold text-purple-600 dark:text-purple-400 font-mono">
                    {formatStatusCode(selectedPayloadItem.statusCode)}
                  </span>
                </div>
              </div>

              {/* Error Message if present */}
              {selectedPayloadItem.error && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs">
                  <span className="font-bold text-rose-600 dark:text-rose-400 block mb-1">Failure Reason:</span>
                  <p className="font-mono text-rose-700 dark:text-rose-300">{selectedPayloadItem.error}</p>
                </div>
              )}

              {/* JSON Payload Block */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Request Body Payload</span>
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(selectedPayloadItem.payload, null, 2))}
                    className="text-xs text-purple-600 dark:text-purple-400 hover:underline font-semibold"
                  >
                    {copiedPayload ? '✓ Copied!' : 'Copy JSON'}
                  </button>
                </div>
                <pre className="p-4 bg-zinc-950 text-purple-300 text-xs font-mono rounded-xl overflow-x-auto max-h-48 border border-zinc-800">
                  {JSON.stringify(selectedPayloadItem.payload, null, 2)}
                </pre>
              </div>

              {/* Response Body if present */}
              {selectedPayloadItem.responseBody && (
                <div>
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                    Server Response Body
                  </span>
                  <pre className="p-3 bg-zinc-100 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-300 text-xs font-mono rounded-xl overflow-x-auto border border-zinc-200 dark:border-zinc-800">
                    {selectedPayloadItem.responseBody}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 pt-4 mt-4">
              <button
                onClick={() => setSelectedPayloadItem(null)}
                className="btn-outline text-xs px-4 py-2 h-9"
              >
                Close
              </button>
              <button
                onClick={() => handleRetry(selectedPayloadItem.id)}
                disabled={retryingId === selectedPayloadItem.id || selectedPayloadItem.status === 'delivered'}
                className="btn-primary text-xs px-5 py-2 h-9"
              >
                {retryingId === selectedPayloadItem.id ? 'Retrying...' : 'Trigger Retry Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
