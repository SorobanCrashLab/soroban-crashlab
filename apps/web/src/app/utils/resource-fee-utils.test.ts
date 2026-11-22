/**
 * Unit tests for resource-fee-utils.ts
 * 
 * Validates resource fee calculations, formatting, and categorization logic
 * for Soroban contract resource usage tracking.
 */

import * as assert from 'node:assert/strict';
import {
  isExpensiveRun,
  formatBytes,
  formatFee,
  calculateResourceScore,
  getResourceCategory,
  compareResourceUsage,
  calculateResourceDelta,
  parseResourceFee,
  sanitizeFeeSeries,
  isValidFeeValue,
  FEE_Y_DOMAIN,
  getFeeYDomain,
  formatMalformedFeeCaption,
  DEFAULT_THRESHOLDS,
  type ResourceUsage,
  type ResourceThresholds,
} from './resource-fee-utils';

const runAssertions = (): void => {
  // Test isExpensiveRun - happy path
  const cheapRun: ResourceUsage = {
    cpuInstructions: 500_000,
    memoryBytes: 3_000_000,
    minResourceFee: 1_000,
  };
  assert.equal(isExpensiveRun(cheapRun), false);

  const expensiveByCpu: ResourceUsage = {
    cpuInstructions: 1_000_000,
    memoryBytes: 3_000_000,
    minResourceFee: 1_000,
  };
  assert.equal(isExpensiveRun(expensiveByCpu), true);

  const expensiveByMemory: ResourceUsage = {
    cpuInstructions: 500_000,
    memoryBytes: 8_000_000,
    minResourceFee: 1_000,
  };
  assert.equal(isExpensiveRun(expensiveByMemory), true);

  const expensiveByFee: ResourceUsage = {
    cpuInstructions: 500_000,
    memoryBytes: 3_000_000,
    minResourceFee: 5_000,
  };
  assert.equal(isExpensiveRun(expensiveByFee), true);

  // Test with custom thresholds
  const customThresholds: ResourceThresholds = {
    cpu: 1_500_000,
    memory: 10_000_000,
    fee: 5_000,
  };
  assert.equal(isExpensiveRun(expensiveByCpu, customThresholds), false);
  assert.equal(isExpensiveRun(expensiveByMemory, customThresholds), false);
  assert.equal(isExpensiveRun(expensiveByFee, customThresholds), true);

  // Edge case: exactly at threshold
  const atThreshold: ResourceUsage = {
    cpuInstructions: DEFAULT_THRESHOLDS.cpu,
    memoryBytes: DEFAULT_THRESHOLDS.memory,
    minResourceFee: DEFAULT_THRESHOLDS.fee,
  };
  assert.equal(isExpensiveRun(atThreshold), true);

  // Edge case: just below threshold
  const justBelowThreshold: ResourceUsage = {
    cpuInstructions: DEFAULT_THRESHOLDS.cpu - 1,
    memoryBytes: DEFAULT_THRESHOLDS.memory - 1,
    minResourceFee: DEFAULT_THRESHOLDS.fee - 1,
  };
  assert.equal(isExpensiveRun(justBelowThreshold), false);

  // Test formatBytes - happy path
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(1_048_576), '1.0 MB');
  assert.equal(formatBytes(5_242_880), '5.0 MB');
  assert.equal(formatBytes(7_340_032), '7.0 MB');

  // Edge cases for formatBytes
  assert.equal(formatBytes(-100), '0 B');
  assert.equal(formatBytes(1023), '1023 B');
  assert.equal(formatBytes(1_048_575), '1024.0 KB');

  // Test formatFee - happy path
  assert.equal(formatFee(0), '0 stroops');
  assert.equal(formatFee(1_000), '1,000 stroops');
  assert.equal(formatFee(3_000), '3,000 stroops');
  assert.equal(formatFee(1_000_000), '1,000,000 stroops');

  // Edge cases for formatFee
  assert.equal(formatFee(-500), '0 stroops');
  assert.equal(formatFee(1), '1 stroops');

  // Test calculateResourceScore - happy path
  const lowUsage: ResourceUsage = {
    cpuInstructions: 100_000,
    memoryBytes: 1_000_000,
    minResourceFee: 500,
  };
  const score1 = calculateResourceScore(lowUsage);
  assert.ok(score1 > 0 && score1 < 50, `Score ${score1} should be between 0 and 50`);

  const highUsage: ResourceUsage = {
    cpuInstructions: 1_800_000,
    memoryBytes: 14_000_000,
    minResourceFee: 6_000,
  };
  const score2 = calculateResourceScore(highUsage);
  assert.equal(score2, 100, 'Max score should be 100');

  // Edge case: zero usage
  const zeroUsage: ResourceUsage = {
    cpuInstructions: 0,
    memoryBytes: 0,
    minResourceFee: 0,
  };
  assert.equal(calculateResourceScore(zeroUsage), 0);

  // Edge case: exactly at threshold (should be 100%)
  const exactThreshold: ResourceUsage = {
    cpuInstructions: DEFAULT_THRESHOLDS.cpu,
    memoryBytes: DEFAULT_THRESHOLDS.memory,
    minResourceFee: DEFAULT_THRESHOLDS.fee,
  };
  assert.equal(calculateResourceScore(exactThreshold), 100);

  // Test getResourceCategory - happy path
  assert.equal(getResourceCategory(lowUsage), 'low');
  assert.equal(getResourceCategory(highUsage), 'critical');

  const mediumUsage: ResourceUsage = {
    cpuInstructions: 300_000,
    memoryBytes: 2_500_000,
    minResourceFee: 1_200,
  };
  assert.equal(getResourceCategory(mediumUsage), 'medium');

  const highButNotCritical: ResourceUsage = {
    cpuInstructions: 600_000,
    memoryBytes: 4_500_000,
    minResourceFee: 2_000,
  };
  assert.equal(getResourceCategory(highButNotCritical), 'high');

  // Edge cases for getResourceCategory
  assert.equal(getResourceCategory(zeroUsage), 'low');
  assert.equal(getResourceCategory({
    cpuInstructions: DEFAULT_THRESHOLDS.cpu * 0.24,
    memoryBytes: 0,
    minResourceFee: 0,
  }), 'low');
  assert.equal(getResourceCategory({
    cpuInstructions: DEFAULT_THRESHOLDS.cpu * 0.25,
    memoryBytes: 0,
    minResourceFee: 0,
  }), 'medium');
  assert.equal(getResourceCategory({
    cpuInstructions: DEFAULT_THRESHOLDS.cpu * 0.50,
    memoryBytes: 0,
    minResourceFee: 0,
  }), 'high');
  assert.equal(getResourceCategory({
    cpuInstructions: DEFAULT_THRESHOLDS.cpu * 0.75,
    memoryBytes: 0,
    minResourceFee: 0,
  }), 'critical');

  // Test compareResourceUsage - happy path
  const usageA: ResourceUsage = {
    cpuInstructions: 1_000_000,
    memoryBytes: 5_000_000,
    minResourceFee: 2_500,
  };
  const usageB: ResourceUsage = {
    cpuInstructions: 500_000,
    memoryBytes: 2_500_000,
    minResourceFee: 1_000,
  };

  assert.ok(compareResourceUsage(usageA, usageB) < 0, 'usageA should be more expensive');
  assert.ok(compareResourceUsage(usageB, usageA) > 0, 'usageB should be less expensive');
  assert.equal(compareResourceUsage(usageA, usageA), 0, 'Same usage should be equal');

  // Test sorting with compareResourceUsage
  const runs = [cheapRun, expensiveByCpu, lowUsage, highUsage];
  const sorted = [...runs].sort(compareResourceUsage);
  // Verify sorting happened and is stable
  assert.equal(sorted.length, 4);
  // The highest score items should be at the beginning
  const firstScore = calculateResourceScore(sorted[0]);
  const lastScore = calculateResourceScore(sorted[sorted.length - 1]);
  assert.ok(firstScore >= lastScore, 'Highest scores should come first');

  // Test calculateResourceDelta - happy path
  assert.equal(calculateResourceDelta(150, 100), 50);
  assert.equal(calculateResourceDelta(100, 200), -50);
  assert.equal(calculateResourceDelta(100, 100), 0);

  // Edge cases for calculateResourceDelta
  assert.equal(calculateResourceDelta(100, 0), 100, 'Delta from zero should be 100%');
  assert.equal(calculateResourceDelta(0, 0), 0, 'Delta of zero to zero should be 0%');
  assert.equal(calculateResourceDelta(0, 100), -100, 'Delta to zero should be -100%');

  // Test negative deltas
  assert.equal(calculateResourceDelta(50, 100), -50);
  assert.equal(calculateResourceDelta(25, 100), -75);

  // Test parseResourceFee - happy path
  assert.equal(parseResourceFee('1000'), 1000);
  assert.equal(parseResourceFee('1,000 stroops'), 1000);
  assert.equal(parseResourceFee('3,500'), 3500);
  assert.equal(parseResourceFee('10000 stroops'), 10000);

  // Edge cases for parseResourceFee
  assert.equal(parseResourceFee(''), null);
  assert.equal(parseResourceFee('abc'), null);
  assert.equal(parseResourceFee('0'), 0);
  assert.equal(parseResourceFee('  500  '), 500);
  assert.equal(parseResourceFee('1,234,567'), 1234567);
  assert.equal(parseResourceFee('$1000'), 1000);

  // Test parseResourceFee with various formats
  assert.equal(parseResourceFee('Fee: 2,500 stroops'), 2500);
  assert.equal(parseResourceFee('(3000)'), 3000);
  assert.equal(parseResourceFee('~1500~'), 1500);

  // — sanitizeFeeSeries: pure fee sanitization ———————————————————
  // helper: fee rows are { id, minResourceFee } — use FuzzingRun-like shape for the sanitizer
  type FeeRow = { id: string; minResourceFee: unknown };
  const row = (id: string, fee: unknown): FeeRow => ({ id, minResourceFee: fee });

  // negative => dropped
  {
    const { clean, dropped } = sanitizeFeeSeries([row('run-neg', -5), row('run-ok', 100)]);
    assert.equal(clean.length, 1);
    assert.equal(clean[0].id, 'run-ok');
    assert.equal(dropped.count, 1);
    assert.deepEqual(dropped.ids, ['run-neg']);
    assert.equal(isValidFeeValue(-5), false);
  }

  // NaN => dropped
  {
    const { clean, dropped } = sanitizeFeeSeries([row('run-nan', NaN), row('run-ok2', 200)]);
    assert.equal(clean.length, 1);
    assert.equal(dropped.count, 1);
    assert.deepEqual(dropped.ids, ['run-nan']);
    assert.equal(isValidFeeValue(NaN), false);
  }

  // Infinity / -Infinity => dropped
  {
    const { clean, dropped } = sanitizeFeeSeries([row('run-inf', Infinity), row('run-ninf', -Infinity), row('run-ok3', 300)]);
    assert.equal(clean.length, 1);
    assert.equal(dropped.count, 2);
    assert.deepEqual(dropped.ids, ['run-inf', 'run-ninf']);
    assert.equal(isValidFeeValue(Infinity), false);
    assert.equal(isValidFeeValue(-Infinity), false);
  }

  // string-number => dropped
  {
    const { clean, dropped } = sanitizeFeeSeries([row('run-str', '100'), row('run-ok4', 400)]);
    assert.equal(clean.length, 1);
    assert.equal(dropped.count, 1);
    assert.deepEqual(dropped.ids, ['run-str']);
    assert.equal(isValidFeeValue('100'), false);
  }

  // huge-but-valid => kept (physically possible, just large)
  {
    const huge = 1_000_000_000;
    const maxSafe = Number.MAX_SAFE_INTEGER;
    const { clean, dropped } = sanitizeFeeSeries([row('run-huge', huge), row('run-max', maxSafe)]);
    assert.equal(clean.length, 2);
    assert.equal(dropped.count, 0);
    assert.equal(isValidFeeValue(huge), true);
    assert.equal(isValidFeeValue(maxSafe), true);
  }

  // zero boundary => kept
  {
    const { clean, dropped } = sanitizeFeeSeries([row('run-zero', 0)]);
    assert.equal(clean.length, 1);
    assert.equal(dropped.count, 0);
    assert.equal(isValidFeeValue(0), true);
  }

  // multiple malformed classes and caption logic via dropped count
  {
    const rows = [
      row('run-a', -10),
      row('run-b', NaN),
      row('run-c', null),
      row('run-d', 500),
    ];
    const { clean, dropped } = sanitizeFeeSeries(rows);
    assert.equal(clean.length, 1);
    assert.equal(clean[0].id, 'run-d');
    assert.equal(dropped.count, 3);
    assert.deepEqual(dropped.ids, ['run-a', 'run-b', 'run-c']);
    assert.equal(formatMalformedFeeCaption(dropped.count), '3 malformed fee rows hidden');
    assert.equal(formatMalformedFeeCaption(1), '1 malformed fee row hidden');
    assert.equal(formatMalformedFeeCaption(0), null);
  }

  // Y-axis never extends below zero for fee metrics
  {
    assert.deepEqual([...FEE_Y_DOMAIN], [0, 'auto']);
    assert.deepEqual([...getFeeYDomain()], [0, 'auto']);
    assert.equal(FEE_Y_DOMAIN[0], 0);
  }

  // does not mutate input
  {
    const rows = [row('run-orig', -1), row('run-keep', 10)];
    const len = rows.length;
    sanitizeFeeSeries(rows);
    assert.equal(rows.length, len);
  }
};

runAssertions();
console.log('resource-fee-utils.test.ts: all assertions passed');
