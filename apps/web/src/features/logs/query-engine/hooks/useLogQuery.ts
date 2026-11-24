'use client';

/**
 * State orchestration for the structured log workbench (#075).
 * Historical search and live tail share one QueryState so saved/shareable
 * links restore the exact investigation context.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_LOG_IDENTITY,
  deleteSavedQuery as removeSavedQuery,
  loadRecentQueries,
  loadSavedQueries,
  pushRecentQuery,
  saveQuery as persistQuery,
  searchLogs,
  tailLogs,
  type LogIdentity,
} from '@/lib/logs/client';
import { parseQuery } from '../dsl/parser';
import { buildShareUrl, readStateFromUrl } from '../dsl/serializer';
import type {
  FacetResult,
  HistogramBucket,
  LogEvent,
  QueryState,
  SavedQuery,
  SearchStats,
  TailNotice,
} from '@/lib/logs/types';

const DEFAULT_WINDOW_MS = 6 * 60 * 60 * 1000;
const LIVE_POLL_MS = 2_000;
const LIVE_BUFFER_LIMIT = 5_000;

function defaultState(): QueryState {
  const now = Date.now();
  return {
    query: '',
    from: now - DEFAULT_WINDOW_MS,
    to: now,
    facets: {},
    sort: 'desc',
    mode: 'historical',
    histogramRange: null,
  };
}

function readInitialState(): QueryState {
  if (typeof window === 'undefined') return defaultState();
  const fromUrl = readStateFromUrl(window.location.search);
  const queryParam = new URLSearchParams(window.location.search).get('query');
  return {
    ...(fromUrl ?? defaultState()),
    ...(queryParam ? { query: queryParam } : {}),
  };
}

export interface UseLogQueryResult {
  state: QueryState;
  parsed: ReturnType<typeof parseQuery>;
  events: LogEvent[];
  facets: FacetResult[];
  histogram: HistogramBucket[];
  stats: SearchStats | null;
  canonicalQuery: string;
  loading: boolean;
  fetching: boolean;
  error: string | null;
  notices: TailNotice[];
  rate: number;
  paused: boolean;
  setPaused: (paused: boolean) => void;
  identity: LogIdentity;
  setRole: (role: string) => void;
  savedQueries: SavedQuery[];
  recentQueries: QueryState[];
  pinnedIds: string[];
  togglePinned: (id: string) => void;
  shareUrl: string;
  setQuery: (query: string) => void;
  setMode: (mode: QueryState['mode']) => void;
  setSort: (sort: QueryState['sort']) => void;
  sample: number;
  setSample: (sample: number) => void;
  toggleFacet: (field: string, value: string) => void;
  clearFacets: () => void;
  setTimeRange: (from: number, to: number) => void;
  setHistogramRange: (range: [number, number] | null) => void;
  showAroundNow: () => void;
  applyState: (state: QueryState) => void;
  saveCurrentQuery: (name: string) => void;
  removeQuery: (id: string) => void;
  loadMore: () => void;
  refresh: () => void;
}

export function useLogQuery(): UseLogQueryResult {
  const [state, setState] = useState<QueryState>(readInitialState);
  const [debouncedState, setDebouncedState] = useState<QueryState>(state);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [facets, setFacets] = useState<FacetResult[]>([]);
  const [histogram, setHistogram] = useState<HistogramBucket[]>([]);
  const [stats, setStats] = useState<SearchStats | null>(null);
  const [canonicalQuery, setCanonicalQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<TailNotice[]>([]);
  const [rate, setRate] = useState(0);
  const [paused, setPaused] = useState(false);
  const [sample, setSample] = useState(1);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [identity, setIdentity] = useState<LogIdentity>(DEFAULT_LOG_IDENTITY);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>(loadSavedQueries);
  const [recentQueries, setRecentQueries] = useState<QueryState[]>(loadRecentQueries);

  const searchCursorRef = useRef<string | null>(null);
  const tailCursorRef = useRef<string>('0');
  const historicalAbortRef = useRef<AbortController | null>(null);

  const parsed = useMemo(() => parseQuery(state.query), [state.query]);
  const shareUrl = useMemo(
    () => typeof window === 'undefined' ? '/logs' : buildShareUrl(`${window.location.origin}/logs`, state),
    [state],
  );

  // The role is server-resolved; the header is only a transport for it.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/roles/me', { headers: { Accept: 'application/json' } })
      .then((response) => response.ok ? response.json() : null)
      .then((payload: { role?: string } | null) => {
        if (!cancelled && payload?.role) {
          setIdentity({ user: 'log-viewer', role: payload.role });
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedState(state), 250);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.history.replaceState(null, '', buildShareUrl(window.location.href, state));
  }, [state]);

  const runSearch = useCallback(async (target: QueryState, cursor: string | null, append: boolean) => {
    historicalAbortRef.current?.abort();
    const controller = new AbortController();
    historicalAbortRef.current = controller;
    setFetching(true);
    setError(null);
    try {
      const response = await searchLogs({
        query: target.query,
        from: target.from,
        to: target.to,
        facets: target.facets,
        sort: target.sort,
        cursor,
        limit: 200,
        sample,
        histogram: target.histogramRange ?? [target.from, target.to],
      }, identity, controller.signal);
      if (controller.signal.aborted) return;
      searchCursorRef.current = response.nextCursor;
      setRecentQueries(pushRecentQuery(target));
      setEvents((current) => append ? [...current, ...response.events] : response.events);
      setFacets(response.facets);
      setHistogram(response.histogram);
      setStats(response.stats);
      setCanonicalQuery(response.canonicalQuery);
      setNotices(response.stats.partial ? [{
        kind: 'dropped',
        count: response.stats.scanned,
        message: 'Broad query reached the server scan cap; narrow the time range for complete results.',
      }] : []);
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : 'Unable to search logs.');
    } finally {
      if (!controller.signal.aborted) {
        setFetching(false);
        setLoading(false);
      }
    }
  }, [sample, identity]);

  // Historical search: keep prior results visible while the next page loads.
  useEffect(() => {
    if (state.mode !== 'historical') return;
    searchCursorRef.current = null;
    tailCursorRef.current = '0';
    let cancelled = false;
    // Defer into a microtask so the effect body never performs a synchronous
    // state update (which would cascade renders on every query keystroke).
    queueMicrotask(() => {
      if (!cancelled) void runSearch(debouncedState, null, false);
    });
    return () => {
      cancelled = true;
      historicalAbortRef.current?.abort();
    };
  }, [debouncedState, runSearch, state.mode]);

  // Live tail with pause-on-inspect and bounded buffer.
  useEffect(() => {
    if (state.mode !== 'live' || paused) return;
    let cancelled = false;
    const controller = new AbortController();
    const poll = async (): Promise<void> => {
      try {
        const response = await tailLogs({
          cursor: tailCursorRef.current,
          query: state.query,
          limit: 50,
          sample,
        }, identity, controller.signal);
        if (cancelled) return;
        tailCursorRef.current = response.cursor;
        setRate(response.rate);
        setNotices(response.notices);
        setEvents((current) => {
          const known = new Set(current.map((event) => event.id));
          const merged = [...current, ...response.events.filter((event) => !known.has(event.id))];
          const overflow = Math.max(0, merged.length - LIVE_BUFFER_LIMIT);
          if (overflow > 0) {
            setNotices((existing) => [...existing, {
              kind: 'dropped', count: overflow, message: `${overflow} buffered events dropped to keep the tail responsive.`,
            }]);
          }
          return merged.slice(-LIVE_BUFFER_LIMIT);
        });
        setError(null);
        setLoading(false);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Live tail failed.');
      }
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [state.mode, state.query, paused, sample, identity]);

  const setQuery = useCallback((query: string) => setState((current) => ({ ...current, query })), []);
  const setMode = useCallback((mode: QueryState['mode']) => setState((current) => ({ ...current, mode })), []);
  const setSort = useCallback((sort: QueryState['sort']) => setState((current) => ({ ...current, sort })), []);
  const toggleFacet = useCallback((field: string, value: string) => {
    setState((current) => {
      const values = current.facets[field] ?? [];
      const nextValues = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
      const facets = { ...current.facets };
      if (nextValues.length === 0) delete facets[field];
      else facets[field] = nextValues;
      return { ...current, facets };
    });
  }, []);
  const clearFacets = useCallback(() => setState((current) => ({ ...current, facets: {} })), []);
  const setTimeRange = useCallback((from: number, to: number) => setState((current) => ({ ...current, from, to })), []);
  const setHistogramRange = useCallback((range: [number, number] | null) => setState((current) => ({ ...current, histogramRange: range })), []);
  const applyState = useCallback((next: QueryState) => setState(next), []);
  const showAroundNow = useCallback(() => {
    const now = Date.now();
    setState((current) => ({ ...current, from: now - 15 * 60_000, to: now, histogramRange: null, mode: 'live' }));
    setPaused(false);
  }, []);
  const saveCurrentQuery = useCallback((name: string) => setSavedQueries(persistQuery(name, state)), [state]);
  const removeQuery = useCallback((id: string) => setSavedQueries(removeSavedQuery(id)), []);
  const togglePinned = useCallback((id: string) => {
    setPinnedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }, []);
  const loadMore = useCallback(() => {
    if (state.mode === 'historical' && searchCursorRef.current) {
      void runSearch(debouncedState, searchCursorRef.current, true);
    }
  }, [debouncedState, runSearch, state.mode]);
  const refresh = useCallback(() => {
    if (state.mode === 'historical') void runSearch(debouncedState, null, false);
    else tailCursorRef.current = '0';
  }, [debouncedState, runSearch, state.mode]);

  return {
    state, parsed, events, facets, histogram, stats, canonicalQuery,
    loading, fetching, error, notices, rate, paused, setPaused,
    identity, setRole: (role) => setIdentity((current) => ({ ...current, role })),
    savedQueries, recentQueries, pinnedIds, togglePinned, shareUrl,
    setQuery, setMode, setSort, sample, setSample,
    toggleFacet, clearFacets, setTimeRange, setHistogramRange,
    showAroundNow, applyState, saveCurrentQuery, removeQuery, loadMore, refresh,
  };
}
