/**
 * Fixed-window counter keyed by caller identity.
 *
 * `src/rate-limit.ts` already limits every API route per client IP in the
 * proxy. Routes whose callers share or rotate IPs (CI runners) also limit per
 * credential with this, so one leaked or misconfigured token cannot flood a
 * write path. In-memory per instance, like the proxy limiter.
 */

export interface FixedWindowDecision {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets (at least 1 when rejected). */
  retryAfterSeconds: number;
}

export interface FixedWindowLimiter {
  take(key: string): FixedWindowDecision;
  reset(): void;
}

export function createFixedWindowLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): FixedWindowLimiter {
  const now = options.now ?? Date.now;
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    take(key: string): FixedWindowDecision {
      const t = now();
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= t) {
        // Drop expired buckets opportunistically so the map stays bounded by
        // the number of keys active within one window.
        for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
        bucket = { count: 0, resetAt: t + options.windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      const allowed = bucket.count <= options.limit;
      return {
        allowed,
        remaining: Math.max(options.limit - bucket.count, 0),
        retryAfterSeconds: Math.max(Math.ceil((bucket.resetAt - t) / 1000), allowed ? 0 : 1),
      };
    },
    reset(): void {
      buckets.clear();
    },
  };
}
