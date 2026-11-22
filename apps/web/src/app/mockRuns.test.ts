/**
 * @file mockRuns.test.ts
 *
 * Focused tests for buildMockRuns() — ROADMAP-042
 *
 * Validates that the mock dataset:
 *  1. Exposes every field required by the FuzzingRun index schema.
 *  2. Keeps crashDetail aligned with the Rust CrashIndex record shape
 *     (signatureHash, failureCategory, signature, payload, replayAction).
 *  3. Guarantees field-level consistency across all 25 runs.
 *  4. Provides a deterministic, stable signatureHash via FNV-1a.
 */

import * as assert from 'node:assert/strict';
import { buildMockRuns, computeSignatureHash } from './mockRuns';
import type { FuzzingRun } from './types';

// ─── Constant sets mirroring the TS union types ───────────────────────────────

const VALID_STATUSES = new Set<FuzzingRun['status']>([
  'running',
  'completed',
  'failed',
  'cancelled',
]);
const VALID_AREAS = new Set<FuzzingRun['area']>(['auth', 'state', 'budget', 'xdr']);
const VALID_SEVERITIES = new Set<FuzzingRun['severity']>(['low', 'medium', 'high', 'critical']);

// ─── Tests ───────────────────────────────────────────────────────────────────

const runs = buildMockRuns();

// 1. Non-empty dataset
assert.ok(runs.length > 0, 'buildMockRuns() must return at least one run');

// 2. Exact expected count (25 runs)
assert.strictEqual(runs.length, 25, 'buildMockRuns() must return exactly 25 runs');

// 3. All run ids are unique strings
const ids = runs.map((r) => r.id);
assert.strictEqual(new Set(ids).size, ids.length, 'all run ids must be unique');
for (const id of ids) {
  assert.equal(typeof id, 'string', `run id must be a string, got: ${typeof id}`);
  assert.ok(id.length > 0, `run id must not be empty`);
}

// 4. Newest-first order (reverse chronological by queuedAt)
for (let i = 0; i < runs.length - 1; i++) {
  const curr = runs[i].queuedAt!;
  const next = runs[i + 1].queuedAt!;
  assert.ok(
    curr >= next,
    `runs must be newest-first: runs[${i}].queuedAt (${curr}) < runs[${i + 1}].queuedAt (${next})`,
  );
}

// 5. Per-run field validation
for (const run of runs) {
  // Core scalar types
  assert.ok(VALID_STATUSES.has(run.status), `invalid status: ${run.status}`);
  assert.ok(VALID_AREAS.has(run.area), `invalid area: ${run.area}`);
  assert.ok(VALID_SEVERITIES.has(run.severity), `invalid severity: ${run.severity}`);
  assert.equal(typeof run.duration, 'number', `duration must be a number for ${run.id}`);
  assert.ok(run.duration > 0, `duration must be positive for ${run.id}`);

  // Resource metrics (index-aligned with Rust RunSummary fields)
  assert.equal(typeof run.seedCount, 'number', `seedCount must be a number for ${run.id}`);
  assert.equal(typeof run.cpuInstructions, 'number', `cpuInstructions must be a number for ${run.id}`);
  assert.equal(typeof run.memoryBytes, 'number', `memoryBytes must be a number for ${run.id}`);
  assert.equal(typeof run.minResourceFee, 'number', `minResourceFee must be a number for ${run.id}`);
  assert.ok(run.seedCount > 0, `seedCount must be positive for ${run.id}`);
  assert.ok(run.cpuInstructions > 0, `cpuInstructions must be positive for ${run.id}`);
  assert.ok(run.memoryBytes > 0, `memoryBytes must be positive for ${run.id}`);
  assert.ok(run.minResourceFee > 0, `minResourceFee must be positive for ${run.id}`);

  // Timestamp fields
  assert.equal(typeof run.queuedAt, 'string', `queuedAt must be a string for ${run.id}`);
  assert.equal(typeof run.startedAt, 'string', `startedAt must be a string for ${run.id}`);

  if (run.status === 'running') {
    // In-progress runs must NOT have a finishedAt
    assert.strictEqual(
      run.finishedAt,
      undefined,
      `running run ${run.id} must not have finishedAt`,
    );
  } else {
    // Terminal runs MUST have a finishedAt
    assert.equal(
      typeof run.finishedAt,
      'string',
      `terminal run ${run.id} must have a finishedAt string`,
    );
  }

  // crashDetail contract: null ↔ non-failed, object ↔ failed
  if (run.status === 'failed') {
    assert.ok(
      run.crashDetail !== null && typeof run.crashDetail === 'object',
      `failed run ${run.id} must have a non-null crashDetail`,
    );

    const cd = run.crashDetail!;

    // CrashGroupRecord.category → failureCategory
    assert.equal(
      typeof cd.failureCategory,
      'string',
      `crashDetail.failureCategory must be a string for ${run.id}`,
    );
    assert.ok(cd.failureCategory.length > 0, `failureCategory must not be empty for ${run.id}`);

    // CrashGroupRecord (stable human-readable key) → signature
    assert.equal(
      typeof cd.signature,
      'string',
      `crashDetail.signature must be a string for ${run.id}`,
    );
    assert.ok(cd.signature.length > 0, `signature must not be empty for ${run.id}`);

    // ── INDEX SCHEMA ALIGNMENT ──────────────────────────────────────────────
    // CrashGroupRecord.signature_hash → crashDetail.signatureHash
    assert.ok(
      cd.signatureHash !== undefined,
      `failed run ${run.id} must carry crashDetail.signatureHash (index schema alignment)`,
    );
    assert.equal(
      typeof cd.signatureHash,
      'number',
      `crashDetail.signatureHash must be a number for ${run.id}`,
    );
    assert.ok(
      Number.isFinite(cd.signatureHash),
      `crashDetail.signatureHash must be a finite number for ${run.id}`,
    );
    assert.ok(
      cd.signatureHash! > 0,
      `crashDetail.signatureHash must be a positive integer for ${run.id}`,
    );

    // Payload and replay action
    assert.equal(
      typeof cd.payload,
      'string',
      `crashDetail.payload must be a string for ${run.id}`,
    );
    assert.equal(
      typeof cd.replayAction,
      'string',
      `crashDetail.replayAction must be a string for ${run.id}`,
    );
    assert.ok(cd.replayAction.length > 0, `replayAction must not be empty for ${run.id}`);

    // Associated issues populated for failed runs
    assert.ok(
      Array.isArray(run.associatedIssues),
      `failed run ${run.id} must have associatedIssues array`,
    );
  } else {
    // Non-failed runs must not carry a crashDetail
    assert.strictEqual(
      run.crashDetail,
      null,
      `non-failed run ${run.id} (${run.status}) must have crashDetail === null`,
    );
  }
}

