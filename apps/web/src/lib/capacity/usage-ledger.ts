/**
 * Capacity accounting (#1904): who holds which workers, how many seeds and RPC
 * calls each scope used today, utilization over a window and cost rollups.
 *
 * Every admitted campaign takes a *lease*: its workers and planned seeds count
 * against the scope until it reports `finished` or the lease expires (a
 * crashed runner must not hold capacity forever). Runners report cumulative
 * progress through POST /api/capacity/usage, which also renews the lease.
 *
 * Usage is derived from the leases rather than kept in counters, so finishing
 * a campaign early refunds its unused seed reservation automatically.
 *
 * In-memory per server instance, like the other mock-mode stores; a durable
 * backend is follow-up work tracked in docs/ops/capacity.md.
 */

import {
  CAMPAIGN_CLASSES,
  RESOURCE_UNITS_PER_SEED,
  type CampaignClass,
  type QuotaUsage,
} from './quotas';

/** How long a lease survives without a progress report, per class. */
export const LEASE_TTL_MS: Record<CampaignClass, number> = {
  interactive: 60 * 60 * 1000,
  nightly: 8 * 60 * 60 * 1000,
  deep: 24 * 60 * 60 * 1000,
};

/** Finished/expired leases older than this are dropped from history. */
export const LEASE_HISTORY_MS = 35 * 24 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;

export interface CampaignLease {
  campaignId: string;
  scope: string;
  project: string;
  campaignClass: CampaignClass;
  workers: number;
  seedsReserved: number;
  rpcCallsReserved: number;
  seedsUsed: number;
  rpcCallsUsed: number;
  /** UTC day (YYYY-MM-DD) the lease is charged to. */
  day: string;
  startedAt: number;
  expiresAt: number;
  finishedAt: number | null;
}

export interface UsageReport {
  /** Cumulative seeds processed by the campaign so far. */
  seedsProcessed: number;
  /** Cumulative RPC calls made by the campaign so far. */
  rpcCalls?: number;
  /** Current artifact storage held by the scope, when the runner measures it. */
  storageBytes?: number;
  status: 'running' | 'finished';
}

export interface UtilizationReport {
  scope: string;
  windowStart: string;
  windowEnd: string;
  busyWorkerHours: number;
  /** `null` when the scope has no worker limit (capacity unknown). */
  capacityWorkerHours: number | null;
  /** busy / capacity, 0–1 (can exceed 1 after an admin override); `null` without a limit. */
  utilization: number | null;
}

export interface CostRow {
  project: string;
  campaignClass: CampaignClass;
  seeds: number;
  resourceUnits: number;
}

