/** Freshness/TTL decisions shared by the API cache headers and the client hook. */

export type FreshnessState = 'fresh' | 'stale' | 'expired';

export interface FreshnessAssessment {
  state: FreshnessState;
  ageMs: number;
  ttlMs: number;
  staleMs: number;
  staleUntilMs: number;
}

export const DEFAULT_TTL_MS = 30_000;
export const DEFAULT_STALE_MS = 300_000;

/**
 * `fresh` until TTL, `stale` during the SWR window, `expired` afterwards.
 * Invalid or future timestamps are treated as expired so bad provider data
 * never looks healthy.
 */
export function assessFreshness(
  generatedAt: string | number | undefined,
  nowMs = Date.now(),
  ttlMs = DEFAULT_TTL_MS,
  staleMs = DEFAULT_STALE_MS,
): FreshnessAssessment {
  const parsed = typeof generatedAt === 'number' ? generatedAt : Date.parse(generatedAt ?? '');
  if (!Number.isFinite(parsed) || parsed > nowMs + 60_000) {
    return {
      state: 'expired',
      ageMs: Number.POSITIVE_INFINITY,
      ttlMs,
      staleMs,
      staleUntilMs: nowMs + staleMs,
    };
  }
  const ageMs = Math.max(0, nowMs - parsed);
  const state = ageMs <= ttlMs ? 'fresh' : ageMs <= ttlMs + staleMs ? 'stale' : 'expired';
  return { state, ageMs, ttlMs, staleMs, staleUntilMs: parsed + ttlMs + staleMs };
}

/** Cache-Control header used by both CI API routes. */
export function ciCacheControl(
  ttlSec = DEFAULT_TTL_MS / 1000,
  staleSec = DEFAULT_STALE_MS / 1000,
  visibility: 'private' | 'public' = 'private',
): string {
  return `${visibility}, max-age=${Math.max(0, Math.floor(ttlSec))}, stale-while-revalidate=${Math.max(0, Math.floor(staleSec))}`;
}

/** Parses `Retry-After` (seconds or HTTP-date) into a bounded delay in ms. */
export function retryAfterMs(header: string | null, nowMs = Date.now(), maxMs = 120_000): number {
  if (!header) return 0;
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.min(maxMs, Math.round(seconds * 1000)));
  }
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, Math.min(maxMs, date - nowMs)) : 0;
}
