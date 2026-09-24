/**
 * Unit tests for confirm-dialog-utils.ts
 *
 * These run via the tsc + node pipeline used by npm test (no DOM required).
 */

import { strict as assert } from 'assert';
import {
  getConfirmDialogConfig,
  requiresConfirmation,
  formatRunSelectionSummary,
} from './confirm-dialog-utils';

// ── getConfirmDialogConfig ────────────────────────────────────────────────────

{
  const cfg = getConfirmDialogConfig('delete-run');
  assert.strictEqual(cfg.title, 'Delete Run');
  assert.strictEqual(cfg.variant, 'danger');
  assert.ok(cfg.message.length > 0, 'message must not be empty');
  assert.strictEqual(cfg.confirmText, 'Delete Run');
  assert.strictEqual(cfg.cancelText, 'Cancel');
  console.log('✓ delete-run config has correct title, variant, and button labels');
}

{
  const cfg = getConfirmDialogConfig('delete-runs', 3);
  assert.strictEqual(cfg.title, 'Delete 3 Runs');
  assert.strictEqual(cfg.confirmText, 'Delete 3 Runs');
  assert.ok(cfg.message.includes('3 runs'), 'message should reference the count');
  console.log('✓ delete-runs with count=3 pluralises correctly');
}

{
  const cfg = getConfirmDialogConfig('delete-runs', 1);
  assert.strictEqual(cfg.title, 'Delete 1 Run');
  assert.strictEqual(cfg.confirmText, 'Delete 1 Run');
  assert.ok(!cfg.title.endsWith('Runs'), 'singular title must not end with "Runs"');
  console.log('✓ delete-runs with count=1 uses singular form');
}

{
  const cfg = getConfirmDialogConfig('delete-runs');
  // default count is 1
  assert.strictEqual(cfg.title, 'Delete 1 Run');
  console.log('✓ delete-runs defaults to count=1');
}

{
  const cfg = getConfirmDialogConfig('reset-config');
  assert.strictEqual(cfg.title, 'Reset to Defaults');
  assert.strictEqual(cfg.variant, 'warning');
  assert.ok(cfg.message.includes('API configuration'), 'message should mention API configuration');
  assert.strictEqual(cfg.confirmText, 'Reset to Defaults');
  console.log('✓ reset-config config has warning variant and correct labels');
}

{
  const cfg = getConfirmDialogConfig('rotate-token');
  assert.strictEqual(cfg.title, 'Rotate API Token');
  assert.strictEqual(cfg.variant, 'warning');
  assert.ok(cfg.message.includes('grace window'), 'rotation message should mention the grace window');
  assert.strictEqual(cfg.confirmText, 'Rotate Token');
  console.log('✓ rotate-token config has warning variant and grace-window message');
}

// ── requiresConfirmation ─────────────────────────────────────────────────────

{
  assert.strictEqual(requiresConfirmation('delete'), true);
  assert.strictEqual(requiresConfirmation('delete-run'), true);
  assert.strictEqual(requiresConfirmation('delete-runs'), true);
  assert.strictEqual(requiresConfirmation('reset-config'), true);
  assert.strictEqual(requiresConfirmation('revoke-token'), true);
  assert.strictEqual(requiresConfirmation('rotate-token'), true);
  console.log('✓ destructive actions require confirmation');
}

{
  assert.strictEqual(requiresConfirmation('export'), false);
  assert.strictEqual(requiresConfirmation('tag'), false);
  assert.strictEqual(requiresConfirmation('assign'), false);
  assert.strictEqual(requiresConfirmation('cancel'), false);
  assert.strictEqual(requiresConfirmation('retry'), false);
  console.log('✓ non-destructive actions do not require confirmation');
}

// ── formatRunSelectionSummary ─────────────────────────────────────────────────

{
  const result = formatRunSelectionSummary([]);
  assert.strictEqual(result, '');
  console.log('✓ empty selection returns empty string');
}

{
  const ids = ['run-1', 'run-2', 'run-3'];
  const result = formatRunSelectionSummary(ids);
  assert.strictEqual(result, 'run-1, run-2, run-3');
  console.log('✓ up to maxInline IDs are joined inline');
}

{
  const ids = ['run-1', 'run-2', 'run-3', 'run-4', 'run-5', 'run-6'];
  const result = formatRunSelectionSummary(ids);
  assert.ok(result.includes('and 1 more'), `expected overflow suffix; got: "${result}"`);
  console.log('✓ IDs beyond maxInline are summarised with overflow count');
}

{
  const ids = ['a', 'b', 'c'];
  const result = formatRunSelectionSummary(ids, 2);
  assert.ok(result.includes('and 1 more'), `expected overflow suffix; got: "${result}"`);
  console.log('✓ custom maxInline is respected');
}

console.log('\nAll confirm-dialog-utils tests passed.');
