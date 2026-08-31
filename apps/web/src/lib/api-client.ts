import {
  FuzzingRun,
  CrashEvent,
  SignatureFrequency,
  CrashTrendPoint,
  RunIssueLink,
  CampaignConfig,
} from '../app/types';
import { dedupedFetchJson, HttpError } from './request-dedup';
import { API_BASE } from './api-base';

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

function apiUrl(path: string): string {
  return `${API_BASE}/api${path}`;
}

function unwrapApiPayload<T>(json: unknown): T {
  if (json && typeof json === 'object' && 'data' in json) {
    const envelope = json as { data: unknown; total?: number };
    if (
      envelope.data &&
      typeof envelope.data === 'object' &&
      !Array.isArray(envelope.data) &&
      envelope.total !== undefined &&
      !('total' in (envelope.data as object))
    ) {
      return { ...(envelope.data as object), total: envelope.total } as T;
    }
    return envelope.data as T;
  }
  return json as T;
}

async function apiFetch<T>(path: string, options?: RequestInit & { signal?: AbortSignal }): Promise<T> {
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
    return undefined as T;
  }
  return unwrapApiPayload<T>(await res.json());
}

export interface ArtifactMetadata {
  id: string;
  name: string;
  createdAt: string;
  sizeBytes: number;
}

export interface NotificationFeedItem {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  createdAt: string;
  read: boolean;
}

export const api = {
  runs: {
    // GETs are deduped: several routes (dashboard, runs list, trends, triage,
    // analytics) independently fetch /api/runs on mount, so concurrent calls
    // share one in-flight request instead of issuing duplicate network calls.
    list: (signal?: AbortSignal) =>
      dedupedFetchJson<{ runs: FuzzingRun[]; total: number }>(apiUrl('/runs'), signal),
    get: (id: string, signal?: AbortSignal) =>
      dedupedFetchJson<FuzzingRun>(apiUrl(`/runs/${encodeURIComponent(id)}`), signal),
    issues: {
      list: (runId: string, signal?: AbortSignal) =>
        apiFetch<{ runId: string; issues: RunIssueLink[] }>(
          `/runs/${encodeURIComponent(runId)}/issues`,
          { signal },
        ),
      add: (runId: string, link: RunIssueLink, signal?: AbortSignal) =>
        apiFetch<{ runId: string; issues: RunIssueLink[] }>(
          `/runs/${encodeURIComponent(runId)}/issues`,
          { method: 'POST', body: JSON.stringify(link), signal },
        ),
      remove: (runId: string, href: string, signal?: AbortSignal) =>
        apiFetch<{ runId: string; issues: RunIssueLink[] }>(
          `/runs/${encodeURIComponent(runId)}/issues`,
          { method: 'DELETE', body: JSON.stringify({ href }), signal },
        ),
    },
    tags: {
      list: (runId: string, signal?: AbortSignal) =>
        apiFetch<{ runId: string; tags: string[] }>(`/runs/${encodeURIComponent(runId)}/tags`, {
          signal,
        }),
      add: (runId: string, tag: string, signal?: AbortSignal) =>
        apiFetch<{ runId: string; tags: string[] }>(`/runs/${encodeURIComponent(runId)}/tags`, {
          method: 'POST',
          body: JSON.stringify({ tag }),
          signal,
        }),
      remove: (runId: string, tag: string, signal?: AbortSignal) =>
        apiFetch<{ runId: string; tags: string[] }>(`/runs/${encodeURIComponent(runId)}/tags`, {
          method: 'DELETE',
          body: JSON.stringify({ tag }),
          signal,
        }),
    },
    annotations: {
      list: (runId: string, signal?: AbortSignal) =>
        apiFetch<{ runId: string; annotations: string[] }>(
          `/runs/${encodeURIComponent(runId)}/annotations`,
          { signal },
        ),
      add: (runId: string, text: string, signal?: AbortSignal) =>
        apiFetch<{ runId: string; annotations: string[] }>(
          `/runs/${encodeURIComponent(runId)}/annotations`,
          { method: 'POST', body: JSON.stringify({ text }), signal },
        ),
      remove: (runId: string, index: number, signal?: AbortSignal) =>
        apiFetch<{ runId: string; annotations: string[] }>(
          `/runs/${encodeURIComponent(runId)}/annotations`,
          { method: 'DELETE', body: JSON.stringify({ index }), signal },
        ),
    },
  },
  analytics: {
    trends: (signal?: AbortSignal) =>
      apiFetch<{ trends: CrashTrendPoint[]; signatures: SignatureFrequency[] }>('/runs/trends', {
        signal,
      }),
    events: (signal?: AbortSignal) =>
      apiFetch<{ events: CrashEvent[] }>('/runs/events', { signal }),
  },
  artifacts: {
    list: (signal?: AbortSignal) =>
      apiFetch<{ artifacts: ArtifactMetadata[]; total: number }>('/artifacts', {
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
      apiFetch<{ success: boolean; message: string }>(`/artifacts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        signal,
      }),
  },
  campaigns: {
    create: (config: CampaignConfig, signal?: AbortSignal) =>
      apiFetch<{ campaign: Record<string, unknown> }>('/campaigns', {
        method: 'POST',
        body: JSON.stringify(config),
        signal,
      }),
  },
  notifications: {
    list: (signal?: AbortSignal) =>
      apiFetch<{ notifications: NotificationFeedItem[]; total: number }>('/notifications', {
        signal,
      }),
  },
  webhooks: {
    list: (signal?: AbortSignal) =>
      apiFetch<{ webhooks: unknown[] }>('/webhooks', { signal }),
  },
  integrations: {
    list: (signal?: AbortSignal) =>
      apiFetch<{ integrations: unknown[] }>('/integrations', { signal }),
  },
};

export async function fetchRuns(signal?: AbortSignal): Promise<{ runs: FuzzingRun[]; total: number }> {
  return api.runs.list(signal);
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

export async function fetchRun(id: string, signal?: AbortSignal): Promise<FuzzingRun | null> {
  try {
    return await api.runs.get(id, signal);
  } catch (err) {
    if (statusOf(err) === 404) {
      return null;
    }
    throw err;
  }
}
