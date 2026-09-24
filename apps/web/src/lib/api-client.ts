import type { RunIssueLink, CampaignConfig } from '../app/types';
import { dedupedFetchJson, HttpError } from './request-dedup';
import { API_BASE } from './api-base';
import { logger } from './logger';
import { z } from 'zod';
import type { ZodIssue, ZodTypeAny } from 'zod';
import {
  RunDetailResponseSchema,
  RunsListResponseSchema,
  type RunDetailResponse,
  type RunsListResponse,
} from './schemas/runs';
import {
  AnalyticsEventsResponseSchema,
  AnalyticsTrendsResponseSchema,
  ArtifactsResponseSchema,
  CampaignResponseSchema,
  IntegrationsResponseSchema,
  NotificationsResponseSchema,
  RemoveArtifactResponseSchema,
  RunAnnotationsResponseSchema,
  RunIssuesResponseSchema,
  RunTagsResponseSchema,
  WebhookHistoryResponseSchema,
  WebhooksResponseSchema,
} from './schemas/api';

export type { ArtifactMetadata, NotificationFeedItem } from './schemas/api';

export class ApiError extends Error {
  status: number;
  requiredRole?: string;

  constructor(status: number, message: string, requiredRole?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.requiredRole = requiredRole;
  }
}

export class SchemaError extends Error {
  readonly route: string;
  readonly issues: readonly ZodIssue[];

  constructor(route: string, issues: readonly ZodIssue[]) {
    const firstIssue = issues[0];
    const issuePath = firstIssue?.path.length ? firstIssue.path.join('.') : '<root>';
    super(`Invalid API response from ${route} at ${issuePath}: ${firstIssue?.message ?? 'unknown validation error'}`);
    this.name = 'SchemaError';
    this.route = route;
    this.issues = issues;
  }
}

function apiUrl(path: string): string {
  return `${API_BASE}/api${path}`;
}

function unwrapApiPayload<S extends ZodTypeAny>(
  json: unknown,
  route: string,
  schema: S,
): z.output<S> {
  let payload = json;

  if (payload && typeof payload === 'object' && 'data' in payload) {
    const envelope = payload as { data: unknown; total?: unknown };
    payload = envelope.data;

    if (
      envelope.total !== undefined &&
      payload !== null &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      !('total' in payload)
    ) {
      payload = { ...payload, total: envelope.total };
    }
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    logger.error('API response schema validation failed', {
      route,
      issues: result.error.issues,
    });
    throw new SchemaError(route, result.error.issues);
  }

  return result.data;
}

