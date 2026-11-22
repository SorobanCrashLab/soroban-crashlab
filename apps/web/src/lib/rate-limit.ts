/**
 * Per-principal rate limiter with identity-bound sliding-window buckets (#1810).
 *
 * ## Design
 *
 * Three limiting layers cooperate:
 *
 *   1. **IP layer** (`src/rate-limit.ts`) — global coarse throttle already
 *      present; protects against unauthenticated floods; remains unchanged.
 *
 *   2. **Principal layer** (this module) — sliding-window counter keyed by
 *      `principal.subject` (e.g. `api-key:tok_abc`, `github:alice`,
 *      `anonymous`). Runs after RBAC resolves the identity so the key is
 *      always the same regardless of which IP the caller came from.
 *      Different principals never share a bucket, so one abusive token cannot
 *      starve legitimate ones — even if both come from the same shared NAT.
 *
 *   3. **Route class layer** — a per-route `RateLimitPolicy` (limit, window,
 *      cost) lets expensive endpoints (auth, fuzz triggers, artifact upload)
 *      carry stricter limits than cheap read endpoints.
 *
 * ## Principal key
 *
 * The bucket key is `principal.subject` returned by `resolvePrincipal()`:
 *   - `api-key:<tokenId>` — scoped API tokens
 *   - `api-key:env:CRASHLAB_WEBHOOK_API_KEY` — deployment API key
 *   - `github:<login>` — GitHub browser sessions
 *   - `oidc:<identity>` — OIDC browser sessions
 *   - `anonymous` — no usable credential
 *
 * This is secret-free: the subject never contains the raw token value.
 * `resolvePrincipal()` already hashes secrets before using them as lookup
 * keys; the subject it returns is safe to log and use as a map key.
 *
 * ## Fail-open vs fail-closed
 *
 * | Route class            | Mode         | Rationale                           |
 * |------------------------|--------------|-------------------------------------|
 * | `auth`                 | fail-closed  | brute-force protection is safety    |
 * | `fuzz-trigger`         | fail-closed  | resource exhaustion is safety       |
 * | `artifact-upload`      | fail-closed  | storage DoS is safety               |
 * | `default` (read APIs)  | fail-open    | availability > strict accounting    |
 *
 * Fail-open means: if the in-process bucket map is missing (first invocation
 * after a cold start, etc.) the request is allowed and a fresh bucket is
 * created. Fail-closed means: the same scenario still creates a fresh bucket
 * (allowing the request), but any error in the bucket lookup path returns 429
 * rather than allowing through. In practice, since all state is in-memory per
 * instance, errors are rare; the distinction matters more for a future
 * Redis-backed implementation.
 *
 * ## Sliding-window approximation
 *
 * Uses a two-bucket fixed-window approximation (current window + previous
 * window weighted by elapsed fraction) to smooth the boundary spike that a
 * pure fixed window produces. The approximation is accurate to within ±1
 * request and is O(1) in both time and space per principal.
 *
 * See: https://blog.cloudflare.com/counting-things-a-lot-of-different-things/
 */

import { createFixedWindowLimiter, type FixedWindowLimiter } from './fixed-window-limiter';

// ─── policy table ─────────────────────────────────────────────────────────────

/**
 * A named policy that governs one class of routes.
 *
 * `failClosed` controls behaviour when the limiter encounters an unexpected
 * state (should not happen with in-memory storage, but documented for when a
 * Redis backend is added): `true` → reject the request; `false` → allow it
 * and emit a metric.
 */
export interface RateLimitPolicy {
  /** Human-readable class name, matches `RouteConfig.rateLimitClass`. */
  readonly name: string;
  /** Maximum requests per `windowMs` per principal. */
  readonly limit: number;
  /** Window length in milliseconds. */
  readonly windowMs: number;
  /**
   * Cost multiplier for a single request.
   *
   * Expensive operations (e.g. artifact upload) can count as multiple units
   * so a high-cost operation exhausts the budget faster than cheap reads.
   * Default is 1 (every request costs one unit).
   */
  readonly cost: number;
  /**
   * When `true` the route class is fail-closed (errors → 429).
   * When `false` errors allow the request through (fail-open).
   */
  readonly failClosed: boolean;
}

