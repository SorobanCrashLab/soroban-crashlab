// Pure-logic tests for the composite action's classifier (#1863).
//
// Run with: node --test action/tests/classify.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blockingCount,
  buildSummary,
  classifyReport,
  escapeData,
  escapeProperty,
  fixtureId,
  outcomeOf,
  signatureOf,
  summarizeDeltas,
} from '../scripts/classify.mjs';

const report = (cases) => ({ schema: 1, total: cases.length, passed: 0, failed: 0, cases });
const row = (over) => ({
  seed_id: 1,
  mode: 'invoker',
  expected_failure_class: 'auth',
  actual_failure_class: null,
  passed: false,
  error: null,
  ...over,
});

test('fixtureId is seed-<id>-<mode>', () => {
  assert.equal(fixtureId({ seed_id: 7, mode: 'invoker' }), 'seed-7-invoker');
});

test('outcome and signature', () => {
  assert.equal(outcomeOf(row({ passed: true })), 'pass');
  assert.equal(outcomeOf(row({ actual_failure_class: 'auth' })), 'fail');
  assert.equal(outcomeOf(row({ error: 'bad hex' })), 'error');
  assert.equal(signatureOf(row({ actual_failure_class: 'budget' })), 'budget');
  assert.equal(signatureOf(row({ error: 'bad hex' })), 'error');
});

test('passing row with no baseline entry is unchanged', () => {
  const [f] = classifyReport(report([row({ passed: true, actual_failure_class: 'auth' })]), {
    knownFailures: [],
  });
  assert.equal(f.classification, 'unchanged');
});

test('failing row matching the baseline is recurring (not blocking)', () => {
  const [f] = classifyReport(report([row({ actual_failure_class: 'empty-input' })]), {
    knownFailures: [{ fixture: 'seed-1-invoker', signature: 'empty-input' }],
  });
  assert.equal(f.classification, 'recurring');
  assert.equal(f.baselineSignature, null);
});

test('failing row absent from the baseline is a new signature', () => {
  const [f] = classifyReport(report([row({ actual_failure_class: 'budget' })]), { knownFailures: [] });
  assert.equal(f.classification, 'new');
  const deltas = summarizeDeltas([f]);
  assert.equal(deltas.new, 1);
  assert.equal(blockingCount('new-signatures', [f], deltas), 1);
});

test('failing row with a different baseline signature is new and keeps the baseline', () => {
  const [f] = classifyReport(report([row({ actual_failure_class: 'budget' })]), {
    knownFailures: [{ fixture: 'seed-1-invoker', signature: 'auth' }],
  });
  assert.equal(f.classification, 'new');
  assert.equal(f.baselineSignature, 'auth');
});

test('previously failing row that now passes is fixed', () => {
  const [f] = classifyReport(report([row({ passed: true, actual_failure_class: 'auth' })]), {
    knownFailures: [{ fixture: 'seed-1-invoker', signature: 'auth' }],
  });
  assert.equal(f.classification, 'fixed');
});

test('duplicate ids keep the first row', () => {
  const fixtures = classifyReport(
    report([row({ passed: true }), row({ actual_failure_class: 'budget' })]),
    { knownFailures: [] },
  );
  assert.equal(fixtures.length, 1);
  assert.equal(fixtures[0].classification, 'unchanged');
});

test('classifications are ordered blocking first, then by id', () => {
  const fixtures = classifyReport(
    report([
      row({ seed_id: 9, mode: 'invoker', passed: true }),
      row({ seed_id: 3, mode: 'invoker', actual_failure_class: 'budget' }),
      row({ seed_id: 1, mode: 'invoker', actual_failure_class: 'state' }),
    ]),
    { knownFailures: [{ fixture: 'seed-3-invoker', signature: 'budget' }] },
  );
  assert.deepEqual(fixtures.map((f) => f.id), ['seed-1-invoker', 'seed-3-invoker', 'seed-9-invoker']);
});

test('blockingCount honours each policy', () => {
  const fixtures = classifyReport(
    report([
      row({ seed_id: 1, actual_failure_class: 'budget' }),
      row({ seed_id: 2, actual_failure_class: 'empty-input' }),
      row({ seed_id: 3, passed: true, actual_failure_class: 'auth' }),
    ]),
    { knownFailures: [{ fixture: 'seed-2-invoker', signature: 'empty-input' }] },
  );
  const deltas = summarizeDeltas(fixtures);
  assert.equal(blockingCount('new-signatures', fixtures, deltas), 1);
  assert.equal(blockingCount('any', fixtures, deltas), 2);
  assert.equal(blockingCount('never', fixtures, deltas), 0);
  assert.throws(() => blockingCount('sometimes', fixtures, deltas), /invalid fail-on/);
});

test('workflow-command escaping', () => {
  assert.equal(escapeData('a%\nb\r'), 'a%25%0Ab%0D');
  assert.equal(escapeProperty('a:b,c'), 'a%3Ab%2Cc');
});

test('summary names the blocking fixtures', () => {
  const fixtures = classifyReport(report([row({ actual_failure_class: 'budget' })]), { knownFailures: [] });
  const summary = buildSummary(summarizeDeltas(fixtures), fixtures);
  assert.match(summary, /new 1/);
  assert.match(summary, /seed-1-invoker/);
});
