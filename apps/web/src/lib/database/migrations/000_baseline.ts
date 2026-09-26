/**
 * Baseline migration 000 — codifies the current storage schemas as the
 * starting point. No data rewrite; records provenance for subsequent upgrades.
 */

import type { Migration } from '../migration-runner';

export const MIGRATION_000_BASELINE: Migration = {
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
    // Baseline: mark known KV key families at revision v1 without rewriting.
    ctx.state.kvRevisions['runs'] = ctx.state.kvRevisions['runs'] ?? 'v1';
    ctx.state.kvRevisions['notifications'] = ctx.state.kvRevisions['notifications'] ?? 'v1';
    ctx.state.kvRevisions['api-tokens'] = ctx.state.kvRevisions['api-tokens'] ?? 'v1';
    ctx.state.kvRevisions['idempotency'] = ctx.state.kvRevisions['idempotency'] ?? 'v1';
  },
  async down(ctx) {
    delete ctx.state.kvRevisions['runs'];
    delete ctx.state.kvRevisions['notifications'];
    delete ctx.state.kvRevisions['api-tokens'];
    delete ctx.state.kvRevisions['idempotency'];
  },
};
