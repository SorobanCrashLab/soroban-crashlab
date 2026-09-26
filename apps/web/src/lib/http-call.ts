/**
 * Uniform outbound HTTP policy for third-party integrations (#1633).
 *
 * Every call to Slack, PagerDuty, Grafana, … used to pick its own timeout (or
 * none), with no retry. A hung provider then held the serverless function to
 * the platform limit and the UI spun forever; a transient 429/503 surfaced as
 * a permanent-looking failure.
 *
 * `httpCall(name, url, init, policy)`:
 *  - Per-attempt timeout plus a total budget covering every attempt, backoff
 *    and the response body, so the call always ends inside the function limit.
 *  - Bounded retries with jittered backoff on network errors, timeouts, 408,
 *    429 and 5xx — only for idempotent methods, or when the caller vouches
 *    for idempotency (e.g. a request carrying a provider dedup key).
 *  - Honours `Retry-After` (seconds or HTTP date), capped by the backoff
 *    ceiling and the remaining budget.
 *  - Resolves with the final `Response` (callers keep their own status
 *    handling); throws `OutboundTimeoutError` / `OutboundNetworkError`, which
 *    map onto the error-code catalog via `outboundErrorCode`.
 *
 * Default policies are documented in docs/INTEGRATIONS.md.
 */

import { logger } from './logger';
import { computeBackoffMs, type BackoffPolicy } from './retry-backoff';
import {
  OUTBOUND_ATTEMPT_TIMEOUT_MS,
  OUTBOUND_RETRY_BASE_MS,
  OUTBOUND_RETRY_MAX_MS,
  OUTBOUND_TOTAL_BUDGET_MS,
} from './timeouts';
import type { ErrorCode } from './error-codes';

export interface HttpCallPolicy {
  /** Abort one attempt that has not produced response headers by then. */
  attemptTimeoutMs: number;
  /** Hard ceiling for the whole call: attempts, backoff and body read. */
  totalBudgetMs: number;
  /** Retries after the first attempt (so maxRetries + 1 attempts at most). */
  maxRetries: number;
  backoff: BackoffPolicy;
  /**
   * Retry a non-idempotent method (POST/PATCH). Only set this when the
   * provider deduplicates, e.g. PagerDuty events carrying a `dedup_key`.
   */
  idempotent?: boolean;
}

export const DEFAULT_HTTP_CALL_POLICY: HttpCallPolicy = Object.freeze({
  attemptTimeoutMs: OUTBOUND_ATTEMPT_TIMEOUT_MS,
  totalBudgetMs: OUTBOUND_TOTAL_BUDGET_MS,
  maxRetries: 2,
  backoff: Object.freeze({ baseMs: OUTBOUND_RETRY_BASE_MS, maxMs: OUTBOUND_RETRY_MAX_MS }),
});

export interface HttpCallOptions extends Partial<HttpCallPolicy> {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

export class OutboundCallError extends Error {
  readonly integration: string;
  readonly attempts: number;

  constructor(integration: string, message: string, attempts: number) {
    super(message);
    this.name = 'OutboundCallError';
    this.integration = integration;
    this.attempts = attempts;
  }
}

/** The attempt or the total budget ran out before the provider answered. */
export class OutboundTimeoutError extends OutboundCallError {
  readonly timeoutMs: number;

