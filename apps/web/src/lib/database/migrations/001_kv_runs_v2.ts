/**
 * Migration 001 — explicit KV key-revision sweep placeholder converted from
 * ad-hoc shape reads. Advances run records from implicit v1 → v2 marker so
 * drivers can key namespace consistently.
 */

import type { Migration } from '../migration-runner';

export const MIGRATION_001_KV_RUNS_V2: Migration = {
  id: '001',
  name: 'kv-runs-revision-v2',
  checksumSource: 'kv:runs v1→v2; add schema field default 2 on run envelopes',
  async up(ctx) {
    if (ctx.state.kvRevisions['runs'] === 'v2') return;
    // Key-revision sweep: operators/drivers rewrite `run:*` keys under v2 prefix
    // when a durable KV backend is attached. In-memory boots only bump the marker.
    ctx.state.kvRevisions['runs'] = 'v2';
  },
  async down(ctx) {
    ctx.state.kvRevisions['runs'] = 'v1';
  },
};
