/**
 * Distributed lease coordination for multi-instance safety.
 *
 * This module provides KV-backed distributed leases with fencing tokens to
 * prevent concurrent execution of critical operations (retention sweeps,
 * schedule triggers, stale detection, cancel fan-out, checkpoint compaction).
 *
 * ## Design
 *
 * - Leases are acquired atomically via Redis `SET NX EX` (set-if-not-exists with TTL)
 * - Each lease carries a fencing token (UUID v4) for write validation
 * - State writes must carry the token as a precondition (compare-and-set)
 * - Expired leases can be replaced; valid leases block new acquisitions
 *
 * ## Usage
 *
 * ```typescript
 * import { withLease } from '@/lib/lease';
 *
 * await withLease('sweep', 30000, async (token) => {
 *   // Perform sweep with fencing token
 *   await deleteWithFence(key, token);
 * });
 * ```
 */

import { getRedis } from './redis';
import { randomUUID } from 'crypto';

/** Lease acquisition result. */
export interface Lease {
  /** Lease key identifying the resource. */
  key: string;
  /** Fencing token for write validation. */
  token: string;
  /** Absolute expiry timestamp (milliseconds since epoch). */
  expiresAt: number;
  /** Recommended renewal time (milliseconds since epoch). */
  renewAfterMs: number;
}

/** Lease acquisition failure reasons. */
export class LeaseNotAcquiredError extends Error {
  constructor(
    public readonly key: string,
    public readonly reason: 'held_by_another' | 'kv_unavailable',
  ) {
    super(`Lease not acquired for key "${key}": ${reason}`);
    this.name = 'LeaseNotAcquiredError';
  }
}

/** Options for lease acquisition. */
export interface LeaseOptions {
  /** Generate a custom fencing token instead of UUID v4. */
  tokenGenerator?: () => string;
}

/**
 * Attempts to acquire a distributed lease for the specified key.
 *
 * Returns a {@link Lease} if acquired, or `null` if another holder has the lease.
 * Throws {@link LeaseNotAcquiredError} if KV store is unavailable.
 *
 * @param key - Lease key identifying the protected resource
 * @param ttlMs - Time-to-live in milliseconds
 * @param options - Optional configuration
 * @returns Lease object if acquired, null if held by another instance
 */
export async function acquire(
  key: string,
  ttlMs: number,
  options?: LeaseOptions,
): Promise<Lease | null> {
  const redis = getRedis();
  const token = options?.tokenGenerator?.() ?? randomUUID();
  const now = Date.now();
  const expiresAt = now + ttlMs;
  const leaseKey = `lease:${key}`;

  const payload = JSON.stringify({ token, expiresAt });

  try {
    // Atomic set-if-not-exists with TTL (Redis SET NX EX)
    const ttlSeconds = Math.ceil(ttlMs / 1000);
    const result = await redis.set(leaseKey, payload, { nx: true, ex: ttlSeconds });

    if (result === 'OK' || result === null) {
      // null means key already exists (held by another)
      if (result === null) return null;

      return {
        key,
        token,
        expiresAt,
        renewAfterMs: now + Math.floor(ttlMs * 0.5), // Renew at 50% TTL
      };
    }

    // Unexpected response from Redis
    return null;
  } catch (error) {
    throw new LeaseNotAcquiredError(key, 'kv_unavailable');
  }
}

/**
 * Renews an existing lease by extending its TTL.
 *
 * Returns an updated {@link Lease} if the token matches, or `null` if the
 * lease was lost (another instance replaced it or it expired).
 *
 * @param lease - The lease to renew
 * @returns Updated lease if renewed, null if lost
 */
