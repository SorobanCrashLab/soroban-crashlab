import * as assert from 'node:assert/strict';
import { FuzzingRun } from './types';
import { CustomWidget, computeMetric, reorderWidgets } from './custom-widgets-utils';

const mockRuns = [
  { id: '1', status: 'completed', duration: 120000, seedCount: 50, area: 'auth', severity: 'low' },
  { id: '2', status: 'failed', duration: 240000, seedCount: 150, area: 'state', severity: 'high' },
  { id: '3', status: 'running', duration: 60000, seedCount: 100, area: 'budget', severity: 'low' },
] as FuzzingRun[];

const runAssertions = () => {
  // Test computeMetric
  assert.equal(computeMetric('total-runs', mockRuns), '3');
  assert.equal(computeMetric('completed', mockRuns), '1');
  assert.equal(computeMetric('failed', mockRuns), '1');
  assert.equal(computeMetric('running', mockRuns), '1');
  assert.equal(computeMetric('avg-duration', mockRuns), '2m'); // (120+240+60) / 3 = 140s = 2.33m -> 2m (Math.round(420000 / 3 / 60000) = Math.round(2.33) = 2)
  assert.equal(computeMetric('avg-seeds', mockRuns), '100'); // (50+150+100) / 3 = 100

  // Empty runs edge case
  assert.equal(computeMetric('total-runs', []), '0');
  assert.equal(computeMetric('avg-duration', []), '—');

  const widgets: CustomWidget[] = [
    { id: 'w1', label: '1', metric: 'total-runs', color: 'blue' },
    { id: 'w2', label: '2', metric: 'failed', color: 'red' as any },
    { id: 'w3', label: '3', metric: 'completed', color: 'green' },
  ];

  // Test reorderWidgets
  const reordered = reorderWidgets(widgets, 0, 2);
  assert.equal(reordered[0].id, 'w2');
  assert.equal(reordered[1].id, 'w3');
  assert.equal(reordered[2].id, 'w1');

  // Edge case: invalid bounds
  const unchanged = reorderWidgets(widgets, -1, 2);
  assert.equal(unchanged, widgets); // should return original reference or be equivalent
};

runAssertions();
console.log('custom-widgets-utils.test.ts: all assertions passed');
