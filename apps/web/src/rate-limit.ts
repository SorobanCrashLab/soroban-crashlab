/**
 * API proxy rate limiter — two-layer limiting: IP (outer) + principal (inner).
 *
 * ## Layer 1: IP-keyed fixed-window (outer)
 *
 * Protects against unauthenticated floods and distributed attacks. Keyed on
 * `x-forwarded-for` / `x-real-ip` so it fires before any identity resolution.
 * A shared NAT that causes false positives here is defended by layer 2, which
 * splits the shared IP into per-principal buckets.
 *
 * ## Layer 2: Principal-keyed sliding-window (inner)
 *
 * Runs after `resolvePrincipal()` returns the caller's stable, secret-free
 * subject. Different principals are never bucketed together: one misbehaving
 * token cannot exhaust the budget for another token even if both come from the
 * same IP. Anonymous callers share a single `'anonymous'` bucket, so
 * unauthenticated flood after IP rotation is still capped.
 *
 * Route classes (`auth`, `fuzz-trigger`, `artifact-upload`, `replay`)
 * carry tighter limits than the `default` class — see `src/lib/rate-limit.ts`
 * for the full policy table and fail-open vs fail-closed decisions.
 *
 * ## Response envelope on 429
 *
 * Both layers emit the same structured envelope:
 *
 *   { error: string, code: 'RATE_LIMITED' }
 *
 * Headers: `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining`,
 * `RateLimit-Reset`. Neither layer echoes the caller's credential or token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolvePrincipal, checkRbacPermission } from './lib/rbac';
import { applyPrincipalRateLimit } from './lib/rate-limit';
import { codedErrorResponse } from './lib/error-codes';

// ─── IP-layer configuration ───────────────────────────────────────────────────

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 120;
const RATE_LIMIT_WINDOW_MS = readPositiveInteger(
  process.env.CRASHLAB_API_RATE_LIMIT_WINDOW_MS,
  DEFAULT_WINDOW_MS,
);
const RATE_LIMIT_MAX_REQUESTS = readPositiveInteger(
  process.env.CRASHLAB_API_RATE_LIMIT_MAX_REQUESTS,
  DEFAULT_MAX_REQUESTS,
);

const globalForRateLimit = globalThis as unknown as {
  crashlabApiRateLimitBuckets?: Map<string, RateLimitBucket>;
  crashlabApiRateLimitLastCleanup?: number;
};

const buckets =
  globalForRateLimit.crashlabApiRateLimitBuckets ??
  new Map<string, RateLimitBucket>();

globalForRateLimit.crashlabApiRateLimitBuckets = buckets;

// ─── correlation ID ───────────────────────────────────────────────────────────

/**
 * Generates a correlation ID for request tracing.
 *
 * Format: `<timestamp>-<random>-<random>` — sortable by issuance time and
 * unique enough to correlate a request across logs and responses.
 */
export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}-${Math.random().toString(36).substring(2, 11)}`;
}

// ─── proxy ────────────────────────────────────────────────────────────────────

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (request.method === 'OPTIONS') {
    return NextResponse.next();
  }

  // ── RBAC check (resolves principal as a side effect) ──────────────────────
  //
  // `checkRbacPermission` already calls `resolvePrincipal` internally. To
  // avoid a second resolution we call `resolvePrincipal` once here so both
  // RBAC and the per-principal limiter share the same identity lookup.
  const principal = await resolvePrincipal(request);

  // RBAC enforcement — must run before principal rate limiting so that a
  // forbidden principal gets a 403 rather than consuming a rate-limit slot.
  const rbacDenial = await checkRbacPermission(request);
  if (rbacDenial) {
    return rbacDenial;
  }

  const now = Date.now();
  const pathname = request.nextUrl.pathname;
  const method = request.method;

  // ── Layer 2: per-principal rate limit ─────────────────────────────────────

  const principalDecision = applyPrincipalRateLimit(
    principal.subject,
    method,
    pathname,
    now,
  );

  if (!principalDecision.allowed) {
    const response = codedErrorResponse('RATE_LIMITED');
    response.headers.set('Retry-After', String(Math.max(principalDecision.retryAfterSeconds, 1)));
    setPrincipalRateLimitHeaders(response, principalDecision.remaining, principalDecision.resetAtMs, now);
    setCorrelationId(response, request);
    return response;
  }

  // ── Layer 1: IP rate limit ────────────────────────────────────────────────

  cleanupExpiredBuckets(now);

  const ipKey = clientKey(request);
  const bucket = currentBucket(ipKey, now);
  bucket.count += 1;

  const ipRemaining = Math.max(RATE_LIMIT_MAX_REQUESTS - bucket.count, 0);
  const ipResetSeconds = Math.ceil((bucket.resetAt - now) / 1000);

  if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
    const response = codedErrorResponse('RATE_LIMITED');
    response.headers.set('Retry-After', String(Math.max(ipResetSeconds, 1)));
    setRateLimitHeaders(response, ipRemaining, bucket.resetAt, now);
    setCorrelationId(response, request);
    return response;
  }

  // ── Allowed ───────────────────────────────────────────────────────────────

  const response = NextResponse.next();
  setRateLimitHeaders(response, ipRemaining, bucket.resetAt, now);
  setCorrelationId(response, request);
  return response;
}

// ─── IP bucket helpers ────────────────────────────────────────────────────────

function currentBucket(key: string, now: number): RateLimitBucket {
  const existing = buckets.get(key);

  if (existing && existing.resetAt > now) {
    return existing;
  }

  const bucket = {
    count: 0,
    resetAt: now + RATE_LIMIT_WINDOW_MS,
  };

  buckets.set(key, bucket);
  return bucket;
}

function clientKey(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const clientIp = forwardedFor?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();

  return clientIp || realIp || 'unknown';
}

function cleanupExpiredBuckets(now: number): void {
  const lastCleanup = globalForRateLimit.crashlabApiRateLimitLastCleanup ?? 0;

  if (now - lastCleanup < RATE_LIMIT_WINDOW_MS) {
    return;
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }

  globalForRateLimit.crashlabApiRateLimitLastCleanup = now;
}

// ─── header helpers ───────────────────────────────────────────────────────────

const CORRELATION_ID_HEADER = 'x-correlation-id';

function setCorrelationId(response: NextResponse, request: NextRequest): void {
  const id = request.headers.get(CORRELATION_ID_HEADER) || generateCorrelationId();
  response.headers.set(CORRELATION_ID_HEADER, id);
  response.headers.set('X-Correlation-ID', id);
}

function setRateLimitHeaders(
  response: NextResponse,
  remaining: number,
  resetAt: number,
  now: number,
): void {
  response.headers.set('RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
  response.headers.set('RateLimit-Remaining', String(remaining));
  response.headers.set(
    'RateLimit-Reset',
    String(Math.max(Math.ceil((resetAt - now) / 1000), 0)),
  );
}

function setPrincipalRateLimitHeaders(
  response: NextResponse,
  remaining: number,
  resetAtMs: number,
  now: number,
): void {
  response.headers.set('RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
  response.headers.set('RateLimit-Remaining', String(remaining));
  response.headers.set(
    'RateLimit-Reset',
    String(Math.max(Math.ceil((resetAtMs - now) / 1000), 0)),
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
