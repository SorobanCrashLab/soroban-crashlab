/** Saved-view serialization and shareable query state (#2314). */

import { z } from 'zod';
import { CI_STATUSES, DEFAULT_CI_QUERY, GATE_KINDS, type CiView } from './model';

export const VIEW_IDS = ['pr', 'branch', 'release', 'flakes', 'gates'] as const;

export const viewStateSchema = z.object({
  version: z.literal(1),
  view: z.enum(VIEW_IDS),
  q: z.string().trim().max(200).optional(),
  branch: z.string().trim().max(120).optional(),
  pr: z.number().int().positive().max(1_000_000_000).optional(),
  sha: z.string().regex(/^[0-9a-f]{40}$/).optional(),
  gate: z.enum(GATE_KINDS).optional(),
  status: z.enum(CI_STATUSES).optional(),
  onlyFailures: z.boolean().optional(),
  selectedRunId: z.string().max(120).optional(),
});

export type ViewState = z.infer<typeof viewStateSchema>;

export const DEFAULT_VIEW_STATE: ViewState = {
  version: 1,
  view: 'pr',
};

const PREFIX = 'ci1.';

/**
 * Canonical, URL-safe serialization. Fields are emitted in a fixed order and
 * empty values are dropped, so two states with different key insertion order
 * produce the same share token.
 */
export function serializeViewState(state: ViewState): string {
  const parsed = viewStateSchema.parse(state);
  const canonical: Record<string, unknown> = { version: 1, view: parsed.view };
  for (const key of ['q', 'branch', 'pr', 'sha', 'gate', 'status', 'onlyFailures', 'selectedRunId'] as const) {
    const value = parsed[key];
    if (value !== undefined && value !== '' && value !== false) canonical[key] = value;
  }
  return `${PREFIX}${encodeURIComponent(JSON.stringify(canonical))}`;
}

/** Returns `null` for malformed tokens rather than throwing at a page boundary. */
export function deserializeViewState(token: string | null | undefined): ViewState | null {
  if (!token || !token.startsWith(PREFIX)) return null;
  try {
    const json = decodeURIComponent(token.slice(PREFIX.length));
    const parsed = viewStateSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Builds a shareable status-report link from any base URL. */
export function buildShareUrl(baseUrl: string, state: ViewState): string {
  const url = new URL(baseUrl, 'https://ci.invalid');
  url.searchParams.set('state', serializeViewState(state));
  return url.toString();
}

/** Reads the `state` parameter from a URL or query record. */
export function viewStateFromSearchParams(
  params: URLSearchParams | Record<string, string | undefined>,
): ViewState | null {
  const token = params instanceof URLSearchParams ? params.get('state') : params.state;
  return deserializeViewState(token);
}

/** Bridges a view state to the API query shape. */
export function viewStateToQuery(state: ViewState) {
  const canonical = viewStateSchema.parse(state);
  return {
    ...DEFAULT_CI_QUERY,
    view: canonical.view as CiView,
    q: canonical.q,
    branch: canonical.branch,
    pr: canonical.pr,
    sha: canonical.sha,
    gate: canonical.gate,
    status: canonical.status,
    limit: canonical.onlyFailures ? 100 : 50,
  };
}