  constructor(integration: string, timeoutMs: number, attempts: number) {
    super(integration, `${integration} did not respond within ${timeoutMs} ms`, attempts);
    this.name = 'OutboundTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/** DNS, connection refused, TLS or socket failure. */
export class OutboundNetworkError extends OutboundCallError {
  constructor(integration: string, cause: unknown, attempts: number) {
    super(
      integration,
      `${integration} is unreachable: ${cause instanceof Error ? cause.message : String(cause)}`,
      attempts,
    );
    this.name = 'OutboundNetworkError';
  }
}

/** Maps an outbound failure onto the error-code catalog. */
export function outboundErrorCode(error: unknown): ErrorCode {
  if (error instanceof OutboundTimeoutError) return 'INTEGRATION_TIMEOUT';
  if (error instanceof OutboundNetworkError) return 'INTEGRATION_UNAVAILABLE';
  return 'INTERNAL_ERROR';
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Retry-After in ms, from delta-seconds or an HTTP date; null when absent. */
export function parseRetryAfterMs(header: string | null, nowMs: number = Date.now()): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - nowMs);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function httpCall(
  name: string,
  url: string | URL,
  init: RequestInit = {},
  options: HttpCallOptions = {},
): Promise<Response> {
  const policy: HttpCallPolicy = {
    attemptTimeoutMs: options.attemptTimeoutMs ?? DEFAULT_HTTP_CALL_POLICY.attemptTimeoutMs,
    totalBudgetMs: options.totalBudgetMs ?? DEFAULT_HTTP_CALL_POLICY.totalBudgetMs,
    maxRetries: options.maxRetries ?? DEFAULT_HTTP_CALL_POLICY.maxRetries,
    backoff: options.backoff ?? DEFAULT_HTTP_CALL_POLICY.backoff,
    idempotent: options.idempotent,
  };
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const method = (init.method ?? 'GET').toUpperCase();
  const retriesAllowed = policy.idempotent === true || IDEMPOTENT_METHODS.has(method);
  const maxAttempts = retriesAllowed ? policy.maxRetries + 1 : 1;

  const started = Date.now();
  const deadline = started + policy.totalBudgetMs;
  // Aborts at the deadline even after headers arrive, so a stalled body read
  // is bounded too. Unref'd: it must never keep the process alive.
  const budget = new AbortController();
  const budgetTimer = setTimeout(() => budget.abort(), policy.totalBudgetMs);
  (budgetTimer as { unref?: () => void }).unref?.();

  const callerSignal = init.signal ?? undefined;

  for (let attempt = 1; ; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new OutboundTimeoutError(name, policy.totalBudgetMs, attempt - 1);

    const attemptTimeout = Math.min(policy.attemptTimeoutMs, remaining);
    const attemptController = new AbortController();
    const attemptTimer = setTimeout(() => attemptController.abort(), attemptTimeout);
    const signals = [attemptController.signal, budget.signal, ...(callerSignal ? [callerSignal] : [])];

    let response: Response | null = null;
    let failure: OutboundCallError | null = null;
    try {
      response = await fetchImpl(url, { ...init, signal: AbortSignal.any(signals) });
    } catch (error) {
      // The caller cancelled: not ours to retry or re-label.
      if (callerSignal?.aborted) throw error;
      failure =
        attemptController.signal.aborted || budget.signal.aborted
          ? new OutboundTimeoutError(name, budget.signal.aborted ? policy.totalBudgetMs : attemptTimeout, attempt)
          : new OutboundNetworkError(name, error, attempt);
    } finally {
      clearTimeout(attemptTimer);
    }

    const retryable = failure !== null || isRetryableStatus(response!.status);
    if (!retryable || attempt >= maxAttempts || budget.signal.aborted) {
      if (failure) throw failure;
      return response!;
    }

    const backoffMs = computeBackoffMs(attempt, policy.backoff, random);
    const retryAfterMs = response ? parseRetryAfterMs(response.headers.get('retry-after')) : null;
    const waitMs = Math.min(Math.max(backoffMs, retryAfterMs ?? 0), policy.backoff.maxMs);

    // Not enough budget left to wait and still make a meaningful attempt.
    if (Date.now() + waitMs >= deadline) {
      if (failure) throw failure;
      return response!;
    }

    // The body of a response we are about to retry is never read.
    await response?.body?.cancel().catch(() => undefined);
    logger.warn('Retrying outbound call', {
      integration: name,
      attempt,
      status: response?.status,
      error: failure?.message,
      waitMs,
    });
    await sleep(waitMs);
  }
}
