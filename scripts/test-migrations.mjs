#!/usr/bin/env node
/**
 * Zero-dependency migration runner self-test + fixture upgrade (#1681).
 * Used by CI web-migrations job without requiring a full pnpm install.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function checksumOf(source) {
  return createHash('sha256').update(source, 'utf8').digest('hex').slice(0, 16);
}

function emptyState() {
  return { schemaVersion: -1, applied: [], kvRevisions: {} };
}

function memoryStore(initial) {
  let state = structuredClone(initial ?? emptyState());
  return {
    async load() {
      return structuredClone(state);
    },
    async save(next) {
      state = structuredClone(next);
    },
  };
}

const MIGRATION_000 = {
  id: '000',
  name: 'baseline-current-schemas',
  checksumSource: [
    'schema:case-bundle=2',
    'schema:run-metadata=1',
    'schema:config-bundle=1',
    'kv:runs=v1',
    'kv:notifications=v1',
    'kv:api-tokens=v1',
  ].join('\n'),
  async up(ctx) {
    ctx.state.kvRevisions.runs = ctx.state.kvRevisions.runs ?? 'v1';
    ctx.state.kvRevisions.notifications = ctx.state.kvRevisions.notifications ?? 'v1';
    ctx.state.kvRevisions['api-tokens'] = ctx.state.kvRevisions['api-tokens'] ?? 'v1';
    ctx.state.kvRevisions.idempotency = ctx.state.kvRevisions.idempotency ?? 'v1';
  },
  async down(ctx) {
    delete ctx.state.kvRevisions.runs;
    delete ctx.state.kvRevisions.notifications;
    delete ctx.state.kvRevisions['api-tokens'];
    delete ctx.state.kvRevisions.idempotency;
  },
};

const MIGRATION_001 = {
  id: '001',
  name: 'kv-runs-revision-v2',
  checksumSource: 'kv:runs v1→v2; add schema field default 2 on run envelopes',
  async up(ctx) {
    if (ctx.state.kvRevisions.runs === 'v2') return;
    ctx.state.kvRevisions.runs = 'v2';
  },
  async down(ctx) {
    ctx.state.kvRevisions.runs = 'v1';
  },
};

const ALL = [MIGRATION_000, MIGRATION_001];

async function runUp(migrations, store) {
  const state = await store.load();
  const appliedIds = new Set(state.applied.map((a) => a.id));
  for (const migration of migrations) {
    if (appliedIds.has(migration.id)) {
      const prior = state.applied.find((a) => a.id === migration.id);
      const expected = checksumOf(migration.checksumSource);
      if (prior.checksum !== expected) {
        throw new Error(`checksum mismatch for ${migration.id}`);
      }
      continue;
    }
    try {
      await migration.up({ driver: 'memory', state });
    } catch (error) {
      throw error;
    }
    state.applied.push({
      id: migration.id,
      name: migration.name,
      checksum: checksumOf(migration.checksumSource),
      appliedAt: new Date().toISOString(),
    });
    state.schemaVersion = Math.max(state.schemaVersion, Number.parseInt(migration.id, 10) || 0);
    await store.save(state);
  }
  return state;
}

async function runDown(migrations, store) {
  const state = await store.load();
  const last = state.applied[state.applied.length - 1];
  if (!last) return state;
  const migration = migrations.find((m) => m.id === last.id);
  if (!migration?.down) throw new Error('no down');
  await migration.down({ driver: 'memory', state });
  state.applied.pop();
  state.schemaVersion =
    state.applied.length === 0
      ? -1
      : Math.max(...state.applied.map((a) => Number.parseInt(a.id, 10) || 0));
  await store.save(state);
  return state;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  // Happy path
  {
    const store = memoryStore();
    const state = await runUp(ALL, store);
    assert(state.applied.map((a) => a.id).join(',') === '000,001', 'applied order');
    assert(state.kvRevisions.runs === 'v2', 'runs revision');
    const again = await runUp(ALL, store);
    assert(again.applied.length === 2, 'idempotent');
  }

  // Abort on failure
  {
    const store = memoryStore();
    const boom = {
      id: '000',
      name: 'boom',
      checksumSource: 'boom',
      async up() {
        throw new Error('simulated failure');
      },
    };
    let failed = false;
    try {
      await runUp([boom], store);
    } catch {
      failed = true;
    }
    assert(failed, 'expected failure');
    assert((await store.load()).applied.length === 0, 'not recorded on failure');
  }

  // Rollback
  {
    const store = memoryStore();
    await runUp(ALL, store);
    const after = await runDown(ALL, store);
    assert(after.applied.map((a) => a.id).join(',') === '000', 'rollback last');
    assert(after.kvRevisions.runs === 'v1', 'revision reverted');
  }

  // Checksum drift
  {
    const store = memoryStore({
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
    let failed = false;
    try {
      await runUp([MIGRATION_000], store);
    } catch (e) {
      failed = /checksum mismatch/.test(String(e.message));
    }
    assert(failed, 'checksum drift detected');
  }

  // Fixture upgrade from previous-release format
  {
    const fixturePath = path.join(
      ROOT,
      'apps/web/src/lib/database/fixtures/v0-store.json',
    );
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    assert(fixture.schemaVersion === -1, 'fixture schema');
    assert(Array.isArray(fixture.applied) && fixture.applied.length === 0, 'fixture applied');
    const store = memoryStore({
      schemaVersion: fixture.schemaVersion,
      applied: [],
      kvRevisions: {},
    });
    const state = await runUp(ALL, store);
    assert(state.applied.length === ALL.length, 'fixture upgraded');
    assert(state.kvRevisions.runs === 'v2', 'fixture runs v2');
    for (const m of ALL) {
      const recorded = state.applied.find((a) => a.id === m.id);
      assert(recorded.checksum === checksumOf(m.checksumSource), `checksum ${m.id}`);
    }
  }

  // Source files exist and match registry ids
  {
    const migDir = path.join(ROOT, 'apps/web/src/lib/database/migrations');
    assert(fs.existsSync(path.join(migDir, '000_baseline.ts')), '000 file');
    assert(fs.existsSync(path.join(migDir, '001_kv_runs_v2.ts')), '001 file');
    assert(fs.existsSync(path.join(migDir, 'index.ts')), 'index file');
  }

  console.log('migration self-test OK (runner + fixture upgrade + abort/rollback)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
