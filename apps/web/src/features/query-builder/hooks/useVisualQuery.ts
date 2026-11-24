'use client';

/**
 * State and actions for the visual query builder (#2339).
 *
 * The query model is the single source of truth: DSL, JSON, explain plan and
 * validation are memoized pure derivations of it, which is what keeps the
 * visual and textual representations in lock-step. Execution goes through
 * `/api/query-builder/run`; the server re-validates with the caller's role.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { QueryResult } from '../lib/engine';
import { explainQuery, type DatasetStats, type ExplainResult } from '../lib/explain';
import {
  appendFilterNode,
  createQuery,
  defaultAlias,
  defaultValueFor,
  entitiesInQuery,
  mapFilterNode,
  moveItem,
  nextBlockId,
  pruneEntity,
  removeFilterNode,
  type AggregationBlock,
  type FilterCondition,
  type FilterGroup,
  type FilterNode,
  type QueryParam,
  type TimeWindow,
  type VisualQuery,
} from '../lib/model';
import {
  loadHistory,
  loadSavedQueries,
  persistHistory,
  persistSavedQueries,
  pushHistory,
  upsertSavedQuery,
  type HistoryEntry,
  type SavedQuery,
} from '../lib/saved';
import { ENTITIES, getField, joinableRelations, type AggregationFn, type EntityName, type Literal } from '../lib/schema';
import { canonicalQuery, encodeShareToken, parseQueryJson, queryFingerprint, serializeQuery, toDsl } from '../lib/serialize';
import { findTemplate } from '../lib/templates';
import { validateQuery, type ParamValues, type ViewerRole } from '../lib/validate';

export const RUN_ENDPOINT = '/api/query-builder/run';

function createListStore<T>(load: () => T[], persist: (items: T[]) => void) {
  let cache: T[] | null = null;
  const empty: T[] = [];
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(): T[] {
      if (cache === null) cache = load();
      return cache;
    },
    getServerSnapshot(): T[] {
      return empty;
    },
    set(next: T[]) {
      cache = next;
      persist(next);
      listeners.forEach((listener) => listener());
    },
  };
}

const savedStore = createListStore<SavedQuery>(loadSavedQueries, persistSavedQueries);
const historyStore = createListStore<HistoryEntry>(loadHistory, persistHistory);

export type RunStatus = 'idle' | 'running' | 'success' | 'error';

interface RunEnvelope {
  data?: {
    viewer?: { role: ViewerRole };
    stats?: DatasetStats;
    result?: QueryResult;
    explain?: ExplainResult;
  };
  error?: string | { message?: string };
}

export interface UseVisualQueryOptions {
  initialQuery?: VisualQuery;
  initialParams?: ParamValues;
  /** Run once on mount (embedded widgets). */
  autoRun?: boolean;
  fetcher?: typeof fetch;
}

function errorMessage(envelope: RunEnvelope, status: number): string {
  if (typeof envelope.error === 'string') return envelope.error;
  if (envelope.error?.message) return envelope.error.message;
  return `Request failed with status ${status}.`;
}