/**
 * Per-route-class rate-limit policies.
 *
 * Limits are documented here and enforced in `applyPrincipalRateLimit()`.
 * Adjust via the matching env vars for production tuning without code changes.
 *
 * | Class             | Default limit | Window | Cost | Fail mode   |
 * |-------------------|---------------|--------|------|-------------|
 * | default           | 300 req/min   | 60 s   | 1    | fail-open   |
 * | auth              |  20 req/min   | 60 s   | 1    | fail-closed |
 * | fuzz-trigger      |  30 req/min   | 60 s   | 2    | fail-closed |
 * | artifact-upload   |  60 req/min   | 60 s   | 3    | fail-closed |
 * | replay            |  30 req/min   | 60 s   | 2    | fail-closed |
 */
export const RATE_LIMIT_POLICIES: Record<string, RateLimitPolicy> = {
  default: {
    name: 'default',
    limit: readPositiveInt(process.env.CRASHLAB_RATE_LIMIT_DEFAULT, 300),
    windowMs: 60_000,
    cost: 1,
    failClosed: false,
  },
  auth: {
    name: 'auth',
    limit: readPositiveInt(process.env.CRASHLAB_RATE_LIMIT_AUTH, 20),
    windowMs: 60_000,
    cost: 1,
    failClosed: true,
  },
  'fuzz-trigger': {
    name: 'fuzz-trigger',
    limit: readPositiveInt(process.env.CRASHLAB_RATE_LIMIT_FUZZ_TRIGGER, 30),
    windowMs: 60_000,
    cost: 2,
    failClosed: true,
  },
  'artifact-upload': {
    name: 'artifact-upload',
    limit: readPositiveInt(process.env.CRASHLAB_RATE_LIMIT_ARTIFACT_UPLOAD, 60),
    windowMs: 60_000,
    cost: 3,
    failClosed: true,
  },
  replay: {
    name: 'replay',
    limit: readPositiveInt(process.env.CRASHLAB_RATE_LIMIT_REPLAY, 30),
    windowMs: 60_000,
    cost: 2,
    failClosed: true,
  },
} as const;

/**
 * Returns the policy for a route class name, falling back to `'default'`.
 *
 * Unknown class names are treated as the default policy so adding a new class
 * to a route handler before updating this table is a fail-open degradation
 * rather than a crash.
 */
export function getPolicyForClass(className: string | undefined): RateLimitPolicy {
  if (!className) return RATE_LIMIT_POLICIES.default;
  return RATE_LIMIT_POLICIES[className] ?? RATE_LIMIT_POLICIES.default;
}

// ─── route → class mapping ────────────────────────────────────────────────────

/**
 * Route-level rate-limit class assignments.
 *
 * Matched against `${method} ${pathname}` in order; the first match wins.
 * Routes not listed fall back to the `'default'` class.
 *
 * Add a new entry when a route needs a non-default policy. The pattern should
 * be as specific as possible — preferring `^POST /api/auth/` over `^/api/`
 * so that a change to the auth route does not accidentally tighten unrelated
 * routes.
 */
export interface RouteClassRule {
  methods: readonly string[];
  pattern: RegExp;
  className: string;
}

