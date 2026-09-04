/**
 * Coalesces concurrent GET requests to the same URL into a single network
 * call. Several routes (dashboard, runs list, trends, triage, analytics)
 * independently fetch `/api/runs` on mount, which previously produced
 * duplicate in-flight requests whenever more than one of them rendered at
 * the same time. Callers awaiting the same URL while a request is already
 * in flight share that request's parsed JSON result instead of issuing a
 * new fetch.
 *
 * Entries also survive a brief grace window past settlement (#1409) so that
 * a remount burst — unmount and immediately remount, which React does in
 * StrictMode and on fast route changes — reuses the outcome instead of
 * refetching. The window is bounded and self-evicting: the map is never a
 * long-lived cache.
 *
 * COMPOSITION NOTE (#1409). Two sibling changes are expected in this file
 * (abort-signal, timeout-retry). The regions are disjoint:
 *   - signal construction: the `AbortSignal.timeout` / `AbortSignal.any` pair
 *     inside `dedupedFetchJson`  — the abort-signal work owns this
 *   - fetch and response parsing: the `.then` body — timeout-retry owns this
 *   - entry lifecycle: `SETTLED_GRACE_MS`, `DedupeEntry`, `forget`,
 *     `scheduleEviction` and the settlement handlers — THIS change owns these
 * This change adds only the third region plus the four lines in
 * `dedupedFetchJson` that register and settle the entry. It reads nothing from
 * the signal or the response body, so it rebases cleanly onto either sibling
 * in any landing order.
 *
 * TIMEOUT + RETRY (#1383):
 *   - Default 10 s timeout per underlying fetch (configurable per-call via
 *     FetchPolicy or via the FETCH_POLICIES named constants).
 *   - Single transparent retry with short jittered backoff for idempotent
 *     GET requests on timeout or network error.
 *   - POST / mutation callers use plain `apiFetch` in api-client.ts; this
 *     module only wraps GETs so auto-retry is always safe here.
 *   - Typed error taxonomy: TimeoutError, NetworkError, HttpError.
 *   - Multi-caller fan-out: when all callers share one in-flight promise, a
 *     rejection evicts immediately and is broadcast to all awaiters at once.
 */

/**
 * How long a settled entry stays available before eviction.
 *
 * 30s comfortably covers a remount burst (StrictMode double-invoke, route
 * bounce, tab refocus) which resolves in well under a second. Going longer
 * starts to read as a cache: a user who edits a filter, reverts it, and sees
 * minute-old numbers has no way to tell the data is stale, and this module
 * has no revalidation story. Shorter than a few seconds would miss the
 * remount bursts this exists for.
 */
export const SETTLED_GRACE_MS = 30_000;

interface DedupeEntry {
  /** The shared promise handed to every caller for this URL. */
  readonly promise: Promise<unknown>;
  /** Eviction timer, present only once the request has settled. */
  timer?: ReturnType<typeof setTimeout>;
}

const inFlightRequests = new Map<string, DedupeEntry>();

// ---------------------------------------------------------------------------
// Typed error classes (#1383)
// ---------------------------------------------------------------------------

/**
 * Thrown when a deduped request completes with a non-ok HTTP status. Callers
 * that branch on the status code (for example `fetchRun`, which maps 404 to
 * `null`) need it structurally rather than having to parse the message.
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * Thrown when the AbortController deadline fires before the server responds.
 * Distinct from NetworkError so callers can show a "request timed out" message
 * rather than a generic "network error".
 */
export class TimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs} ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Thrown when `fetch` itself rejects (DNS failure, TCP RST, offline, etc.) and
 * the failure is not a timeout. The original cause is preserved as `cause`.
 */
export class NetworkError extends Error {
  readonly cause: unknown;

