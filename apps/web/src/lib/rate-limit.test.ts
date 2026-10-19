/**
 * Per-principal rate limiter tests (#1810).
 *
 * All tests inject a virtual clock so there are no real sleeps:
 *   - `installTestLimiters(nowFn)` replaces the global limiter instances.
 *   - Advancing the virtual time past the window triggers a bucket reset.
 *
 * Coverage:
 *   - Policy table resolution (class names, limits, costs, fail-mode flags)
 *   - Route → class mapping (`resolveRouteClass`)
 *   - `applyPrincipalRateLimit` — exhaustion, recovery, cost multiplier
 *   - Principal isolation: two different subjects never share a bucket
 *   - Anonymous subjects share one bucket (intended behaviour)
 *   - `installTestLimiters` / `resetPrincipalLimiters` teardown
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  RATE_LIMIT_POLICIES,
  ROUTE_CLASS_RULES,
  applyPrincipalRateLimit,
  getPolicyForClass,
  installTestLimiters,
  resetPrincipalLimiters,
  resolveRouteClass,
} from './rate-limit';

// ─── clock injection helpers ──────────────────────────────────────────────────

function makeClock(startMs = 0) {
  let t = startMs;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    set: (ms: number) => {
      t = ms;
    },
  };
}

// ─── policy table ─────────────────────────────────────────────────────────────

describe('RATE_LIMIT_POLICIES', () => {
  it('contains all required route classes', () => {
    const required = ['default', 'auth', 'fuzz-trigger', 'artifact-upload', 'replay'];
    for (const cls of required) {
      expect(RATE_LIMIT_POLICIES).toHaveProperty(cls);
    }
  });

  it('auth policy is fail-closed', () => {
    expect(RATE_LIMIT_POLICIES.auth.failClosed).toBe(true);
  });

  it('fuzz-trigger policy is fail-closed', () => {
    expect(RATE_LIMIT_POLICIES['fuzz-trigger'].failClosed).toBe(true);
  });

  it('artifact-upload policy is fail-closed', () => {
    expect(RATE_LIMIT_POLICIES['artifact-upload'].failClosed).toBe(true);
  });

  it('replay policy is fail-closed', () => {
    expect(RATE_LIMIT_POLICIES.replay.failClosed).toBe(true);
  });

  it('default policy is fail-open', () => {
    expect(RATE_LIMIT_POLICIES.default.failClosed).toBe(false);
  });

  it('auth limit is tighter than default', () => {
    expect(RATE_LIMIT_POLICIES.auth.limit).toBeLessThan(RATE_LIMIT_POLICIES.default.limit);
  });

  it('fuzz-trigger has cost > 1', () => {
    expect(RATE_LIMIT_POLICIES['fuzz-trigger'].cost).toBeGreaterThan(1);
  });

  it('artifact-upload has cost > 1', () => {
    expect(RATE_LIMIT_POLICIES['artifact-upload'].cost).toBeGreaterThan(1);
  });

  it('all policies have a positive limit and windowMs', () => {
    for (const policy of Object.values(RATE_LIMIT_POLICIES)) {
      expect(policy.limit).toBeGreaterThan(0);
      expect(policy.windowMs).toBeGreaterThan(0);
    }
  });
});

// ─── getPolicyForClass ─────────────────────────────────────────────────────────

describe('getPolicyForClass', () => {
  it('returns the default policy for undefined class', () => {
    expect(getPolicyForClass(undefined)).toBe(RATE_LIMIT_POLICIES.default);
  });

  it('returns the default policy for empty string', () => {
    expect(getPolicyForClass('')).toBe(RATE_LIMIT_POLICIES.default);
  });

  it('returns the named policy when it exists', () => {
    expect(getPolicyForClass('auth')).toBe(RATE_LIMIT_POLICIES.auth);
    expect(getPolicyForClass('fuzz-trigger')).toBe(RATE_LIMIT_POLICIES['fuzz-trigger']);
  });

  it('falls back to default for unknown class names', () => {
    expect(getPolicyForClass('unknown-class')).toBe(RATE_LIMIT_POLICIES.default);
  });
});

// ─── resolveRouteClass ────────────────────────────────────────────────────────

describe('resolveRouteClass', () => {
  const cases: [string, string, string][] = [
    ['POST', '/api/auth/github', 'auth'],
    ['GET', '/api/auth/github', 'auth'],
    ['POST', '/api/runs', 'fuzz-trigger'],
    ['POST', '/api/runs/abc123/replay', 'fuzz-trigger'],
    ['POST', '/api/campaigns', 'fuzz-trigger'],
    ['POST', '/api/campaigns/new', 'fuzz-trigger'],
    ['POST', '/api/runs/abc123/issues', 'replay'],
    ['POST', '/api/artifacts/validate', 'artifact-upload'],
    ['PUT', '/api/artifacts/123', 'artifact-upload'],
    ['POST', '/api/uploadthing', 'artifact-upload'],
    ['GET', '/api/runs', 'default'],
    ['GET', '/api/runs/abc123', 'default'],
    ['GET', '/api/settings', 'default'],
    ['POST', '/api/webhooks', 'default'],
    ['GET', '/api/health', 'default'],
  ];

  it.each(cases)('%s %s → class "%s"', (method, path, expected) => {
    expect(resolveRouteClass(method, path)).toBe(expected);
  });

  it('returns default for OPTIONS', () => {
    expect(resolveRouteClass('OPTIONS', '/api/auth/github')).toBe('default');
  });

  it('is case-insensitive for the method', () => {
    expect(resolveRouteClass('post', '/api/runs')).toBe('fuzz-trigger');
    expect(resolveRouteClass('Post', '/api/runs')).toBe('fuzz-trigger');
  });

  it('all ROUTE_CLASS_RULES point to a known policy class', () => {
    for (const rule of ROUTE_CLASS_RULES) {
      expect(RATE_LIMIT_POLICIES).toHaveProperty(rule.className);
    }
  });
});

// ─── applyPrincipalRateLimit ──────────────────────────────────────────────────

describe('applyPrincipalRateLimit', () => {
  let clock: ReturnType<typeof makeClock>;
  let reset: () => void;

  beforeEach(() => {
    clock = makeClock(1_000_000);
    reset = installTestLimiters(clock.now);
  });

  afterEach(() => {
    reset();
  });

  // ── basic allow / deny ──────────────────────────────────────────────────────

  it('allows a request within the default limit', () => {
    const d = applyPrincipalRateLimit('api-key:tok_abc', 'GET', '/api/runs', clock.now());
    expect(d.allowed).toBe(true);
    expect(d.policyClass).toBe('default');
    expect(d.principalSubject).toBe('api-key:tok_abc');
  });

  it('returns decreasing remaining on successive calls', () => {
    const subject = 'api-key:tok_123';
    const first = applyPrincipalRateLimit(subject, 'GET', '/api/runs', clock.now());
    const second = applyPrincipalRateLimit(subject, 'GET', '/api/runs', clock.now());
    expect(second.remaining).toBe(first.remaining - 1);
  });

  it('rejects once the limit is exhausted', () => {
    const subject = 'api-key:tok_exhaust';
    const limit = RATE_LIMIT_POLICIES.auth.limit;

    for (let i = 0; i < limit; i++) {
      const d = applyPrincipalRateLimit(subject, 'POST', '/api/auth/github', clock.now());
      expect(d.allowed).toBe(true);
    }

    const rejected = applyPrincipalRateLimit(subject, 'POST', '/api/auth/github', clock.now());
    expect(rejected.allowed).toBe(false);
    expect(rejected.remaining).toBe(0);
    expect(rejected.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('populates retryAfterSeconds >= 1 on rejection', () => {
    const subject = 'github:alice';
    const limit = RATE_LIMIT_POLICIES.auth.limit;
    for (let i = 0; i <= limit; i++) {
      applyPrincipalRateLimit(subject, 'POST', '/api/auth/github', clock.now());
    }
    const d = applyPrincipalRateLimit(subject, 'POST', '/api/auth/github', clock.now());
    expect(d.allowed).toBe(false);
    expect(d.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  // ── window recovery ─────────────────────────────────────────────────────────

  it('resets budget after the window elapses', () => {
    const subject = 'api-key:tok_recover';
    const policy = RATE_LIMIT_POLICIES.auth;
    const limit = policy.limit;

    // Exhaust the budget.
    for (let i = 0; i <= limit; i++) {
      applyPrincipalRateLimit(subject, 'POST', '/api/auth/github', clock.now());
    }
    expect(
      applyPrincipalRateLimit(subject, 'POST', '/api/auth/github', clock.now()).allowed,
    ).toBe(false);

    // Advance past the window.
    clock.advance(policy.windowMs + 1);

    // Budget should be fully restored.
    const d = applyPrincipalRateLimit(subject, 'POST', '/api/auth/github', clock.now());
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(limit - 1);
  });

  // ── principal isolation ─────────────────────────────────────────────────────

  it('different principals have independent buckets', () => {
    const alice = 'api-key:tok_alice';
    const bob = 'api-key:tok_bob';

    // Exhaust alice's auth budget.
    const limit = RATE_LIMIT_POLICIES.auth.limit;
    for (let i = 0; i <= limit; i++) {
      applyPrincipalRateLimit(alice, 'POST', '/api/auth/github', clock.now());
    }

    // alice is blocked.
    expect(
      applyPrincipalRateLimit(alice, 'POST', '/api/auth/github', clock.now()).allowed,
    ).toBe(false);

    // bob is unaffected.
    const bobResult = applyPrincipalRateLimit(bob, 'POST', '/api/auth/github', clock.now());
    expect(bobResult.allowed).toBe(true);
    expect(bobResult.remaining).toBe(limit - 1);
  });

  it('api-key principal does not share bucket with github principal', () => {
    const apiKey = 'api-key:tok_xyz';
    const github = 'github:alice';
    const limit = RATE_LIMIT_POLICIES.auth.limit;

    for (let i = 0; i <= limit; i++) {
      applyPrincipalRateLimit(apiKey, 'POST', '/api/auth/github', clock.now());
    }
    expect(
      applyPrincipalRateLimit(apiKey, 'POST', '/api/auth/github', clock.now()).allowed,
    ).toBe(false);

    expect(
      applyPrincipalRateLimit(github, 'POST', '/api/auth/github', clock.now()).allowed,
    ).toBe(true);
  });

  // ── anonymous bucket ────────────────────────────────────────────────────────

  it('anonymous principals share one bucket (intended)', () => {
    const limit = RATE_LIMIT_POLICIES.auth.limit;

    // Two anonymous callers from different IPs share the anonymous bucket.
    for (let i = 0; i < limit; i++) {
      applyPrincipalRateLimit('anonymous', 'POST', '/api/auth/github', clock.now());
    }

    // The second "caller" (same subject = anonymous) should be blocked.
    expect(
      applyPrincipalRateLimit('anonymous', 'POST', '/api/auth/github', clock.now()).allowed,
    ).toBe(false);
  });

  // ── cost multiplier ─────────────────────────────────────────────────────────

  it('cost-2 fuzz-trigger exhausts budget twice as fast', () => {
    const subject = 'api-key:tok_fuzz';
    const policy = RATE_LIMIT_POLICIES['fuzz-trigger'];
    // With cost=2, each request consumes 2 units from a budget of `limit`.
    const expectedRequests = Math.floor(policy.limit / policy.cost);

    for (let i = 0; i < expectedRequests; i++) {
      const d = applyPrincipalRateLimit(subject, 'POST', '/api/runs', clock.now());
      if (!d.allowed) {
        // Should not be blocked before we reach expectedRequests.
        throw new Error(`Blocked at request ${i}, expected to be allowed until ${expectedRequests - 1}`);
      }
    }

    // The next request should be blocked (or we're at 0 remaining).
    const after = applyPrincipalRateLimit(subject, 'POST', '/api/runs', clock.now());
    // Either blocked or remaining is 0.
    expect(after.remaining === 0 || !after.allowed).toBe(true);
  });

  it('cost-3 artifact-upload exhausts budget three times as fast', () => {
    const subject = 'api-key:tok_upload';
    const policy = RATE_LIMIT_POLICIES['artifact-upload'];
    const expectedRequests = Math.floor(policy.limit / policy.cost);

    for (let i = 0; i < expectedRequests; i++) {
      applyPrincipalRateLimit(subject, 'POST', '/api/artifacts/upload', clock.now());
    }

    const after = applyPrincipalRateLimit(subject, 'POST', '/api/artifacts/upload', clock.now());
    expect(after.remaining === 0 || !after.allowed).toBe(true);
  });

  // ── response fields ─────────────────────────────────────────────────────────

  it('policyClass matches the resolved route class', () => {
    const d = applyPrincipalRateLimit('api-key:tok_x', 'POST', '/api/auth/github', clock.now());
    expect(d.policyClass).toBe('auth');
  });

  it('principalSubject is echoed in decision', () => {
    const subject = 'github:bob';
    const d = applyPrincipalRateLimit(subject, 'GET', '/api/runs', clock.now());
    expect(d.principalSubject).toBe(subject);
  });

  it('resetAtMs is in the future on allow', () => {
    const now = clock.now();
    const d = applyPrincipalRateLimit('api-key:tok_ts', 'GET', '/api/runs', now);
    expect(d.resetAtMs).toBeGreaterThan(now);
  });

  it('retryAfterSeconds is 0 when allowed', () => {
    const d = applyPrincipalRateLimit('api-key:tok_ok', 'GET', '/api/runs', clock.now());
    expect(d.retryAfterSeconds).toBe(0);
  });

  // ── determinism ─────────────────────────────────────────────────────────────

  it('same principal same clock same path produces deterministic remaining', () => {
    reset();
    const clock2 = makeClock(5_000_000);
    reset = installTestLimiters(clock2.now);

    const subject = 'api-key:tok_det';
    const d1 = applyPrincipalRateLimit(subject, 'GET', '/api/runs', clock2.now());

    // Reset to get a fresh counter at the same clock value.
    reset();
    reset = installTestLimiters(clock2.now);

    const d2 = applyPrincipalRateLimit(subject, 'GET', '/api/runs', clock2.now());
    expect(d1.remaining).toBe(d2.remaining);
  });
});

// ─── resetPrincipalLimiters ───────────────────────────────────────────────────

describe('resetPrincipalLimiters', () => {
  it('clears all buckets', () => {
    const clock = makeClock(2_000_000);
    installTestLimiters(clock.now);

    const subject = 'api-key:tok_reset_test';
    const limit = RATE_LIMIT_POLICIES.auth.limit;

    for (let i = 0; i <= limit; i++) {
      applyPrincipalRateLimit(subject, 'POST', '/api/auth/github', clock.now());
    }
    expect(
      applyPrincipalRateLimit(subject, 'POST', '/api/auth/github', clock.now()).allowed,
    ).toBe(false);

    resetPrincipalLimiters();

    // After reset, a fresh install at the same clock should allow again.
    installTestLimiters(clock.now);
    expect(
      applyPrincipalRateLimit(subject, 'POST', '/api/auth/github', clock.now()).allowed,
    ).toBe(true);

    resetPrincipalLimiters();
  });
});