// 6. Dataset contains all four status values
const observedStatuses = new Set(runs.map((r) => r.status));
for (const s of VALID_STATUSES) {
  assert.ok(observedStatuses.has(s), `mock dataset must include at least one run with status '${s}'`);
}

// 7. Dataset contains at least one failed run (needed for crash-detail tests)
const failedRuns = runs.filter((r) => r.status === 'failed');
assert.ok(failedRuns.length > 0, 'mock dataset must contain at least one failed run');

// 8. All failed runs share the same three known signature hash values
const knownHashes = new Set(failedRuns.map((r) => r.crashDetail!.signatureHash));
assert.ok(
  knownHashes.size <= 3,
  `failed runs should use at most 3 distinct signatureHash values (one per scenario), got ${knownHashes.size}`,
);

// 9. computeSignatureHash is deterministic (same inputs → same output)
const hashA = computeSignatureHash('InvariantViolation', 'sig:token:transfer:assert_balance_nonnegative');
const hashB = computeSignatureHash('InvariantViolation', 'sig:token:transfer:assert_balance_nonnegative');
assert.strictEqual(hashA, hashB, 'computeSignatureHash must be deterministic');

// 10. computeSignatureHash is discriminating (different categories → different hashes)
const hashC = computeSignatureHash('Panic', 'sig:vault:rebalance:unwrap_budget_snapshot');
const hashD = computeSignatureHash('BudgetExceeded', 'sig:router:swap:budget_cpu_limit');
assert.notEqual(hashA, hashC, 'different failure categories must produce different hashes');
assert.notEqual(hashC, hashD, 'different failure categories must produce different hashes');
assert.notEqual(hashA, hashD, 'different failure categories must produce different hashes');

// 11. Hashes stay within safe JS integer range (≤ 2^32 − 1 for 32-bit FNV-1a)
for (const hash of [hashA, hashC, hashD]) {
  assert.ok(hash >= 0 && hash <= 0xffffffff, `hash ${hash} must be a 32-bit unsigned integer`);
}

// 12. run-1000 is present (referenced by existing tests in get-run-by-id.test.ts)
const run1000 = runs.find((r) => r.id === 'run-1000');
assert.ok(run1000 !== undefined, 'run-1000 must be present in the mock dataset');

// 13. run-1024 is present (referenced by existing tests)
const run1024 = runs.find((r) => r.id === 'run-1024');
assert.ok(run1024 !== undefined, 'run-1024 must be present in the mock dataset');

// 14. Annotations are always an array (may be empty)
for (const run of runs) {
  assert.ok(Array.isArray(run.annotations), `run.annotations must be an array for ${run.id}`);
}

console.log('mockRuns.test.ts: all assertions passed ✓');
