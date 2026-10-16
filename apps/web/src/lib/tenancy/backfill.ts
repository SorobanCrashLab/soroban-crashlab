/**
 * Default-org backfill (#1894).
 *
 * Moves pre-tenancy records into `org/org_default/project/prj_default/`.
 * Dry-run is the default and produces the same report an apply would, so the
 * report can be reviewed before anything moves. Apply copies before it
 * deletes, never overwrites, and returns the move list `rollbackBackfill`
 * replays in reverse. Rollback plan: docs/adr/0010-org-project-tenancy.md.
 */

import { DEFAULT_ORG_ID, DEFAULT_PROJECT_ID, isTenantKey, joinTenantKey, tenantKeyPrefix } from './storage-keys';

export interface BackfillStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): boolean;
  keys(): Iterable<string>;
}

export interface BackfillOptions {
  /** Legacy key prefixes that hold tenant-owned data (e.g. `run:`, `artifact:`). */
  tenantOwnedPrefixes: readonly string[];
  dryRun?: boolean;
  orgId?: string;
  projectId?: string;
}

export interface BackfillReport {
  dryRun: boolean;
  target: string;
  total: number;
  alreadyScoped: number;
  /** Deployment-wide keys (roles, audit, ...) left where they are. */
  global: string[];
  moves: Array<{ from: string; to: string }>;
  /** Target already exists with different content — left for a human. */
  conflicts: Array<{ from: string; to: string }>;
}

export function backfillTargetKey(legacyKey: string, orgId = DEFAULT_ORG_ID, projectId = DEFAULT_PROJECT_ID): string {
  return joinTenantKey(tenantKeyPrefix(orgId, projectId), `legacy/${encodeURIComponent(legacyKey)}`);
}

export function runBackfill(store: BackfillStore, options: BackfillOptions): BackfillReport {
  const dryRun = options.dryRun ?? true;
  const orgId = options.orgId ?? DEFAULT_ORG_ID;
  const projectId = options.projectId ?? DEFAULT_PROJECT_ID;
  const report: BackfillReport = {
    dryRun,
    target: tenantKeyPrefix(orgId, projectId),
    total: 0,
    alreadyScoped: 0,
    global: [],
    moves: [],
    conflicts: [],
  };

  for (const key of [...store.keys()].sort()) {
    report.total += 1;
    if (isTenantKey(key)) {
      report.alreadyScoped += 1;
      continue;
    }
    if (!options.tenantOwnedPrefixes.some((prefix) => key.startsWith(prefix))) {
      report.global.push(key);
      continue;
    }

    const to = backfillTargetKey(key, orgId, projectId);
    const existing = store.get(to);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(store.get(key))) {
      report.conflicts.push({ from: key, to });
      continue;
    }
    report.moves.push({ from: key, to });
  }

  if (!dryRun) {
    for (const { from, to } of report.moves) {
      store.set(to, store.get(from));
      store.delete(from);
    }
  }
  return report;
}

/** Reverses an applied backfill using its report. */
export function rollbackBackfill(store: BackfillStore, report: BackfillReport): number {
  if (report.dryRun) return 0;
  let restored = 0;
  for (const { from, to } of [...report.moves].reverse()) {
    const value = store.get(to);
    if (value === undefined) continue;
    store.set(from, value);
    store.delete(to);
    restored += 1;
  }
  return restored;
}

/** Storage-level gate: every key under a tenant-owned prefix must be scoped. */
export function findUnscopedKeys(keys: Iterable<string>, tenantOwnedPrefixes: readonly string[]): string[] {
  return [...keys].filter((key) => !isTenantKey(key) && tenantOwnedPrefixes.some((prefix) => key.startsWith(prefix)));
}
