/**
 * Tests for artifact bundle build + validation utilities.
 * Covers the primary download flow and key edge cases.
 */

import { buildArtifactBundle, validateBundle } from './artifact-bundle-utils';
import type { FuzzingRun } from './types';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeRun(overrides: Partial<FuzzingRun> = {}): FuzzingRun {
  return {
    id: 'run-test-1',
    status: 'completed',
    area: 'auth',
    severity: 'low',
    duration: 120_000,
    seedCount: 10_000,
    cpuInstructions: 450_000,
    memoryBytes: 1_800_000,
    minResourceFee: 600,
    crashDetail: null,
    ...overrides,
  };
}

// ── buildArtifactBundle ───────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// Primary flow: single completed run
{
  const run = makeRun();
  const bundle = buildArtifactBundle([run]);
  assert(bundle !== null, 'bundle should not be null for non-empty runs');
  assert(bundle!.runCount === 1, 'runCount should be 1');
  assert(bundle!.runs.length === 1, 'runs array length should be 1');
  assert(bundle!.runs[0].metadata.id === 'run-test-1', 'metadata.id should match run id');
  assert(Array.isArray(bundle!.runs[0].traces), 'traces should be an array');
  assert(Array.isArray(bundle!.runs[0].fixtures), 'fixtures should be an array');
  console.log('PASS: buildArtifactBundle — primary flow (single completed run)');
}

// Primary flow: failed run includes crash trace
{
  const run = makeRun({
    id: 'run-failed-1',
    status: 'failed',
    crashDetail: {
      failureCategory: 'Panic',
      signature: 'sig:vault:rebalance:unwrap',
      payload: '{"contract":"vault"}',
      replayAction: 'cargo run --bin crash-replay -- --run-id run-failed-1',
    },
  });
  const bundle = buildArtifactBundle([run]);
  assert(bundle !== null, 'bundle should not be null');
  assert(bundle!.runs[0].traces.length === 1, 'failed run should have one trace entry');
  assert(
    bundle!.runs[0].traces[0].signature === 'sig:vault:rebalance:unwrap',
    'trace signature should match crashDetail',
  );
  console.log('PASS: buildArtifactBundle — failed run includes crash trace');
}

// Edge case: empty runs array returns null
{
  const bundle = buildArtifactBundle([]);
  assert(bundle === null, 'empty runs should return null');
  console.log('PASS: buildArtifactBundle — empty runs returns null');
}

// Edge case: multiple runs produce correct runCount
{
  const runs = [makeRun({ id: 'run-a' }), makeRun({ id: 'run-b' }), makeRun({ id: 'run-c' })];
  const bundle = buildArtifactBundle(runs);
  assert(bundle !== null, 'bundle should not be null');
  assert(bundle!.runCount === 3, 'runCount should equal number of runs');
  assert(bundle!.runs.length === 3, 'runs array should have 3 entries');
  console.log('PASS: buildArtifactBundle — multiple runs produce correct runCount');
}

// ── validateBundle ────────────────────────────────────────────────────────────

// Valid bundle passes validation
{
  const run = makeRun();
  const bundle = buildArtifactBundle([run])!;
  const result = validateBundle(bundle);
  assert(result.valid === true, 'valid bundle should pass validation');
  assert(result.errors.length === 0, 'valid bundle should have no errors');
  console.log('PASS: validateBundle — valid bundle passes');
}

// Tampered runCount is caught
{
  const run = makeRun();
  const bundle = buildArtifactBundle([run])!;
  const tampered = { ...bundle, runCount: 99 };
  const result = validateBundle(tampered);
  assert(result.valid === false, 'tampered runCount should fail validation');
  assert(result.errors.some((e) => e.includes('runCount mismatch')), 'should report runCount mismatch');
  console.log('PASS: validateBundle — tampered runCount is caught');
}

// Missing metadata.id is caught
{
  const run = makeRun();
  const bundle = buildArtifactBundle([run])!;
  (bundle.runs[0].metadata as Record<string, unknown>).id = '';
  const result = validateBundle(bundle);
  assert(result.valid === false, 'missing metadata.id should fail validation');
  assert(result.errors.some((e) => e.includes('missing metadata.id')), 'should report missing id');
  console.log('PASS: validateBundle — missing metadata.id is caught');
}

console.log('\nAll artifact-bundle-utils tests passed.');
