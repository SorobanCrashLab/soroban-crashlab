/**
 * Lightweight ordered migration runner with checksums.
 *
 * - SQLite / Postgres: applied versions recorded in a JSON sidecar (or
 *   schema_migrations rows when a SQL client is later wired).
 * - KV drivers: key-revision sweeps via MigrationStore.kvSweep.
 *
 * Failed migrations abort; partial application is not marked complete.
 * Rollback runs `down` for the last applied migration when provided.
 */

import { createHash } from 'node:crypto';

function logInfo(message: string, meta?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test') return;
  console.info(message, meta ?? '');
}

function logError(message: string, meta?: Record<string, unknown>): void {
  console.error(message, meta ?? '');
}

export interface Migration {
  /** Zero-padded id, e.g. "000", "001". Order is lexicographic on id. */
  id: string;
  name: string;
  /** Source text or canonical body used for checksum stability. */
  checksumSource: string;
  up: (ctx: MigrationContext) => Promise<void>;
  down?: (ctx: MigrationContext) => Promise<void>;
}

export interface MigrationContext {
  driver: 'sqlite' | 'postgres' | 'vercel-postgres' | 'kv' | 'memory';
  state: MigrationState;
}

export interface AppliedMigration {
  id: string;
  name: string;
  checksum: string;
  appliedAt: string;
}

export interface MigrationState {
  schemaVersion: number;
  applied: AppliedMigration[];
  /** KV key revisions after sweeps, e.g. { "run:v1": "run:v2" } */
  kvRevisions: Record<string, string>;
}

export type MigrationStore = {
  load(): Promise<MigrationState>;
  save(state: MigrationState): Promise<void>;
};

export function emptyMigrationState(): MigrationState {
  return { schemaVersion: -1, applied: [], kvRevisions: {} };
}

export function checksumOf(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex').slice(0, 16);
}

export class MigrationRunner {
  constructor(
    private readonly migrations: Migration[],
    private readonly store: MigrationStore,
  ) {
    const ids = migrations.map((m) => m.id);
    const sorted = [...ids].sort();
    if (ids.join(',') !== sorted.join(',')) {
      throw new Error('Migrations must be registered in ascending id order');
    }
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) throw new Error(`Duplicate migration id: ${id}`);
      seen.add(id);
    }
  }

  async status(): Promise<{ state: MigrationState; pending: Migration[] }> {
    const state = await this.store.load();
    const appliedIds = new Set(state.applied.map((a) => a.id));
    const pending = this.migrations.filter((m) => !appliedIds.has(m.id));
    return { state, pending };
  }

  /**
   * Apply all pending migrations. On failure, does not record the failed
   * migration and rethrows (abort semantics).
   */
  async up(ctxPartial?: Partial<MigrationContext>): Promise<MigrationState> {
    const state = await this.store.load();
    const appliedIds = new Set(state.applied.map((a) => a.id));
    const driver = ctxPartial?.driver ?? 'memory';

    for (const migration of this.migrations) {
      if (appliedIds.has(migration.id)) {
        const prior = state.applied.find((a) => a.id === migration.id)!;
        const expected = checksumOf(migration.checksumSource);
        if (prior.checksum !== expected) {
          throw new Error(
            `Migration ${migration.id} checksum mismatch: stored=${prior.checksum} current=${expected}`,
          );
        }
        continue;
      }

      const ctx: MigrationContext = { driver, state };
      logInfo('Running migration', { migration_id: migration.id, name: migration.name });
      try {
        await migration.up(ctx);
      } catch (error) {
        logError('Migration failed — aborting', { migration_id: migration.id, error });
        throw error;
      }

      state.applied.push({
        id: migration.id,
        name: migration.name,
        checksum: checksumOf(migration.checksumSource),
        appliedAt: new Date().toISOString(),
      });
      state.schemaVersion = Math.max(state.schemaVersion, Number.parseInt(migration.id, 10) || 0);
      await this.store.save(state);
      logInfo('Migration applied', { migration_id: migration.id });
    }

    return state;
  }

  /** Roll back the last applied migration when it defines `down`. */
  async down(ctxPartial?: Partial<MigrationContext>): Promise<MigrationState> {
    const state = await this.store.load();
    const last = state.applied[state.applied.length - 1];
    if (!last) {
      logInfo('No migrations to roll back');
      return state;
    }
    const migration = this.migrations.find((m) => m.id === last.id);
    if (!migration?.down) {
      throw new Error(`Migration ${last.id} does not support rollback`);
    }
    const driver = ctxPartial?.driver ?? 'memory';
    const ctx: MigrationContext = { driver, state };
    try {
      await migration.down(ctx);
    } catch (error) {
      logError('Rollback failed — aborting', { migration_id: last.id, error });
      throw error;
    }
    state.applied.pop();
    state.schemaVersion =
      state.applied.length === 0
        ? -1
        : Math.max(...state.applied.map((a) => Number.parseInt(a.id, 10) || 0));
    await this.store.save(state);
    return state;
  }
}

/** In-memory store for tests and fresh boots without durable DB. */
export function memoryMigrationStore(initial?: MigrationState): MigrationStore {
  let state = initial ? structuredClone(initial) : emptyMigrationState();
  return {
    async load() {
      return structuredClone(state);
    },
    async save(next) {
      state = structuredClone(next);
    },
  };
}

/**
 * File-backed store used for sqlite path boots (JSON sidecar next to DB).
 */
export function fileMigrationStore(filePath: string): MigrationStore {
  return {
    async load() {
      const fs = await import('node:fs/promises');
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw) as MigrationState;
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ENOENT') return emptyMigrationState();
        throw error;
      }
    },
    async save(state) {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    },
  };
}
