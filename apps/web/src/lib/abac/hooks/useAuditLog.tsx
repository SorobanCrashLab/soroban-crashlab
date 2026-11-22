/**
 * Audit Log hooks for React components.
 *
 * Provides hooks for reading and exporting audit events.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { BaseAuditEvent } from '../audit/AuditLogger';
import { AUDIT_LOG_KEY } from '../audit/AuditLogger';

// ─── Audit Log State Types ───────────────────────────────────────────────────

export interface AuditLogFilters {
  category?: string;
  principalId?: string;
  action?: string;
  decision?: 'permit' | 'deny';
  since?: Date;
  until?: Date;
  search?: string;
}

export interface AuditLogEntry extends BaseAuditEvent {
  /** Formatted timestamp */
  formattedTime?: string;
}

export interface UseAuditLogResult {
  /** Events */
  events: AuditLogEntry[];
  /** Loading state */
  loading: boolean;
  /** Total count */
  total: number;
  /** Error state */
  error: string | null;
  /** Filters */
  filters: AuditLogFilters;
  /** Set filters */
  setFilters: (filters: AuditLogFilters) => void;
  /** Refresh events */
  refresh: () => void;
  /** Export events */
  export: (format: 'json' | 'csv' | 'syslog') => Promise<string>;
  /** Page next */
  pageNext: () => void;
  /** Page previous */
  pagePrev: () => void;
  /** Current page */
  page: number;
  /** Page size */
  pageSize: number;
}

// ─── Use Audit Log Hook ──────────────────────────────────────────────────────

/**
 * Hook for reading audit events.
 */
export function useAuditLog(options: {
  pageSize?: number;
  initialFilters?: AuditLogFilters;
  autoRefresh?: boolean;
  refreshIntervalMs?: number;
} = {}): UseAuditLogResult {
  const pageSize = options.pageSize ?? 50;
  const [events, setEvents] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFiltersState] = useState<AuditLogFilters>(options.initialFilters ?? {});

  useEffect(() => {
    fetchEvents();
  }, [page, filters]);

  useEffect(() => {
    if (!options.autoRefresh) return;

    const interval = setInterval(fetchEvents, options.refreshIntervalMs ?? 60000);
    return () => clearInterval(interval);
  }, [options.autoRefresh, options.refreshIntervalMs, page, filters]);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(pageSize));
      params.set('offset', String((page - 1) * pageSize));

      if (filters.category) params.set('category', filters.category);
      if (filters.principalId) params.set('principalId', filters.principalId);
      if (filters.action) params.set('action', filters.action);
      if (filters.decision) params.set('decision', filters.decision);
      if (filters.since) params.set('since', filters.since.toISOString());
      if (filters.until) params.set('until', filters.until.toISOString());
      if (filters.search) params.set('search', filters.search);

      const response = await fetch(`/api/audit/events?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch audit events: ${response.status}`);
      }

      const data = await response.json() as { events: AuditLogEntry[]; total: number };
      setEvents(data.events);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const setFilters = useCallback((newFilters: AuditLogFilters) => {
    setFiltersState(newFilters);
    setPage(1); // Reset to first page on filter change
  }, []);

  const refresh = useCallback(() => {
    fetchEvents();
  }, [page, filters]);

  const pageNext = useCallback(() => {
    if ((page * pageSize) < total) {
      setPage(p => p + 1);
    }
  }, [page, pageSize, total]);

  const pagePrev = useCallback(() => {
    if (page > 1) {
      setPage(p => p - 1);
    }
  }, [page]);

  const exportEvents = useCallback(async (format: 'json' | 'csv' | 'syslog') => {
    const params = new URLSearchParams();
    params.set('format', format);

    if (filters.category) params.set('category', filters.category);
    if (filters.principalId) params.set('principalId', filters.principalId);
    if (filters.action) params.set('action', filters.action);
    if (filters.decision) params.set('decision', filters.decision);
    if (filters.since) params.set('since', filters.since.toISOString());
    if (filters.until) params.set('until', filters.until.toISOString());
    if (filters.search) params.set('search', filters.search);

    const response = await fetch(`/api/audit/export?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Failed to export audit events: ${response.status}`);
    }

    return await response.text();
  }, [filters]);

  return {
    events,
    loading,
    total,
    error,
    filters,
    setFilters,
    refresh,
    export: exportEvents,
    pageNext,
    pagePrev,
    page,
    pageSize,
  };
}

// ─── Use Audit Events by Principal Hook ──────────────────────────────────────

/**
 * Hook for getting audit events for the current principal.
 */
export function usePrincipalAuditEvents(limit = 100) {
  const [events, setEvents] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvents();
  }, [limit]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/audit/my-events?limit=${limit}`);
      if (response.ok) {
        const data = await response.json() as { events: AuditLogEntry[] };
        setEvents(data.events);
      } else {
        setError('Failed to fetch events');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return { events, loading, error, refresh: fetchEvents };
}

// ─── Use Authorization Statistics Hook ────────────────────────────────────

export interface AuthorizationStats {
  total: number;
  permitted: number;
  denied: number;
  byAction: Record<string, number>;
  byPolicy: Record<string, number>;
  byDecision: Record<'permit' | 'deny', number>;
  recent: Array<{
    timestamp: string;
    principal: string;
    action: string;
    decision: 'permit' | 'deny';
    policyId?: string;
  }>;
}

/**
 * Hook for getting authorization statistics.
 */
export function useAuthorizationStats(since?: Date, until?: Date) {
  const [stats, setStats] = useState<AuthorizationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, [since, until]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (since) params.set('since', since.toISOString());
      if (until) params.set('until', until.toISOString());

      const response = await fetch(`/api/audit/stats?${params.toString()}`);
      if (response.ok) {
        const data = await response.json() as AuthorizationStats;
        setStats(data);
      } else {
        setError('Failed to fetch stats');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return { stats, loading, error, refresh: fetchStats };
}

// ─── Use Active Policies Hook ────────────────────────────────────────────────

export interface ActivePolicy {
  id: string;
  name: string;
  version: string;
  description?: string;
  tags?: string[];
  active: boolean;
  lastTestedAt?: string;
  testResults?: { passed: number; failed: number };
}

/**
 * Hook for getting active policies.
 */
export function useActivePolicies() {
  const [policies, setPolicies] = useState<ActivePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/abac/policies');
      if (response.ok) {
        const data = await response.json() as ActivePolicy[];
        setPolicies(data);
      } else {
        setError('Failed to fetch policies');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return { policies, loading, error, refresh: fetchPolicies };
}

// ─── Use Policy Tests Hook ─────────────────────────────────────────────────

/**
 * Hook for testing policies.
 */
export function usePolicyTests() {
  const [testResults, setTestResults] = useState<{
    policyId: string;
    total: number;
    passed: number;
    failed: number;
    durationMs: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runTests = async (policyId: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/abac/policies/${policyId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        setTestResults(data);
      } else {
        setError('Failed to run tests');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return { testResults, loading, error, runTests };
}