import { MIGRATION_000_BASELINE } from './000_baseline';
import { MIGRATION_001_KV_RUNS_V2 } from './001_kv_runs_v2';
import type { Migration } from '../migration-runner';

/** Ordered registry — append new migrations at the end only. */
export const ALL_MIGRATIONS: Migration[] = [MIGRATION_000_BASELINE, MIGRATION_001_KV_RUNS_V2];

export { MIGRATION_000_BASELINE, MIGRATION_001_KV_RUNS_V2 };