export function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export class CapacityLedger {
  private readonly leases = new Map<string, CampaignLease>();
  private readonly storage = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  private isActive(lease: CampaignLease, at: number): boolean {
    return lease.finishedAt === null && lease.expiresAt > at;
  }

  private prune(at: number): void {
    for (const [id, lease] of this.leases) {
      const end = lease.finishedAt ?? lease.expiresAt;
      if (end < at - LEASE_HISTORY_MS) this.leases.delete(id);
    }
  }

  admit(input: {
    campaignId: string;
    scope: string;
    project: string;
    campaignClass: CampaignClass;
    workers: number;
    seeds: number;
    rpcCalls: number;
  }): CampaignLease {
    const at = this.now();
    this.prune(at);
    const lease: CampaignLease = {
      campaignId: input.campaignId,
      scope: input.scope,
      project: input.project,
      campaignClass: input.campaignClass,
      workers: input.workers,
      seedsReserved: input.seeds,
      rpcCallsReserved: input.rpcCalls,
      seedsUsed: 0,
      rpcCallsUsed: 0,
      day: utcDay(at),
      startedAt: at,
      expiresAt: at + LEASE_TTL_MS[input.campaignClass],
      finishedAt: null,
    };
    this.leases.set(lease.campaignId, lease);
    return lease;
  }

  get(campaignId: string): CampaignLease | undefined {
    return this.leases.get(campaignId);
  }

  /** Records cumulative progress and renews the lease; `undefined` for an unknown campaign. */
  report(campaignId: string, report: UsageReport): CampaignLease | undefined {
    const lease = this.leases.get(campaignId);
    if (!lease) return undefined;
    const at = this.now();
    // Cumulative counters never move backwards (a retried or reordered report).
    lease.seedsUsed = Math.max(lease.seedsUsed, report.seedsProcessed);
    lease.rpcCallsUsed = Math.max(lease.rpcCallsUsed, report.rpcCalls ?? 0);
    if (report.storageBytes !== undefined) this.storage.set(lease.scope, report.storageBytes);
    if (lease.finishedAt === null) {
      if (report.status === 'finished') lease.finishedAt = at;
      else lease.expiresAt = at + LEASE_TTL_MS[lease.campaignClass];
    }
    return lease;
  }

  /** Seeds charged to a lease: the reservation while it runs, actual use once it ends. */
  private chargedSeeds(lease: CampaignLease, at: number): number {
    return this.isActive(lease, at) ? Math.max(lease.seedsReserved, lease.seedsUsed) : lease.seedsUsed;
  }

  private chargedRpcCalls(lease: CampaignLease, at: number): number {
    return this.isActive(lease, at) ? Math.max(lease.rpcCallsReserved, lease.rpcCallsUsed) : lease.rpcCallsUsed;
  }

  usage(scope: string): QuotaUsage {
    const at = this.now();
    const today = utcDay(at);
    const usage: QuotaUsage = {
      activeWorkers: 0,
      seedsToday: 0,
      rpcCallsToday: 0,
      storageBytes: this.storage.get(scope) ?? 0,
    };
    for (const lease of this.leases.values()) {
      if (lease.scope !== scope) continue;
      if (this.isActive(lease, at)) usage.activeWorkers += lease.workers;
      if (lease.day === today) {
        usage.seedsToday += this.chargedSeeds(lease, at);
        usage.rpcCallsToday += this.chargedRpcCalls(lease, at);
      }
    }
    return usage;
  }

  /** utilization = busy-worker-hours / capacity-worker-hours over `[from, to)`. */
  utilization(scope: string, from: number, to: number, workerLimit: number | null): UtilizationReport {
    const at = this.now();
    let busyMs = 0;
    for (const lease of this.leases.values()) {
      if (lease.scope !== scope) continue;
      const end = lease.finishedAt ?? Math.min(lease.expiresAt, at);
      const overlap = Math.min(end, to) - Math.max(lease.startedAt, from);
      if (overlap > 0) busyMs += overlap * lease.workers;
    }
    const busyWorkerHours = busyMs / HOUR_MS;
    const capacityWorkerHours = workerLimit === null ? null : (workerLimit * (to - from)) / HOUR_MS;
    return {
      scope,
      windowStart: new Date(from).toISOString(),
      windowEnd: new Date(to).toISOString(),
      busyWorkerHours: round(busyWorkerHours),
      capacityWorkerHours: capacityWorkerHours === null ? null : round(capacityWorkerHours),
      utilization: capacityWorkerHours ? round(busyWorkerHours / capacityWorkerHours) : null,
    };
  }

  /** Seeds × resource units per (project, class) for leases started in `[from, to)`. */
  costRollup(scope: string, from: number, to: number): CostRow[] {
    const rows = new Map<string, CostRow>();
    for (const lease of this.leases.values()) {
      if (lease.scope !== scope || lease.startedAt < from || lease.startedAt >= to) continue;
      const key = `${lease.project}\u0000${lease.campaignClass}`;
      const row = rows.get(key) ?? { project: lease.project, campaignClass: lease.campaignClass, seeds: 0, resourceUnits: 0 };
      row.seeds += lease.seedsUsed;
      row.resourceUnits += lease.seedsUsed * RESOURCE_UNITS_PER_SEED[lease.campaignClass];
      rows.set(key, row);
    }
    // Deterministic: project, then class priority.
    return [...rows.values()].sort(
      (a, b) =>
        (a.project < b.project ? -1 : a.project > b.project ? 1 : 0) ||
        CAMPAIGN_CLASSES.indexOf(a.campaignClass) - CAMPAIGN_CLASSES.indexOf(b.campaignClass),
    );
  }

  reset(): void {
    this.leases.clear();
    this.storage.clear();
  }
}

let ledger: CapacityLedger | undefined;

export function getCapacityLedger(): CapacityLedger {
  if (!ledger) ledger = new CapacityLedger();
  return ledger;
}

/** Reset between tests. */
export function resetCapacityLedger(next?: CapacityLedger): void {
  ledger = next;
}