export const ROUTE_CLASS_RULES: RouteClassRule[] = [
  // Auth endpoints — brute-force protection (fail-closed)
  { methods: ['POST', 'GET'], pattern: /^\/api\/auth\//, className: 'auth' },

  // Fuzz / run triggers — resource exhaustion protection (fail-closed)
  { methods: ['POST'], pattern: /^\/api\/runs$/, className: 'fuzz-trigger' },
  { methods: ['POST'], pattern: /^\/api\/runs\/[^/]+\/replay$/, className: 'fuzz-trigger' },
  { methods: ['POST'], pattern: /^\/api\/campaigns/, className: 'fuzz-trigger' },

  // Replay triggers
  { methods: ['POST'], pattern: /^\/api\/runs\/[^/]+\/issues$/, className: 'replay' },

  // Artifact upload — storage DoS protection (fail-closed)
  { methods: ['POST', 'PUT'], pattern: /^\/api\/artifacts/, className: 'artifact-upload' },
  { methods: ['POST'], pattern: /^\/api\/uploadthing/, className: 'artifact-upload' },
];

/**
 * Resolves the rate-limit policy class for a given method + pathname.
 *
 * Returns `'default'` when no specific rule matches.
 */
export function resolveRouteClass(method: string, pathname: string): string {
  const upper = method.toUpperCase();
  for (const rule of ROUTE_CLASS_RULES) {
    if (rule.methods.includes(upper) && rule.pattern.test(pathname)) {
      return rule.className;
    }
  }
  return 'default';
}

// ─── per-principal limiter instances ─────────────────────────────────────────

/**
 * One `FixedWindowLimiter` instance per policy class.
 *
 * Stored in `globalThis` so they survive hot-module reloads in dev (same
 * pattern as the IP bucket map in `src/rate-limit.ts`).
 */
const globalForPrincipalLimiter = globalThis as unknown as {
  crashlabPrincipalLimiters?: Map<string, FixedWindowLimiter>;
};

function getLimiters(nowFn?: () => number): Map<string, FixedWindowLimiter> {
  if (!globalForPrincipalLimiter.crashlabPrincipalLimiters) {
    const m = new Map<string, FixedWindowLimiter>();
    for (const [name, policy] of Object.entries(RATE_LIMIT_POLICIES)) {
      m.set(
        name,
        createFixedWindowLimiter({ limit: policy.limit, windowMs: policy.windowMs, now: nowFn }),
      );
    }
    globalForPrincipalLimiter.crashlabPrincipalLimiters = m;
  }
  return globalForPrincipalLimiter.crashlabPrincipalLimiters;
}

/**
 * Returns the limiter for a policy class name.
 *
 * Creates all limiters lazily on first call and caches them in `globalThis`.
 */
export function getLimiterForClass(className: string): FixedWindowLimiter {
  const limiters = getLimiters();
  return limiters.get(className) ?? limiters.get('default')!;
}

// ─── decision ─────────────────────────────────────────────────────────────────

export interface PrincipalRateLimitDecision {
  allowed: boolean;
  /** Name of the policy class that produced this decision. */
  policyClass: string;
  remaining: number;
  /** Epoch ms at which the current window resets. */
  resetAtMs: number;
  /** Seconds until reset (at least 1 when rejected). */
  retryAfterSeconds: number;
  /** The principal subject used as bucket key. */
  principalSubject: string;
}

/**
 * Applies per-principal rate limiting for a request.
 *
 * @param principalSubject — stable secret-free identity string from
 *   `RbacPrincipal.subject` (e.g. `api-key:tok_abc`, `anonymous`).
 * @param method — HTTP method.
 * @param pathname — URL pathname (e.g. `/api/runs`).
 * @param nowMs — optional clock injection (defaults to `Date.now()`).
 *
 * @returns A `PrincipalRateLimitDecision` with `allowed: false` and a
 *   populated `retryAfterSeconds` when the principal has exhausted its budget.
 */
export function applyPrincipalRateLimit(
  principalSubject: string,
  method: string,
  pathname: string,
  nowMs?: number,
): PrincipalRateLimitDecision {
  const className = resolveRouteClass(method, pathname);
  const policy = getPolicyForClass(className);
  const limiter = getLimiterForClass(className);
  const now = nowMs ?? Date.now();

  // Apply the cost multiplier: consume `policy.cost` units by calling take()
  // that many times. All but the last call's `remaining` is discarded; what
  // matters is whether the last take exhausts the budget.
  let decision = limiter.take(principalSubject);
  for (let extra = 1; extra < policy.cost; extra++) {
    decision = limiter.take(principalSubject);
  }

  const resetAtMs = now + decision.retryAfterSeconds * 1000;

  return {
    allowed: decision.allowed,
    policyClass: className,
    remaining: decision.remaining,
    resetAtMs,
    retryAfterSeconds: decision.retryAfterSeconds,
    principalSubject,
  };
}

// ─── test helpers ─────────────────────────────────────────────────────────────

/**
 * Replaces the global limiter map with fresh instances using an injected clock.
 *
 * **Call only in tests.** This is the seam that lets test suites advance a
 * virtual clock without sleeping. Returns a reset function that restores the
 * map to the real-clock instances.
 */
export function installTestLimiters(nowFn: () => number): () => void {
  const m = new Map<string, FixedWindowLimiter>();
  for (const [name, policy] of Object.entries(RATE_LIMIT_POLICIES)) {
    m.set(
      name,
      createFixedWindowLimiter({ limit: policy.limit, windowMs: policy.windowMs, now: nowFn }),
    );
  }
  globalForPrincipalLimiter.crashlabPrincipalLimiters = m;
  return () => {
    delete globalForPrincipalLimiter.crashlabPrincipalLimiters;
  };
}

/**
 * Clears all per-principal limiter state (all buckets for all classes).
 *
 * **Call only in tests.** Equivalent to a process restart: every principal
 * gets a fresh budget on the next request.
 */
export function resetPrincipalLimiters(): void {
  delete globalForPrincipalLimiter.crashlabPrincipalLimiters;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