  constructor(url: string, cause: unknown) {
    super(`Network error fetching ${url}`);
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Fetch policy constants (#1383)
// ---------------------------------------------------------------------------

import { API_FETCH_TIMEOUT_MS } from './timeouts';

export interface FetchPolicy {
  /** Milliseconds before each attempt is aborted. */
  readonly timeoutMs: number;
  /**
   * Maximum number of attempts (1 = no retry). Only GET requests are retried;
   * this module exclusively wraps GETs so the guard is documentation.
   */
  readonly maxAttempts: number;
  /** Base jitter window in ms added to the backoff between attempts. */
  readonly retryJitterMs: number;
}

/** Default policy: 10 s timeout, one retry, no jitter (callers can override). */
export const DEFAULT_FETCH_POLICY: FetchPolicy = {
  timeoutMs: API_FETCH_TIMEOUT_MS,
  maxAttempts: 2,
  retryJitterMs: 0,
} as const;

/** No-retry policy for callers that need deterministic single-attempt semantics. */
export const NO_RETRY_FETCH_POLICY: FetchPolicy = {
  timeoutMs: API_FETCH_TIMEOUT_MS,
  maxAttempts: 1,
  retryJitterMs: 0,
} as const;

// ---------------------------------------------------------------------------
// Entry lifecycle helpers
// ---------------------------------------------------------------------------

/**
 * Drops an entry and cancels any eviction timer still pointing at it, so a
 * removed key can never be evicted twice or hold a timer alive.
 */
function forget(url: string): void {
  const entry = inFlightRequests.get(url);
  if (!entry) return;
  if (entry.timer !== undefined) clearTimeout(entry.timer);
  inFlightRequests.delete(url);
}

/**
 * Schedules eviction of a settled entry.
 *
 * The timer is `unref`'d where the runtime supports it (Node, and therefore
 * Vitest) so a pending eviction can never hold the process open at the end of
 * a test run. Browsers have no `unref`; the feature check covers both.
 *
 * The window runs from settlement and is never extended by a cache hit —
 * extending it would let a hot key live forever, which is the retention this
 * module is specifically avoiding.
 */
function scheduleEviction(url: string, entry: DedupeEntry): void {
  const timer = setTimeout(() => {
    // Only evict if this exact entry is still the one on file. A later request
    // for the same URL replaces the entry, and its own timer owns eviction.
    if (inFlightRequests.get(url) === entry) inFlightRequests.delete(url);
  }, SETTLED_GRACE_MS);

  if (typeof (timer as { unref?: () => void }).unref === 'function') {
    (timer as unknown as { unref: () => void }).unref();
  }

  entry.timer = timer;
}

// ---------------------------------------------------------------------------
// Core fetch-with-timeout-and-retry (#1383)
// ---------------------------------------------------------------------------

/**
 * Performs a single fetch attempt against `url`, aborting after `policy.timeoutMs`.
 * Classifies errors into the typed taxonomy before re-throwing:
 *   - AbortError from our own controller → TimeoutError
 *   - Any other fetch rejection            → NetworkError
 *   - Non-ok HTTP status                  → HttpError
 *
 * @internal — used only by `dedupedFetchJson`.
 */
async function fetchAttempt<T>(
  url: string,
  callerSignal: AbortSignal | undefined,
  policy: FetchPolicy,
): Promise<T> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(
    () => timeoutController.abort(new TimeoutError(url, policy.timeoutMs)),
    policy.timeoutMs,
  );

  // Combine caller signal + our timeout signal. When callerSignal is already
  // aborted this still works correctly — the combined signal is immediately
  // aborted.
  const combined = callerSignal
    ? AbortSignal.any([callerSignal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const res = await fetch(url, { signal: combined });
    clearTimeout(timeoutId);

    if (!res.ok) throw new HttpError(res.status);

    const json = (await res.json()) as unknown;
    // Envelope unwrapping: if the server wrapped the payload in { data, total }
    // the client receives the unwrapped shape transparently.
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
  } catch (err) {
    clearTimeout(timeoutId);

    // Re-throw HttpError as-is (already typed).
    if (err instanceof HttpError) throw err;

    // Syntax errors from malformed JSON propagate directly (not network errors).
    if (err instanceof SyntaxError) throw err;

    // Classify abort origin: if our controller fired the abort, it's a timeout.
    if (
      err instanceof Error &&
      err.name === 'AbortError' &&
      timeoutController.signal.aborted
    ) {
      throw new TimeoutError(url, policy.timeoutMs);
    }

    // Caller-initiated abort propagates directly and should not be retried.
    if (callerSignal?.aborted) throw err;

    // Anything else from fetch() is a network-level failure.
    throw new NetworkError(url, err);
  }
}

/**
 * Whether a failure should be retried. We only retry timeout and network
 * errors (transient). HTTP errors (4xx / 5xx) are deterministic and retrying
 * them would mask real failures. HttpError also covers non-retryable
 * server errors like 404 or 403.
 */
function isRetryable(err: unknown): boolean {
  return err instanceof TimeoutError || err instanceof NetworkError;
}

/**
 * Jittered sleep: waits a random duration in [0, jitterMs).
 * Returns immediately if jitterMs is 0.
 */
function jitterSleep(jitterMs: number): Promise<void> {
  if (jitterMs <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, Math.random() * jitterMs));
}

/**
 * Execute the fetch with up to `policy.maxAttempts` attempts, applying jitter
 * between retries.
 *
 * @internal
 */
async function fetchWithRetry<T>(
  url: string,
  callerSignal: AbortSignal | undefined,
  policy: FetchPolicy,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await fetchAttempt<T>(url, callerSignal, policy);
    } catch (err) {
      lastError = err;
      if (attempt < policy.maxAttempts && isRetryable(err)) {
        await jitterSleep(policy.retryJitterMs);
        continue;
      }
      throw err;
    }
  }

  // Unreachable in practice (loop always throws or returns), but TypeScript
  // needs this to know the function always returns T or throws.
  throw lastError;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function dedupedFetchJson<T>(
  url: string,
  signal?: AbortSignal,
  policy: FetchPolicy = DEFAULT_FETCH_POLICY,
): Promise<T> {
  const existing = inFlightRequests.get(url);
  if (existing) return existing.promise as Promise<T>;

  const request = fetchWithRetry<T>(url, signal, policy);

  const entry: DedupeEntry = { promise: request };
  inFlightRequests.set(url, entry);

  request.then(
    () => {
      // Success: hold the outcome for the grace window, then evict.
      if (inFlightRequests.get(url) === entry) scheduleEviction(url, entry);
    },
    () => {
      // Failure: evict immediately. A grace window on rejections would make a
      // transient blip sticky for 30s and break retry-after-failure, so
      // failures keep the original evict-on-settle behaviour.
      if (inFlightRequests.get(url) === entry) forget(url);
    },
  );

  return request;
}

/**
 * Number of entries currently held, in-flight and within-grace combined.
 *
 * Test-only observability for the eviction assertions — `dedupedFetchJson`'s
 * signature and behaviour are unchanged by its presence. Not used in app code.
 */
export function __dedupeEntryCount(): number {
  return inFlightRequests.size;
}
