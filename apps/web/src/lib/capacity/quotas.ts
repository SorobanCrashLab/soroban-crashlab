/**
 * Capacity quotas for campaigns (#1904).
 *
 * Mirrors `contracts/crashlab-core/src/capacity.rs`: the same classes, the
 * same priority headroom and the same resource check order, so the API's
 * admission decision and the engine's mid-run throttle agree.
 *
 * Scope: every limit applies to one scope. Until tenancy lands there is a
 * single `global` scope; per-org/project scopes plug in by passing a different
 * scope id (docs/ops/capacity.md).
 */

export type CampaignClass = 'interactive' | 'nightly' | 'deep';

/** Priority order, highest first. */
export const CAMPAIGN_CLASSES: readonly CampaignClass[] = ['interactive', 'nightly', 'deep'];

export const CAMPAIGN_CLASS_PRIORITY: Record<CampaignClass, number> = {
  interactive: 0,
  nightly: 1,
  deep: 2,
};

/** Basis points of each limit a class may NOT consume (reserved for higher priority). */
export const RESERVED_HEADROOM_BPS: Record<CampaignClass, number> = {
  interactive: 0,
  nightly: 1_000,
  deep: 2_500,
};

/** Default seed budget per class — the Rust preset budgets (smoke/nightly/deep). */
export const DEFAULT_SEEDS_BY_CLASS: Record<CampaignClass, number> = {
  interactive: 1_000,
  nightly: 100_000,
  deep: 10_000_000,
};

/** Resource units per seed for cost attribution; mirrors `CampaignPreset::resource_units_per_seed`. */
export const RESOURCE_UNITS_PER_SEED: Record<CampaignClass, number> = {
  interactive: 1,
  nightly: 2,
  deep: 4,
};

export const DEFAULT_QUOTA_SCOPE = 'global';

export type QuotaResource = 'concurrent_workers' | 'seeds_per_day' | 'rpc_calls_per_day' | 'storage_bytes';

/** `null` = unlimited, the default, so an unconfigured deployment is unchanged. */
export interface QuotaLimits {
  concurrentWorkers: number | null;
  seedsPerDay: number | null;
  rpcCallsPerDay: number | null;
  storageBytes: number | null;
}

export interface QuotaUsage {
  activeWorkers: number;
  seedsToday: number;
  rpcCallsToday: number;
  storageBytes: number;
}

export interface ResourceRequest {
  campaignClass: CampaignClass;
  workers: number;
  seeds: number;
  rpcCalls: number;
}

export interface QuotaViolation {
  resource: QuotaResource;
  /** The limit as seen by the requesting class (headroom removed). */
  limit: number;
  used: number;
  requested: number;
}

export type AdmissionDecision =
  | { ok: true }
  | { ok: false; violation: QuotaViolation; retryAfterSeconds: number | null };

export function isCampaignClass(value: unknown): value is CampaignClass {
  return typeof value === 'string' && (CAMPAIGN_CLASSES as readonly string[]).includes(value);
}

/** `smoke` → interactive, `nightly` → nightly, `deep` → deep (the Rust preset mapping). */
export function campaignClassForPreset(preset: unknown): CampaignClass | null {
  if (preset === 'smoke') return 'interactive';
  if (preset === 'nightly' || preset === 'deep') return preset;
  return null;
}

export function effectiveLimit(limit: number, campaignClass: CampaignClass): number {
  return limit - Math.floor((limit * RESERVED_HEADROOM_BPS[campaignClass]) / 10_000);
}

const BYTES_PER_GB = 1024 ** 3;

function readLimit(raw: string | undefined, scale = 1): number | null {
  if (!raw || !/^\s*\d+(\.\d+)?\s*$/.test(raw)) return null;
  const value = Number(raw) * scale;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

export interface QuotaEnv {
  concurrentWorkers?: string;
  seedsPerDay?: string;
  rpcCallsPerDay?: string;
  storageGb?: string;
}

/** Parses limit settings; unset or invalid = unlimited. */
export function parseQuotaLimits(raw: QuotaEnv): QuotaLimits {
  return {
    concurrentWorkers: readLimit(raw.concurrentWorkers),
    seedsPerDay: readLimit(raw.seedsPerDay),
    rpcCallsPerDay: readLimit(raw.rpcCallsPerDay),
    storageBytes: readLimit(raw.storageGb, BYTES_PER_GB),
  };
}

/** Limits for the global scope from the environment. */
export function readQuotaLimits(): QuotaLimits {
  return parseQuotaLimits({
    concurrentWorkers: process.env.CRASHLAB_QUOTA_CONCURRENT_WORKERS,
    seedsPerDay: process.env.CRASHLAB_QUOTA_SEEDS_PER_DAY,
    rpcCallsPerDay: process.env.CRASHLAB_QUOTA_RPC_CALLS_PER_DAY,
    storageGb: process.env.CRASHLAB_QUOTA_STORAGE_GB,
  });
}

export function secondsUntilNextUtcDay(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(Math.ceil((next - now.getTime()) / 1000), 1);
}

/** Worker leases free up as campaigns finish; suggest a short re-check. */
const WORKER_RETRY_SECONDS = 60;

/**
 * Checks `request` against `limits` given `usage`, in the Rust order:
 * workers, seeds, RPC calls, then storage (not requested up front — a scope at
 * its storage limit admits nothing new until retention reclaims space).
 */
export function checkAdmission(
  limits: QuotaLimits,
  usage: QuotaUsage,
  request: ResourceRequest,
  now: Date = new Date(),
): AdmissionDecision {
  const checks: Array<[QuotaResource, number | null, number, number, number | null]> = [
    ['concurrent_workers', limits.concurrentWorkers, usage.activeWorkers, request.workers, WORKER_RETRY_SECONDS],
    ['seeds_per_day', limits.seedsPerDay, usage.seedsToday, request.seeds, secondsUntilNextUtcDay(now)],
    ['rpc_calls_per_day', limits.rpcCallsPerDay, usage.rpcCallsToday, request.rpcCalls, secondsUntilNextUtcDay(now)],
  ];

  for (const [resource, rawLimit, used, requested, retryAfterSeconds] of checks) {
    if (rawLimit === null) continue;
    const limit = effectiveLimit(rawLimit, request.campaignClass);
    if (used + requested > limit) {
      return { ok: false, violation: { resource, limit, used, requested }, retryAfterSeconds };
    }
  }

  if (limits.storageBytes !== null) {
    const limit = effectiveLimit(limits.storageBytes, request.campaignClass);
    if (usage.storageBytes >= limit) {
      return {
        ok: false,
        violation: { resource: 'storage_bytes', limit, used: usage.storageBytes, requested: 0 },
        retryAfterSeconds: null,
      };
    }
  }

  return { ok: true };
}
