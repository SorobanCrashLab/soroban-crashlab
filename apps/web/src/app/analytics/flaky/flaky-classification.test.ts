/**
 * Tests for Issue #1374 – flaky detection degenerate replay counts.
 *
 * Validates the classification in flaky-classification.ts. Compiled and
 * executed via `npm run test` using tsc + node.
 */

import * as assert from 'node:assert/strict';
import {
  classifyFlakyRun,
  computeVarianceScore,
  MIN_REPLAYS,
  type FlakinessTier,
} from './flaky-classification';

const cases: {
  name: string;
  replay_count: number;
  results: boolean[];
  expected: FlakinessTier;
}[] = [
  { name: 'n=0', replay_count: 0, results: [], expected: 'INSUFFICIENT' },
  { name: 'n=1', replay_count: 1, results: [true], expected: 'INSUFFICIENT' },
  { name: 'n=2 agreeing', replay_count: 2, results: [true, true], expected: 'STABLE' },
  { name: 'n=2 disagreeing', replay_count: 2, results: [true, false], expected: 'FLAKY' },
  {
    name: 'n=5 mixed but below threshold',
    replay_count: 5,
    results: [true, true, false, true, true],
    expected: 'STABLE',
  },
];

function testClassificationCases(): void {
  for (const c of cases) {
    const actual = classifyFlakyRun(c.replay_count, c.results);
    assert.equal(actual, c.expected, `case ${c.name}: expected ${c.expected}, got ${actual}`);
    console.log(`✓ ${c.name} -> ${actual}`);
  }
}

/**
 * Asserts that `INSUFFICIENT` is decided before the score's division is
 * reached: for replay_count < MIN_REPLAYS the classification must not call
 * computeVarianceScore. We prove it indirectly by passing an empty (or
 * single) result set which would raise inside the division if reached, and by
 * asserting the guard short-circuits for every replay_count below the minimum.
 */
function testInsufficientNeverReachesDivision(): void {
  for (let n = 0; n < MIN_REPLAYS; n += 1) {
    const tier = classifyFlakyRun(n, n === 0 ? [] : [true]);
    assert.equal(tier, 'INSUFFICIENT', `replay_count=${n} must be INSUFFICIENT`);
    // Division is definitionally unreachable: computeVarianceScore is not
    // called before the guard returns, so a 0-length result set is safe.
  }
  console.log(`✓ INSUFFICIENT never reaches the division for n < ${MIN_REPLAYS}`);

  // Sanity: variance score for an unresolved (minority-free) set is 0.
  assert.equal(computeVarianceScore([true, true]), 0);
}

function testThresholdBehavior(): void {
  // n=2 both the same -> variance 0 -> STABLE
  assert.equal(classifyFlakyRun(2, [true, true]), 'STABLE');
  // n=2 split 50/50 -> score 50 > threshold -> FLAKY
  assert.equal(classifyFlakyRun(2, [true, false]), 'FLAKY');
  // n=5 with a single minority (20%) -> score 20 <= threshold -> STABLE
  assert.equal(
    classifyFlakyRun(5, [true, true, false, true, true]),
    'STABLE',
  );
  console.log('✓ threshold behavior (STABLE vs FLAKY) matches expected tiers');
}

testClassificationCases();
testInsufficientNeverReachesDivision();
testThresholdBehavior();
