/**
 * Public migration surface — real runner (#1681).
 * Legacy MigrationManager stubs are replaced by MigrationRunner + ALL_MIGRATIONS.
 */

export {
  MigrationRunner,
  memoryMigrationStore,
  fileMigrationStore,
  emptyMigrationState,
  checksumOf,
  type Migration,
  type MigrationContext,
  type MigrationState,
  type MigrationStore,
  type AppliedMigration,
} from './migration-runner';

export { ALL_MIGRATIONS, MIGRATION_000_BASELINE, MIGRATION_001_KV_RUNS_V2 } from './migrations/index';

import { MigrationRunner, fileMigrationStore, memoryMigrationStore } from './migration-runner';
import { ALL_MIGRATIONS } from './migrations/index';
import type { DatabaseType } from './db-init';

/** Create a runner bound to the active database type. */
export function createMigrationRunner(options?: {
  type?: DatabaseType;
  sqlitePath?: string;
}): MigrationRunner {
  const type = options?.type ?? 'sqlite';
  if (type === 'sqlite') {
    const dbPath = options?.sqlitePath ?? process.env.SQLITE_PATH ?? '.data/crashlab.db';
    const sidecar = `${dbPath}.migrations.json`;
    return new MigrationRunner(ALL_MIGRATIONS, fileMigrationStore(sidecar));
  }
  // Postgres / vercel-postgres: until a SQL client is wired, keep durable state
  // beside SQLITE_PATH-equivalent or in-memory for boot probes.
  return new MigrationRunner(ALL_MIGRATIONS, memoryMigrationStore());
}

/** Boot hook — run pending migrations; abort process on failure. */
export async function runBootMigrations(options?: {
  type?: DatabaseType;
  sqlitePath?: string;
}): Promise<void> {
  const runner = createMigrationRunner(options);
  await runner.up({
    driver:
      options?.type === 'postgres' || options?.type === 'vercel-postgres'
        ? options.type
        : options?.type === 'sqlite'
          ? 'sqlite'
          : 'memory',
  });
}