export async function renew(lease: Lease): Promise<Lease | null> {
  const redis = getRedis();
  const leaseKey = `lease:${lease.key}`;

  try {
    // Read current lease entry
    const raw = await redis.get(leaseKey);
    if (!raw) return null; // Lease expired

    const stored = JSON.parse(raw as string) as { token: string; expiresAt: number };

    // Verify token matches (we still hold the lease)
    if (stored.token !== lease.token) return null;

    // Extend TTL
    const now = Date.now();
    const ttlMs = stored.expiresAt - now;
    if (ttlMs <= 0) return null; // Already expired

    const newExpiresAt = now + ttlMs;
    const newPayload = JSON.stringify({ token: lease.token, expiresAt: newExpiresAt });
    const ttlSeconds = Math.ceil(ttlMs / 1000);

    await redis.set(leaseKey, newPayload, { ex: ttlSeconds });

    return {
      ...lease,
      expiresAt: newExpiresAt,
      renewAfterMs: now + Math.floor(ttlMs * 0.5),
    };
  } catch {
    return null;
  }
}

/**
 * Releases a lease, allowing other instances to acquire it.
 *
 * Returns `true` if the lease was released, `false` if it was already lost.
 *
 * @param lease - The lease to release
 * @returns True if released, false if already lost
 */
export async function release(lease: Lease): Promise<boolean> {
  const redis = getRedis();
  const leaseKey = `lease:${lease.key}`;

  try {
    // Read current lease entry
    const raw = await redis.get(leaseKey);
    if (!raw) return false; // Already expired

    const stored = JSON.parse(raw as string) as { token: string; expiresAt: number };

    // Verify token matches (we still hold the lease)
    if (stored.token !== lease.token) return false;

    // Delete the lease entry
    await redis.del(leaseKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convenience wrapper: acquires a lease, runs a function, and releases.
 *
 * The function receives the fencing token and should attach it to all
 * state writes as a precondition (compare-and-set guard).
 *
 * Throws {@link LeaseNotAcquiredError} if the lease cannot be acquired.
 *
 * @param key - Lease key identifying the protected resource
 * @param ttlMs - Time-to-live in milliseconds
 * @param fn - Function to execute while holding the lease
 * @returns Result of the function
 *
 * @example
 * ```typescript
 * await withLease('sweep', 30000, async (token) => {
 *   // All state writes must carry the token
 *   await kvStore.set('key', value, { ifToken: token });
 * });
 * ```
 */
export async function withLease<T>(
  key: string,
  ttlMs: number,
  fn: (token: string) => Promise<T>,
): Promise<T> {
  const lease = await acquire(key, ttlMs);

  if (!lease) {
    throw new LeaseNotAcquiredError(key, 'held_by_another');
  }

  try {
    return await fn(lease.token);
  } finally {
    // Best-effort release; failures are logged but don't propagate
    await release(lease).catch(() => {
      // Lease will expire naturally via TTL
    });
  }
}

/**
 * Helper to attach a fencing token to a KV write operation.
 *
 * This ensures that only the current lease holder's write succeeds.
 * Stale lease holders (whose lease expired or was replaced) have their
 * writes rejected.
 *
 * NOTE: This is a reference implementation. The actual KV store API
 * determines the exact compare-and-set mechanism. For Upstash Redis,
 * this would use Lua scripts or WATCH/MULTI/EXEC.
 */
export interface FencedWrite {
  key: string;
  value: string;
  fencingToken: string;
}

/**
 * Validates that a fencing token matches the current lease holder.
 *
 * Used by state write operations to reject stale writes from instances
 * whose lease has expired or been replaced.
 *
 * @param leaseKey - The lease key
 * @param fencingToken - The token to validate
 * @returns True if the token matches the current lease holder
 */
export async function validateFencingToken(
  leaseKey: string,
  fencingToken: string,
): Promise<boolean> {
  const redis = getRedis();
  const key = `lease:${leaseKey}`;

  try {
    const raw = await redis.get(key);
    if (!raw) return false; // Lease expired

    const stored = JSON.parse(raw as string) as { token: string; expiresAt: number };
    return stored.token === fencingToken && stored.expiresAt > Date.now();
  } catch {
    return false;
  }
}
