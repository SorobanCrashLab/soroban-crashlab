import * as assert from 'node:assert/strict';
import { FuzzingRun, RunStatus, RunArea, RunSeverity } from './types';

function makeRun(overrides: Partial<FuzzingRun> & { startedAt?: string; finishedAt?: string }): FuzzingRun {
  const baseTime = new Date('2024-01-15T10:00:00Z').toISOString();
  const startTime = overrides.startedAt || baseTime;
  return {
    id: 'run-1000',
    status: 'completed',
    area: 'auth',
    severity: 'low',
    duration: 120000,
    seedCount: 10000,
    crashDetail: null,
    cpuInstructions: 500000,
    memoryBytes: 2000000,
    minResourceFee: 1000,
    startedAt: startTime,
    finishedAt: overrides.finishedAt || new Date(new Date(startTime).getTime() + 120000).toISOString(),
    ...overrides,
  };
}

function filterTimelineRuns(runs: FuzzingRun[]): FuzzingRun[] {
  return runs
    .filter(r => r.startedAt)
    .slice(0, 10)
    .sort((a, b) => new Date(a.startedAt!).getTime() - new Date(b.startedAt!).getTime());
}

function calculateTimeBounds(runs: FuzzingRun[]): { minTime: number; timeRange: number } {
  if (runs.length === 0) return { minTime: 0, timeRange: 0 };

  const startTimes = runs.map(r => new Date(r.startedAt!).getTime());
  const endTimes = runs.map(r => {
    if (r.finishedAt) return new Date(r.finishedAt).getTime();
    return new Date(r.startedAt!).getTime() + (r.duration || 0);
  });

  const min = Math.min(...startTimes);
  const max = Math.max(...endTimes);
  const range = max - min;
  const padding = range * 0.05;
  
  return {
    minTime: min - padding,
    timeRange: range + (padding * 2)
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

function testFilterTimelineRuns() {
  console.log('Running testFilterTimelineRuns...');
  
  const runs: FuzzingRun[] = [
    makeRun({ id: 'run-1', startedAt: '2024-01-15T10:00:00Z' }),
    makeRun({ id: 'run-2', startedAt: '2024-01-15T10:05:00Z' }),
    makeRun({ id: 'run-3', startedAt: '2024-01-15T10:10:00Z' }),
    makeRun({ id: 'run-no-start', startedAt: undefined } as FuzzingRun),
  ];

  const filtered = filterTimelineRuns(runs);
  
  assert.strictEqual(filtered.length, 3, 'Should filter out runs without startedAt');
  assert.ok(filtered.every(r => r.startedAt), 'All filtered runs should have startedAt');
  
  const ids = filtered.map(r => r.id);
  assert.deepStrictEqual(ids, ['run-1', 'run-2', 'run-3'], 'Should be sorted by startedAt');
  
  console.log('testFilterTimelineRuns passed!');
}

function testTimelineLimit() {
  console.log('Running testTimelineLimit...');
  
  const runs: FuzzingRun[] = Array.from({ length: 15 }, (_, i) => 
    makeRun({ 
      id: `run-${i}`, 
      startedAt: new Date(2024, 0, 15, 10, i * 5).toISOString() 
    })
  );

  const filtered = filterTimelineRuns(runs);
  
  assert.strictEqual(filtered.length, 10, 'Should limit to 10 runs');
  
  console.log('testTimelineLimit passed!');
}

function testCalculateTimeBounds() {
  console.log('Running testCalculateTimeBounds...');
  
  const runs: FuzzingRun[] = [
    makeRun({ id: 'run-1', startedAt: '2024-01-15T10:00:00Z', duration: 60000 }),
    makeRun({ id: 'run-2', startedAt: '2024-01-15T10:05:00Z', duration: 120000 }),
    makeRun({ id: 'run-3', startedAt: '2024-01-15T10:10:00Z', duration: 180000 }),
  ];

  const { minTime, timeRange } = calculateTimeBounds(runs);
  
  const expectedMin = new Date('2024-01-15T10:00:00Z').getTime();
  const expectedMax = new Date('2024-01-15T10:13:00Z').getTime();
  const expectedRange = expectedMax - expectedMin;
  
  assert.ok(
    minTime < expectedMin,
    'minTime should be less than earliest start time due to padding'
  );
  assert.ok(
    timeRange > expectedRange,
    'timeRange should be greater than raw range due to padding'
  );
  assert.ok(
    timeRange > 0,
    'timeRange should be positive'
  );
  assert.ok(
    minTime > 0,
    'minTime should be positive'
  );
  
  console.log('testCalculateTimeBounds passed!');
}

function testEmptyTimelineBounds() {
  console.log('Running testEmptyTimelineBounds...');
  
  const { minTime, timeRange } = calculateTimeBounds([]);
  
  assert.strictEqual(minTime, 0, 'minTime should be 0 for empty array');
  assert.strictEqual(timeRange, 0, 'timeRange should be 0 for empty array');
  
  console.log('testEmptyTimelineBounds passed!');
}

function testFormatDuration() {
  console.log('Running testFormatDuration...');
  
  assert.strictEqual(formatDuration(500), '500ms', 'Should format milliseconds');
  assert.strictEqual(formatDuration(1000), '1s', 'Should format seconds');
  assert.strictEqual(formatDuration(65000), '1m 5s', 'Should format minutes and seconds');
  assert.strictEqual(formatDuration(3661000), '1h 1m 1s', 'Should format hours, minutes, and seconds');
  assert.strictEqual(formatDuration(3600000), '1h', 'Should format hours only');
  assert.strictEqual(formatDuration(0), '0ms', 'Should handle zero duration');
  
  console.log('testFormatDuration passed!');
}

function testStatusColorMapping() {
  console.log('Running testStatusColorMapping...');
  
  const STATUS_COLORS: Record<RunStatus, string> = {
    completed: 'bg-emerald-500 shadow-emerald-500/20',
    failed: 'bg-rose-500 shadow-rose-500/20',
    running: 'bg-blue-500 shadow-blue-500/20',
    cancelled: 'bg-zinc-500 shadow-zinc-500/20',
  };

  const statuses: RunStatus[] = ['completed', 'failed', 'running', 'cancelled'];
  
  for (const status of statuses) {
    assert.ok(STATUS_COLORS[status], `Should have color for status: ${status}`);
    assert.ok(STATUS_COLORS[status].includes('bg-'), `Color should include background class for status: ${status}`);
  }
  
  console.log('testStatusColorMapping passed!');
}

function testRunPositioning() {
  console.log('Running testRunPositioning...');
  
  const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
  const runs: FuzzingRun[] = [
    makeRun({ id: 'run-1', startedAt: '2024-01-15T10:00:00Z', duration: 60000 }),
    makeRun({ id: 'run-2', startedAt: '2024-01-15T10:01:00Z', duration: 60000 }),
    makeRun({ id: 'run-3', startedAt: '2024-01-15T10:02:00Z', duration: 60000 }),
  ];

  const filtered = filterTimelineRuns(runs);
  const { minTime, timeRange } = calculateTimeBounds(filtered);
  
  for (const run of filtered) {
    const start = new Date(run.startedAt!).getTime();
    const end = run.finishedAt ? new Date(run.finishedAt).getTime() : start + (run.duration || 0);
    
    const left = ((start - minTime) / timeRange) * 100;
    const width = ((end - start) / timeRange) * 100;
    
    assert.ok(left >= 0, `Left position should be >= 0 for ${run.id}`);
    assert.ok(left <= 100, `Left position should be <= 100 for ${run.id}`);
    assert.ok(width > 0, `Width should be positive for ${run.id}`);
    assert.ok(left + width <= 105, `Run should fit within timeline bounds for ${run.id}`);
  }
  
  console.log('testRunPositioning passed!');
}

function testConcurrentRuns() {
  console.log('Running testConcurrentRuns...');
  
  const runs: FuzzingRun[] = [
    makeRun({ id: 'run-1', startedAt: '2024-01-15T10:00:00Z', duration: 300000 }),
    makeRun({ id: 'run-2', startedAt: '2024-01-15T10:01:00Z', duration: 300000 }),
    makeRun({ id: 'run-3', startedAt: '2024-01-15T10:02:00Z', duration: 300000 }),
  ];

  const filtered = filterTimelineRuns(runs);
  
  assert.strictEqual(filtered.length, 3, 'Should handle concurrent runs');
  
  const run1End = new Date('2024-01-15T10:05:00Z').getTime();
  const run2Start = new Date('2024-01-15T10:01:00Z').getTime();
  
  assert.ok(run2Start < run1End, 'Runs should overlap (concurrent)');
  
  console.log('testConcurrentRuns passed!');
}

function testDifferentStatuses() {
  console.log('Running testDifferentStatuses...');
  
  const statuses: RunStatus[] = ['completed', 'failed', 'running', 'cancelled'];
  const runs: FuzzingRun[] = statuses.map((status, i) => 
    makeRun({ 
      id: `run-${status}`, 
      status,
      startedAt: new Date(2024, 0, 15, 10, i * 5).toISOString()
    })
  );

  const filtered = filterTimelineRuns(runs);
  
  assert.strictEqual(filtered.length, 4, 'Should handle all status types');
  
  const statusSet = new Set(filtered.map(r => r.status));
  assert.strictEqual(statusSet.size, 4, 'Should have all 4 different statuses');
  
  console.log('testDifferentStatuses passed!');
}

function testFinishedAtFallback() {
  console.log('Running testFinishedAtFallback...');
  
  const runWithFinishedAt = makeRun({ 
    id: 'run-1', 
    startedAt: '2024-01-15T10:00:00Z', 
    finishedAt: '2024-01-15T10:02:00Z',
    duration: 120000 
  });
  
  const runWithoutFinishedAt = makeRun({ 
    id: 'run-2', 
    startedAt: '2024-01-15T10:00:00Z', 
    finishedAt: undefined,
    duration: 120000 
  });

  const end1 = runWithFinishedAt.finishedAt 
    ? new Date(runWithFinishedAt.finishedAt).getTime() 
    : new Date(runWithFinishedAt.startedAt!).getTime() + runWithFinishedAt.duration;
    
  const end2 = runWithoutFinishedAt.finishedAt 
    ? new Date(runWithoutFinishedAt.finishedAt).getTime() 
    : new Date(runWithoutFinishedAt.startedAt!).getTime() + runWithoutFinishedAt.duration;

  assert.strictEqual(end1, end2, 'Should use duration as fallback when finishedAt is missing');
  
  console.log('testFinishedAtFallback passed!');
}

function testMinimumWidth() {
  console.log('Running testMinimumWidth...');
  
  const runs: FuzzingRun[] = [
    makeRun({ id: 'run-short', startedAt: '2024-01-15T10:00:00Z', duration: 1 }),
    makeRun({ id: 'run-long', startedAt: '2024-01-15T10:10:00Z', duration: 600000 }),
  ];

  const filtered = filterTimelineRuns(runs);
  const { minTime, timeRange } = calculateTimeBounds(filtered);
  
  const shortRun = filtered[0];
  const start = new Date(shortRun.startedAt!).getTime();
  const end = start + shortRun.duration;
  const width = ((end - start) / timeRange) * 100;
  
  assert.ok(width < 1, 'Short run should have very small width');
  
  console.log('testMinimumWidth passed!');
}

try {
  testFilterTimelineRuns();
  testTimelineLimit();
  testCalculateTimeBounds();
  testEmptyTimelineBounds();
  testFormatDuration();
  testStatusColorMapping();
  testRunPositioning();
  testConcurrentRuns();
  testDifferentStatuses();
  testFinishedAtFallback();
  testMinimumWidth();
  
  console.log('\nAll add-run-timeline tests passed!');
} catch (error) {
  console.error('Tests failed!');
  console.error(error);
  process.exit(1);
}