async function apiFetch<S extends ZodTypeAny>(
  path: string,
  schema: S,
  options?: RequestInit & { signal?: AbortSignal },
): Promise<z.output<S>> {
  const res = await fetch(apiUrl(path), {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    const message =
      typeof body?.error === 'object'
        ? body.error?.message
        : body?.error ?? `API error: ${res.status} ${res.statusText}`;
    const requiredRole =
      typeof body?.error === 'object' ? body.error?.requiredRole : undefined;

    if (res.status === 403) {
      const hintMessage = requiredRole
        ? `Access Denied: Requires '${requiredRole}' role. Please switch to '${requiredRole}' mode.`
        : message;
      throw new ApiError(res.status, hintMessage, requiredRole);
    }

    throw new ApiError(res.status, message);
  }
  if (res.status === 204) {
    return unwrapApiPayload(undefined, apiUrl(path), schema);
  }
  return unwrapApiPayload(await res.json(), apiUrl(path), schema);
}

export const api = {
  runs: {
    // GETs are deduped: several routes (dashboard, runs list, trends, triage,
    // analytics) independently fetch /api/runs on mount, so concurrent calls
    // share one in-flight request instead of issuing duplicate network calls.
    list: (
      optionsOrSignal?: FetchRunsOptions | AbortSignal,
      signal?: AbortSignal,
    ) => {
      const opts: FetchRunsOptions =
        optionsOrSignal instanceof AbortSignal ? {} : (optionsOrSignal ?? {});
      const resolvedSignal =
        optionsOrSignal instanceof AbortSignal ? optionsOrSignal : signal;
      const qs = new URLSearchParams();
      if (opts.cursor) qs.set('cursor', opts.cursor);
      if (opts.limit != null) qs.set('limit', String(opts.limit));
      const path = qs.toString() ? `/runs?${qs.toString()}` : '/runs';
      return dedupedFetchJson<unknown>(apiUrl(path), resolvedSignal).then((payload) =>
        unwrapApiPayload(payload, apiUrl(path), RunsListResponseSchema),
      );
    },
    get: (id: string, signal?: AbortSignal) => {
      const path = `/runs/${encodeURIComponent(id)}`;
      return dedupedFetchJson<unknown>(apiUrl(path), signal).then((payload) =>
        unwrapApiPayload(payload, apiUrl(path), RunDetailResponseSchema),
      );
    },
    issues: {
      list: (runId: string, signal?: AbortSignal) =>
        apiFetch(
          `/runs/${encodeURIComponent(runId)}/issues`,
          RunIssuesResponseSchema,
          { signal },
        ),
      add: (runId: string, link: RunIssueLink, signal?: AbortSignal) =>
        apiFetch(
          `/runs/${encodeURIComponent(runId)}/issues`,
          RunIssuesResponseSchema,
          { method: 'POST', body: JSON.stringify(link), signal },
        ),
      remove: (runId: string, href: string, signal?: AbortSignal) =>
        apiFetch(
          `/runs/${encodeURIComponent(runId)}/issues`,
          RunIssuesResponseSchema,
          { method: 'DELETE', body: JSON.stringify({ href }), signal },
        ),
    },
    tags: {
      list: (runId: string, signal?: AbortSignal) =>
        apiFetch(`/runs/${encodeURIComponent(runId)}/tags`, RunTagsResponseSchema, {
          signal,
        }),
      add: (runId: string, tag: string, signal?: AbortSignal) =>
        apiFetch(`/runs/${encodeURIComponent(runId)}/tags`, RunTagsResponseSchema, {
          method: 'POST',
          body: JSON.stringify({ tag }),
          signal,
        }),
      remove: (runId: string, tag: string, signal?: AbortSignal) =>
        apiFetch(`/runs/${encodeURIComponent(runId)}/tags`, RunTagsResponseSchema, {
          method: 'DELETE',
          body: JSON.stringify({ tag }),
          signal,
        }),
    },
    annotations: {
      list: (runId: string, signal?: AbortSignal) =>
        apiFetch(
          `/runs/${encodeURIComponent(runId)}/annotations`,
          RunAnnotationsResponseSchema,
          { signal },
        ),
      add: (runId: string, text: string, signal?: AbortSignal) =>
        apiFetch(
          `/runs/${encodeURIComponent(runId)}/annotations`,
          RunAnnotationsResponseSchema,
          { method: 'POST', body: JSON.stringify({ text }), signal },
        ),
      remove: (runId: string, index: number, signal?: AbortSignal) =>
        apiFetch(
          `/runs/${encodeURIComponent(runId)}/annotations`,
          RunAnnotationsResponseSchema,
          { method: 'DELETE', body: JSON.stringify({ index }), signal },
        ),
    },
  },
  analytics: {
    trends: (signal?: AbortSignal) =>
      apiFetch('/runs/trends', AnalyticsTrendsResponseSchema, { signal }),
    events: (signal?: AbortSignal) =>
      apiFetch('/runs/events', AnalyticsEventsResponseSchema, { signal }),
  },
  artifacts: {
    list: (signal?: AbortSignal) =>
      apiFetch('/artifacts', ArtifactsResponseSchema, {
        cache: 'no-store',
        signal,
      }),
    download: async (id: string, signal?: AbortSignal): Promise<Blob> => {
      const res = await fetch(apiUrl(`/artifacts/${encodeURIComponent(id)}`), { signal });
      if (!res.ok) {
        const message = await res
          .json()
          .then((body: { error?: string }) => body?.error)
          .catch(() => undefined);
        throw new ApiError(res.status, message ?? `API error: ${res.status} ${res.statusText}`);
      }
      return res.blob();
    },
    remove: (id: string, signal?: AbortSignal) =>
      apiFetch(`/artifacts/${encodeURIComponent(id)}`, RemoveArtifactResponseSchema, {
        method: 'DELETE',
        signal,
      }),
  },
  campaigns: {
    create: (config: CampaignConfig, signal?: AbortSignal) =>
      apiFetch('/campaigns', CampaignResponseSchema, {
        method: 'POST',
        body: JSON.stringify(config),
        signal,
      }),
  },
  notifications: {
    list: (signal?: AbortSignal) =>
      apiFetch('/notifications', NotificationsResponseSchema, { signal }),
  },
  webhooks: {
    list: (signal?: AbortSignal) =>
      apiFetch('/webhooks', WebhooksResponseSchema, { signal }),
    history: (signal?: AbortSignal) =>
      apiFetch('/webhooks/history', WebhookHistoryResponseSchema, { signal }),
  },
  integrations: {
    list: (signal?: AbortSignal) =>
      apiFetch('/integrations', IntegrationsResponseSchema, { signal }),
  },
};

export interface FetchRunsOptions {
  /** Opaque keyset cursor from a previous response's `nextCursor` field. */
  cursor?: string | null;
  /** Maximum number of runs to return (default: server-side default). */
  limit?: number;
}

/**
 * Fetches paginated runs from the API.
 *
 * Supports two calling conventions for backward compatibility:
 *   - `fetchRuns(signal?)` – original signature; no pagination options.
 *   - `fetchRuns(options, signal?)` – new keyset-pagination signature.
 */
export async function fetchRuns(
  optionsOrSignal?: FetchRunsOptions | AbortSignal | null,
  signal?: AbortSignal,
): Promise<RunsListResponse> {
  const opts: FetchRunsOptions =
    optionsOrSignal instanceof AbortSignal ? {} : (optionsOrSignal ?? {});
  const resolvedSignal =
    optionsOrSignal instanceof AbortSignal ? optionsOrSignal : signal;
  return api.runs.list(opts, resolvedSignal);
}

/**
 * Helper modeling only-latest-matters: returns a wrapped function where newer
 * invocations automatically abort any previous in-flight invocation.
 */
export function fetchLatestOnly<T, Args extends unknown[]>(
  fn: (...args: [...Args, AbortSignal]) => Promise<T>,
): (...args: Args) => Promise<T> {
  let controller: AbortController | null = null;
  return (...args: Args): Promise<T> => {
    if (controller) {
      controller.abort();
    }
    controller = new AbortController();
    return fn(...args, controller.signal);
  };
}

/**
 * Status code of a failed request, if the error carries one. `apiFetch` rejects
 * with `ApiError` while the deduped GET path rejects with `HttpError`, so
 * matching on the shared `status` field covers both.
 */
function statusOf(err: unknown): number | undefined {
  if (err instanceof ApiError || err instanceof HttpError) return err.status;
  return undefined;
}

export async function fetchRun(id: string, signal?: AbortSignal): Promise<RunDetailResponse | null> {
  try {
    return await api.runs.get(id, signal);
  } catch (err) {
    if (statusOf(err) === 404) {
      return null;
    }
    throw err;
  }
}
