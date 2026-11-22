/**
 * Migration runner unit + fixture-upgrade tests (#1681).
 */

import { describe, it, expect } from 'vitest';
import {
  MigrationRunner,
  memoryMigrationStore,
  checksumOf,
  emptyMigrationState,
  type Migration,
} from './migration-runner';
import { ALL_MIGRATIONS } from './migrations/index';
import v0Fixture from './fixtures/v0-store.json';

describe('MigrationRunner', () => {
  it('applies baseline then kv revision in order', async () => {
    const store = memoryMigrationStore();
    const runner = new MigrationRunner(ALL_MIGRATIONS, store);
    const state = await runner.up({ driver: 'sqlite' });
    expect(state.applied.map((a) => a.id)).toEqual(['000', '001']);
    expect(state.kvRevisions.runs).toBe('v2');
    expect(state.schemaVersion).toBe(1);
  });

  it('is idempotent on second up()', async () => {
    const store = memoryMigrationStore();
    const runner = new MigrationRunner(ALL_MIGRATIONS, store);
    await runner.up({ driver: 'memory' });
    const again = await runner.up({ driver: 'memory' });
    expect(again.applied).toHaveLength(2);
  });

  it('aborts without recording a failed migration', async () => {
    const boom: Migration = {
      id: '000',
      name: 'boom',
      checksumSource: 'boom',
      up: async () => {
        throw new Error('simulated failure');
      },
    };
    const store = memoryMigrationStore();
    const runner = new MigrationRunner([boom], store);
    await expect(runner.up()).rejects.toThrow('simulated failure');
    const state = await store.load();
    expect(state.applied).toHaveLength(0);
  });

  it('rolls back last migration when down is defined', async () => {
    const store = memoryMigrationStore();
    const runner = new MigrationRunner(ALL_MIGRATIONS, store);
    await runner.up({ driver: 'kv' });
    const afterDown = await runner.down({ driver: 'kv' });
    expect(afterDown.applied.map((a) => a.id)).toEqual(['000']);
    expect(afterDown.kvRevisions.runs).toBe('v1');
  });

  it('detects checksum drift on already-applied migrations', async () => {
    const store = memoryMigrationStore({
      schemaVersion: 0,
      applied: [
        {
          id: '000',
          name: 'baseline-current-schemas',
          checksum: 'deadbeefdeadbeef',
          appliedAt: new Date().toISOString(),
        },
      ],
      kvRevisions: {},
    });
    const runner = new MigrationRunner([ALL_MIGRATIONS[0]], store);
    await expect(runner.up()).rejects.toThrow(/checksum mismatch/);
  });

  it('upgrades a previous-release fixture store to current', async () => {
    expect(v0Fixture.schemaVersion).toBe(-1);
    expect(v0Fixture.applied).toEqual([]);
    const store = memoryMigrationStore({
      schemaVersion: v0Fixture.schemaVersion,
      applied: [],
      kvRevisions: {},
    });
    const runner = new MigrationRunner(ALL_MIGRATIONS, store);
    const state = await runner.up({ driver: 'sqlite' });
    expect(state.applied.length).toBe(ALL_MIGRATIONS.length);
    expect(state.kvRevisions.runs).toBe('v2');
    // Conformance: every registered migration checksum matches live source
    for (const m of ALL_MIGRATIONS) {
      const recorded = state.applied.find((a) => a.id === m.id)!;
      expect(recorded.checksum).toBe(checksumOf(m.checksumSource));
    }
  });

  it('status reports pending migrations', async () => {
    const store = memoryMigrationStore(emptyMigrationState());
    const runner = new MigrationRunner(ALL_MIGRATIONS, store);
    const { pending } = await runner.status();
    expect(pending.map((m) => m.id)).toEqual(['000', '001']);
  });
});