export function useVisualQuery(options: UseVisualQueryOptions = {}) {
  const fetcher = options.fetcher ?? (typeof fetch === 'undefined' ? undefined : fetch);
  const [query, setQuery] = useState<VisualQuery>(() => options.initialQuery ?? createQuery('runs'));
  const [paramValues, setParamValues] = useState<ParamValues>(() => options.initialParams ?? {});
  const [status, setStatus] = useState<RunStatus>(options.autoRun ? 'running' : 'idle');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<ViewerRole>('analyst');
  const [stats, setStats] = useState<DatasetStats>({});
  const controller = useRef<AbortController | null>(null);

  const saved = useSyncExternalStore(savedStore.subscribe, savedStore.getSnapshot, savedStore.getServerSnapshot);
  const history = useSyncExternalStore(historyStore.subscribe, historyStore.getSnapshot, historyStore.getServerSnapshot);

  const validation = useMemo(() => validateQuery(query, role), [query, role]);
  const explain = useMemo(() => explainQuery(query, stats), [query, stats]);
  const dsl = useMemo(() => toDsl(query), [query]);
  const json = useMemo(() => serializeQuery(query, 2), [query]);
  const fingerprint = useMemo(() => queryFingerprint(query), [query]);
  const shareToken = useMemo(() => encodeShareToken(query), [query]);
  // Only the source and joins decide which adapters load (and so the row
  // counts the explain plan needs); serialize them so the effect re-runs on
  // exactly that change.
  const probeKey = JSON.stringify({
    source: query.source,
    joins: query.joins.map(({ id, relation, entity, kind }) => ({ id, relation, entity, kind })),
  });

  const post = useCallback(
    async (target: VisualQuery, mode: 'run' | 'explain', params: ParamValues, signal?: AbortSignal) => {
      if (!fetcher) throw new Error('fetch is not available in this environment.');
      const response = await fetcher(RUN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: canonicalQuery(target), params, mode }),
        signal,
      });
      const envelope = (await response.json().catch(() => ({}))) as RunEnvelope;
      if (!response.ok) throw new Error(errorMessage(envelope, response.status));
      return envelope.data ?? {};
    },
    [fetcher],
  );

  // Row counts feed the client-side explain plan. Refreshed when the set of
  // entities changes; state is only set from the async callback.
  useEffect(() => {
    let cancelled = false;
    const probe = JSON.parse(probeKey) as Pick<VisualQuery, 'source' | 'joins'>;
    post({ ...createQuery(probe.source), joins: probe.joins }, 'explain', {})
      .then((data) => {
        if (cancelled) return;
        if (data.stats) setStats((previous) => ({ ...previous, ...data.stats }));
        if (data.viewer?.role) setRole(data.viewer.role);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [probeKey, post]);

  const performRun = useCallback(
    async (target: VisualQuery, params: ParamValues) => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      try {
        const data = await post(target, 'run', params, abort.signal);
        if (abort.signal.aborted) return;
        if (data.viewer?.role) setRole(data.viewer.role);
        if (data.stats) setStats((previous) => ({ ...previous, ...data.stats }));
        if (!data.result) throw new Error('The server returned no result.');
        setResult(data.result);
        setError(null);
        setStatus('success');
        historyStore.set(
          pushHistory(historyStore.getSnapshot(), {
            fingerprint: data.result.fingerprint,
            query: target,
            ranAt: new Date().toISOString(),
            tookMs: data.result.stats.tookMs,
            rows: data.result.stats.returnedRows,
            truncated: data.result.stats.truncated,
          }),
        );
      } catch (caught) {
        if ((caught as Error).name === 'AbortError') return;
        setError((caught as Error).message);
        setStatus('error');
      }
    },
    [post],
  );

  const initialRun = useRef({ autoRun: options.autoRun, query, paramValues });
  useEffect(() => {
    const initial = initialRun.current;
    if (initial.autoRun) void performRun(initial.query, initial.paramValues);
    return () => controller.current?.abort();
  }, [performRun]);

  const run = useCallback(() => {
    if (!validation.valid) {
      setError(validation.errors.map((issue) => issue.message).join(' '));
      setStatus('error');
      return;
    }
    setStatus('running');
    void performRun(query, paramValues);
  }, [paramValues, performRun, query, validation]);

  const cancel = useCallback(() => {
    controller.current?.abort();
    setStatus((current) => (current === 'running' ? 'idle' : current));
  }, []);

  // ─── composer actions ──────────────────────────────────────────────────

  const setSource = useCallback((source: EntityName) => {
    setQuery((previous) => ({ ...createQuery(source), limit: previous.limit }));
    setResult(null);
  }, []);

  const addJoin = useCallback((relationId: string, kind: 'inner' | 'left' = 'inner') => {
    setQuery((previous) => {
      const relation = joinableRelations(entitiesInQuery(previous)).find((candidate) => candidate.id === relationId);
      if (!relation) return previous;
      return { ...previous, joins: [...previous.joins, { id: nextBlockId('join'), relation: relation.id, entity: relation.to, kind }] };
    });
  }, []);

  const updateJoinKind = useCallback((id: string, kind: 'inner' | 'left') => {
    setQuery((previous) => ({ ...previous, joins: previous.joins.map((join) => (join.id === id ? { ...join, kind } : join)) }));
  }, []);

  const removeJoin = useCallback((id: string) => {
    setQuery((previous) => {
      const index = previous.joins.findIndex((join) => join.id === id);
      if (index < 0) return previous;
      // Removing a join removes every join added after it that depended on it.
      return previous.joins.slice(index).reduce((acc, join) => pruneEntity(acc, join.entity), previous);
    });
  }, []);

  const addCondition = useCallback((groupId: string, field: string) => {
    const definition = getField(field);
    if (!definition) return;
    const op = definition.type === 'timestamp' ? 'gte' : definition.type === 'string' ? 'contains' : 'eq';
    const condition: FilterCondition = {
      id: nextBlockId('cond'),
      kind: 'condition',
      field,
      op,
      value: defaultValueFor(definition.type, op, definition.enumValues),
    };
    setQuery((previous) => ({ ...previous, filters: appendFilterNode(previous.filters, groupId, condition) }));
  }, []);

  const addGroup = useCallback((parentId: string) => {
    const group: FilterGroup = { id: nextBlockId('group'), kind: 'group', combinator: 'or', negate: false, children: [] };
    setQuery((previous) => ({ ...previous, filters: appendFilterNode(previous.filters, parentId, group) }));
  }, []);

  const updateNode = useCallback((id: string, update: (node: FilterNode) => FilterNode) => {
    setQuery((previous) => ({ ...previous, filters: mapFilterNode(previous.filters, id, update) }));
  }, []);

  const removeNode = useCallback((id: string) => {
    setQuery((previous) => ({ ...previous, filters: removeFilterNode(previous.filters, id) }));
  }, []);

  const setTimeWindow = useCallback((window: TimeWindow | null) => {
    setQuery((previous) => ({ ...previous, timeWindow: window }));
  }, []);

  const toggleSelect = useCallback((field: string) => {
    setQuery((previous) => ({
      ...previous,
      select: previous.select.includes(field)
        ? previous.select.filter((ref) => ref !== field)
        : [...previous.select, field],
    }));
  }, []);

  const moveSelect = useCallback((field: string, delta: -1 | 1) => {
    setQuery((previous) => ({
      ...previous,
      select: moveItem(previous.select.map((id) => ({ id })), field, delta).map((item) => item.id),
    }));
  }, []);

  const toggleGroupBy = useCallback((field: string) => {
    setQuery((previous) => {
      if (previous.groupBy.includes(field)) {
        return {
          ...previous,
          groupBy: previous.groupBy.filter((ref) => ref !== field),
          sort: previous.sort.filter((sort) => sort.key !== field),
        };
      }
      const aggregations: AggregationBlock[] =
        previous.aggregations.length > 0
          ? previous.aggregations
          : [{ id: nextBlockId('agg'), fn: 'count', field: null, alias: 'count' }];
      return { ...previous, groupBy: [...previous.groupBy, field], aggregations };
    });
  }, []);

  const addAggregation = useCallback((fn: AggregationFn, field: string | null) => {
    setQuery((previous) => ({
      ...previous,
      aggregations: [
        ...previous.aggregations,
        { id: nextBlockId('agg'), fn, field, alias: defaultAlias(fn, field, previous.aggregations.map((agg) => agg.alias)) },
      ],
    }));
  }, []);

  const updateAggregation = useCallback((id: string, patch: Partial<Omit<AggregationBlock, 'id'>>) => {
    setQuery((previous) => {
      const before = previous.aggregations.find((agg) => agg.id === id);
      return {
        ...previous,
        aggregations: previous.aggregations.map((agg) => (agg.id === id ? { ...agg, ...patch } : agg)),
        sort:
          before && patch.alias && patch.alias !== before.alias
            ? previous.sort.map((sort) => (sort.key === before.alias ? { ...sort, key: patch.alias! } : sort))
            : previous.sort,
      };
    });
  }, []);

  const removeAggregation = useCallback((id: string) => {
    setQuery((previous) => {
      const removed = previous.aggregations.find((agg) => agg.id === id);
      return {
        ...previous,
        aggregations: previous.aggregations.filter((agg) => agg.id !== id),
        sort: previous.sort.filter((sort) => sort.key !== removed?.alias),
      };
    });
  }, []);

  const moveAggregation = useCallback((id: string, delta: -1 | 1) => {
    setQuery((previous) => ({ ...previous, aggregations: moveItem(previous.aggregations, id, delta) }));
  }, []);

  const addSort = useCallback((key: string) => {
    setQuery((previous) =>
      previous.sort.some((sort) => sort.key === key)
        ? previous
        : { ...previous, sort: [...previous.sort, { id: nextBlockId('sort'), key, direction: 'desc' }] },
    );
  }, []);

  const updateSort = useCallback((id: string, patch: Partial<{ key: string; direction: 'asc' | 'desc' }>) => {
    setQuery((previous) => ({ ...previous, sort: previous.sort.map((sort) => (sort.id === id ? { ...sort, ...patch } : sort)) }));
  }, []);

  const removeSort = useCallback((id: string) => {
    setQuery((previous) => ({ ...previous, sort: previous.sort.filter((sort) => sort.id !== id) }));
  }, []);

  const moveSort = useCallback((id: string, delta: -1 | 1) => {
    setQuery((previous) => ({ ...previous, sort: moveItem(previous.sort, id, delta) }));
  }, []);

  const setLimit = useCallback((limit: number) => {
    setQuery((previous) => ({ ...previous, limit: Number.isFinite(limit) ? Math.trunc(limit) : previous.limit }));
  }, []);

  const addParam = useCallback((param: QueryParam) => {
    setQuery((previous) =>
      previous.params.some((candidate) => candidate.name === param.name)
        ? previous
        : { ...previous, params: [...previous.params, param] },
    );
  }, []);

  const removeParam = useCallback((name: string) => {
    setQuery((previous) => ({ ...previous, params: previous.params.filter((param) => param.name !== name) }));
    setParamValues((previous) => {
      const next = { ...previous };
      delete next[name];
      return next;
    });
  }, []);

  const setParamValue = useCallback((name: string, value: Literal | null) => {
    setParamValues((previous) => ({ ...previous, [name]: value }));
  }, []);

  /** Apply hand-edited JSON. Returns parse errors, or [] when applied. */
  const applyJson = useCallback((text: string): string[] => {
    const parsed = parseQueryJson(text);
    if (!parsed.ok) return parsed.errors;
    setQuery(parsed.query);
    return [];
  }, []);

  const loadQuery = useCallback((next: VisualQuery, params: ParamValues = {}) => {
    setQuery(next);
    setParamValues(params);
    setResult(null);
    setStatus('idle');
    setError(null);
  }, []);

  const loadTemplate = useCallback(
    (id: string) => {
      const template = findTemplate(id);
      if (template) loadQuery(template.query);
    },
    [loadQuery],
  );

  const saveQuery = useCallback(
    (name: string, description: string, visibility: SavedQuery['visibility']) => {
      savedStore.set(
        upsertSavedQuery(savedStore.getSnapshot(), { name, description, visibility, query, paramValues: { ...paramValues } as Record<string, Literal | null> }),
      );
    },
    [paramValues, query],
  );

  const deleteSaved = useCallback((id: string) => {
    savedStore.set(savedStore.getSnapshot().filter((entry) => entry.id !== id));
  }, []);

  const clearHistory = useCallback(() => historyStore.set([]), []);

  const timestampFields = useMemo(
    () =>
      entitiesInQuery(query).flatMap((entity) =>
        ENTITIES[entity].fields.filter((field) => field.type === 'timestamp').map((field) => `${entity}.${field.name}`),
      ),
    [query],
  );

  return {
    query,
    paramValues,
    status,
    result,
    error,
    role,
    stats,
    validation,
    explain,
    dsl,
    json,
    fingerprint,
    shareToken,
    saved,
    history,
    timestampFields,
    run,
    cancel,
    setSource,
    addJoin,
    updateJoinKind,
    removeJoin,
    addCondition,
    addGroup,
    updateNode,
    removeNode,
    setTimeWindow,
    toggleSelect,
    moveSelect,
    toggleGroupBy,
    addAggregation,
    updateAggregation,
    removeAggregation,
    moveAggregation,
    addSort,
    updateSort,
    removeSort,
    moveSort,
    setLimit,
    addParam,
    removeParam,
    setParamValue,
    applyJson,
    loadQuery,
    loadTemplate,
    saveQuery,
    deleteSaved,
    clearHistory,
  };
}

export type VisualQueryState = ReturnType<typeof useVisualQuery>;
