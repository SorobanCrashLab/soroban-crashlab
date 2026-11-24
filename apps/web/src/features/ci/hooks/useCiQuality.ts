"use client";

/**
 * Client data layer for the CI Checks & Quality Gates Dashboard (#2314).
 *
 * The hook owns URLs, a bounded TTL/SWR cache, conditional revalidation,
 * local subscriptions/saved views, and the derived release report. Provider
 * selection and authorization stay on the server; this file never sees a token.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { safeStorage } from "@/lib/local-storage";
import type { ApiEnvelope, CiGatesPayload, CiRunsPayload } from "../lib/api";
import { readCache, retryDecision, writeCache, type CacheEntry } from "../lib/cache";
import { assessFreshness, DEFAULT_STALE_MS, DEFAULT_TTL_MS } from "../lib/freshness";
import type { CiNotification, CiSubscription } from "../lib/model";
import { permissionExplanation } from "../lib/permissions";
import { assessReleaseReadiness } from "../lib/release";
import {
  buildShareUrl,
  DEFAULT_VIEW_STATE,
  viewStateFromSearchParams,
  viewStateSchema,
  viewStateToQuery,
  type ViewState,
} from "../lib/saved-views";

const RUNS_ENDPOINT = "/api/ci/runs";
const GATES_ENDPOINT = "/api/ci/gates";
const SAVED_VIEWS_KEY = "crashlab.ci.savedViews";
const SUBSCRIPTIONS_KEY = "crashlab.ci.subscriptions";
export const CI_PLAYBOOK_URL =
  "https://github.com/SorobanCrashLab/soroban-crashlab/blob/main/docs/frontend/ci-quality-gates-dashboard.md#quality-gates";

type CacheNamespace = "runs" | "gates";

const responseCache: Record<CacheNamespace, Record<string, CacheEntry<unknown>>> = {
  runs: {},
  gates: {},
};

export interface SavedCiView {
  id: string;
  name: string;
  state: ViewState;
}

export interface IssueDraft {
  title: string;
  body: string;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function cacheKey(endpoint: string, query: Record<string, unknown>): string {
  return `${endpoint}?${JSON.stringify(query)}`;
}

function loadSavedViews(): SavedCiView[] {
  try {
    const raw = JSON.parse(safeStorage.getItem(SAVED_VIEWS_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as { id?: unknown; name?: unknown; state?: unknown };
      const parsed = viewStateSchema.safeParse(candidate.state);
      if (typeof candidate.id !== "string" || typeof candidate.name !== "string" || !parsed.success) {
        return [];
      }
      return [{ id: candidate.id, name: candidate.name.slice(0, 60), state: parsed.data }];
    });
  } catch {
    return [];
  }
}

function loadSubscriptions(): CiSubscription[] {
  try {
    const raw = JSON.parse(safeStorage.getItem(SUBSCRIPTIONS_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as Partial<CiSubscription>;
      if (
        typeof candidate.id !== "string" ||
        typeof candidate.target !== "string" ||
        !Array.isArray(candidate.kinds)
      ) {
        return [];
      }
      const kinds = candidate.kinds.filter(
        (kind): kind is CiSubscription["kinds"][number] =>
          kind === "gate-regression" || kind === "required-check-failure",
      );
      return [{
        id: candidate.id,
        target: candidate.target,
        kinds,
        createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : new Date(0).toISOString(),
      }];
    });
  } catch {
    return [];
  }
}

function subscriptionMatches(subscription: CiSubscription, state: ViewState): boolean {
  const target = subscription.target.trim();
  if (!target || target === "all" || target === state.view) return true;
  if (target.startsWith("pr:")) {
    return state.pr !== undefined && target.slice(3) === String(state.pr);
  }
  if (target.startsWith("branch:")) {
    const branch = target.slice(7);
    return state.branch ? state.branch === branch : state.view === "branch";
  }
  return false;
}

async function fetchPayload<T>(
  namespace: CacheNamespace,
  endpoint: string,
  query: Record<string, unknown>,
  options: { force?: boolean; signal?: AbortSignal; onRetry?: (delayMs: number) => void } = {},
): Promise<T> {
  const key = cacheKey(endpoint, query);
  const cached = options.force
    ? null
    : readCache(responseCache[namespace], key, Date.now(), DEFAULT_TTL_MS, DEFAULT_STALE_MS);
  if (cached?.decision === "fresh" && cached.data) return cached.data as T;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (cached?.decision === "stale" && cached.etag) headers["If-None-Match"] = cached.etag;
  const search = new URLSearchParams(
    Object.entries(query)
      .filter(([, value]) => value !== undefined)
      .map(([field, value]) => [field, String(value)]),
  ).toString();

  let attempt = 0;
  for (;;) {
    const response = await fetch(`${endpoint}?${search}`, {
      headers,
      cache: options.force ? "no-store" : "default",
      signal: options.signal,
    });

    if (response.status === 304) {
      if (!cached?.data) throw new Error("Cache revalidation returned 304 without a cached payload.");
      responseCache[namespace] = writeCache(
        responseCache[namespace],
        key,
        cached.data,
        Date.now(),
        response.headers.get("ETag") ?? cached.etag,
      );
      return cached.data as T;
    }

    if (response.status === 429 || response.status >= 500) {
      const decision = retryDecision(response.status, response.headers.get("Retry-After"), attempt);
      if (decision.shouldRetry) {
        attempt += 1;
        options.onRetry?.(decision.delayMs);
        await sleep(decision.delayMs, options.signal);
        continue;
      }
    }

    const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T> & { error?: string };
    if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
    if (!body.data) throw new Error("CI API response did not contain a data envelope.");
    responseCache[namespace] = writeCache(
      responseCache[namespace],
      key,
      body.data,
      Date.now(),
      response.headers.get("ETag") ?? undefined,
    );
    return body.data;
  }
}

export function useCiQuality() {
  const [viewState, setViewState] = useState<ViewState>(DEFAULT_VIEW_STATE);
  const [runsPayload, setRunsPayload] = useState<CiRunsPayload | null>(null);
  const [gatesPayload, setGatesPayload] = useState<CiGatesPayload | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");
  const [rateLimitNotice, setRateLimitNotice] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [savedViews, setSavedViews] = useState<SavedCiView[]>([]);
  const [subscriptions, setSubscriptions] = useState<CiSubscription[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [urlReady, setUrlReady] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const query = useMemo(() => viewStateToQuery(viewState), [viewState]);

  // Hydrate URL and local storage after mount so server and client render the
  // same first frame.
  /* eslint-disable react-hooks/set-state-in-effect -- hydrate browser state once after SSR-safe first frame */
  useEffect(() => {
    const fromUrl = viewStateFromSearchParams(new URLSearchParams(window.location.search));
    if (fromUrl) setViewState(fromUrl);
    setSubscriptions(loadSubscriptions());
    setSavedViews(loadSavedViews());
    setStorageReady(true);
    setUrlReady(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!urlReady) return;
    const canonical = new URL(buildShareUrl(`${window.location.origin}/quality/ci`, viewState));
    window.history.replaceState(null, "", `${canonical.pathname}${canonical.search}`);
  }, [urlReady, viewState]);

  useEffect(() => {
    if (!storageReady) return;
    safeStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(savedViews));
  }, [savedViews, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    safeStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(subscriptions));
  }, [storageReady, subscriptions]);

  const refresh = useCallback(
    async (force = false, signal?: AbortSignal) => {
      setIsRefreshing(true);
      setError(null);
      setRateLimitNotice(null);
      try {
        const [runs, gates] = await Promise.all([
          fetchPayload<CiRunsPayload>("runs", RUNS_ENDPOINT, query, {
            force,
            signal,
            onRetry: (delayMs) => setRateLimitNotice(`Rate limited; retrying in ${Math.ceil(delayMs / 1000)}s.`),
          }),
          fetchPayload<CiGatesPayload>("gates", GATES_ENDPOINT, query, {
            force,
            signal,
            onRetry: (delayMs) => setRateLimitNotice(`Rate limited; retrying in ${Math.ceil(delayMs / 1000)}s.`),
          }),
        ]);
        if (signal?.aborted) return;
        setRunsPayload(runs);
        setGatesPayload(gates);
        setNowMs(Date.now());
      } catch (reason) {
        if (signal?.aborted || (reason instanceof DOMException && reason.name === "AbortError")) return;
        setError(reason instanceof Error ? reason.message : "Unable to load CI quality data.");
      } finally {
        if (!signal?.aborted) setIsRefreshing(false);
      }
    },
    [query],
  );

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch data when the derived query changes
    void refresh(false, controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const updateView = useCallback((patch: Partial<ViewState>) => {
    setViewState((current) => viewStateSchema.parse({ ...current, ...patch }));
  }, []);

  const selectRun = useCallback((runId: string) => updateView({ selectedRunId: runId }), [updateView]);

  const focusTest = useCallback((name: string) => updateView({ q: name, view: "flakes" }), [updateView]);

  const shareUrl = useMemo(() => {
    const base = typeof window === "undefined" ? "/quality/ci" : `${window.location.origin}/quality/ci`;
    return buildShareUrl(base, viewState);
  }, [viewState]);

  const copyShareUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setNotice("Share link copied to the clipboard.");
    } catch {
      setNotice("Copy failed. Use the share link field instead.");
    }
  }, [shareUrl]);

  const saveView = useCallback((name: string) => {
    const trimmed = name.trim().slice(0, 60);
    if (!trimmed) return;
    const id = `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    setSavedViews((current) => [...current, { id, name: trimmed, state: viewState }]);
    setNotice(`Saved view “${trimmed}”.`);
  }, [viewState]);

  const loadView = useCallback(
    (id: string) => {
      const found = savedViews.find((item) => item.id === id);
      if (found) {
        setViewState(found.state);
        setNotice(`Loaded view “${found.name}”.`);
      }
    },
    [savedViews],
  );

  const deleteView = useCallback((id: string) => {
    setSavedViews((current) => current.filter((item) => item.id !== id));
    setNotice("Saved view removed.");
  }, []);

  const subscribe = useCallback((target: string, kinds: CiSubscription["kinds"]) => {
    const cleanTarget = target.trim().slice(0, 120) || "all";
    setSubscriptions((current) => {
      if (current.some((item) => item.target === cleanTarget)) return current;
      return [
        ...current,
        {
          id: `sub-${Date.now().toString(36)}`,
          target: cleanTarget,
          kinds: kinds.length ? kinds : ["gate-regression"],
          createdAt: new Date().toISOString(),
        },
      ];
    });
    setNotice(`Subscribed to ${cleanTarget}.`);
  }, []);

  const unsubscribe = useCallback((id: string) => {
    setSubscriptions((current) => current.filter((item) => item.id !== id));
    setNotice("Subscription removed.");
  }, []);

  const createIssue = useCallback((draft: IssueDraft) => {
    const params = new URLSearchParams({ title: draft.title.slice(0, 200), body: draft.body.slice(0, 4000) });
    const issueUrl = `https://github.com/SorobanCrashLab/soroban-crashlab/issues/new?${params.toString()}`;
    if (typeof window !== "undefined") window.open(issueUrl, "_blank", "noopener,noreferrer");
    setNotice(`Issue draft ready for “${draft.title.slice(0, 60)}”.`);
    return issueUrl;
  }, []);

  const runs = useMemo(() => runsPayload?.runs ?? [], [runsPayload]);
  const history = useMemo(() => Object.values(runsPayload?.history ?? {}).flat(), [runsPayload]);
  const allRuns = useMemo(() => [...runs, ...history], [runs, history]);
  const evaluation = gatesPayload?.evaluation ?? null;
  const flakes = useMemo(() => gatesPayload?.flakes ?? [], [gatesPayload]);
  const correlations = useMemo(() => gatesPayload?.correlations ?? [], [gatesPayload]);
  const permissions = runsPayload?.permissions ?? gatesPayload?.permissions;
  const role = runsPayload?.role ?? gatesPayload?.role ?? "anonymous";

  const releaseReport = useMemo(() => {
    if (!evaluation || !runsPayload) return null;
    return assessReleaseReadiness({
      runs: allRuns,
      evaluation,
      flakes,
      correlations,
      regressions: runsPayload.regressions,
      incidents: runsPayload.incidents,
      nowMs,
    });
  }, [allRuns, correlations, evaluation, flakes, nowMs, runsPayload]);

  const freshness = useMemo(
    () => assessFreshness(runsPayload?.generatedAt, nowMs),
    [nowMs, runsPayload?.generatedAt],
  );

  const notifications = useMemo<CiNotification[]>(() => {
    const items: CiNotification[] = [];
    for (const card of evaluation?.blockers ?? []) {
      items.push({
        id: `blocker:${card.kind}:${card.runId ?? ""}`,
        kind: card.required ? "required-check-failure" : "gate-regression",
        message: `${card.label}: ${card.detail}`,
        runId: card.runId,
        createdAt: card.updatedAt ?? runsPayload?.generatedAt ?? new Date(0).toISOString(),
      });
    }
    for (const flake of flakes.filter((item) => item.severity === "critical" || item.severity === "high")) {
      items.push({
        id: `flake:${flake.testId}`,
        kind: "gate-regression",
        message: `Flaky test ${flake.name} scored ${flake.score}/100.`,
        createdAt: flake.lastSeenAt,
      });
    }
    return items
      .filter((item) => !dismissedIds.includes(item.id))
      .filter((item) => {
        if (!subscriptions.length) return true;
        const wanted = item.kind === "required-check-failure" ? "required-check-failure" : "gate-regression";
        return subscriptions.some(
          (subscription) =>
            subscriptionMatches(subscription, viewState) && subscription.kinds.includes(wanted),
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  }, [dismissedIds, evaluation, flakes, runsPayload?.generatedAt, subscriptions, viewState]);

  const dismissNotification = useCallback((id: string) => {
    setDismissedIds((current) => [...current, id]);
  }, []);

  const permissionNote = permissions ? permissionExplanation(permissions) : null;

  return {
    viewState,
    updateView,
    query,
    runs,
    history,
    allRuns,
    evaluation,
    flakes,
    correlations,
    releaseReport,
    notifications,
    dismissNotification,
    permissions,
    role,
    subject: runsPayload?.subject ?? gatesPayload?.subject ?? "",
    permissionNote,
    repository: runsPayload?.repository ?? gatesPayload?.repository ?? "",
    source: runsPayload?.source ?? gatesPayload?.source ?? "mock",
    generatedAt: runsPayload?.generatedAt ?? gatesPayload?.generatedAt,
    policy: runsPayload?.policy ?? gatesPayload?.policy,
    freshness,
    isLoading: isRefreshing && !runsPayload,
    isRefreshing,
    error,
    notice,
    rateLimitNotice,
    shareUrl,
    savedViews,
    subscriptions,
    selectedRunId: viewState.selectedRunId ?? null,
    selectRun,
    focusTest,
    refresh,
    copyShareUrl,
    saveView,
    loadView,
    deleteView,
    subscribe,
    unsubscribe,
    createIssue,
    playbookUrl: CI_PLAYBOOK_URL,
  };
}

export type CiQualityState = ReturnType<typeof useCiQuality>;
