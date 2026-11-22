import * as assert from 'node:assert/strict';
import { buildMockRuns } from '../fixtures/runs';
import {
  computeRunHealthScore,
  computeAreaHealthScores,
  computeOverallHealth,
  getHealthStatus,
} from './run-health-score-utils';

const mockRuns = buildMockRuns();

const runAssertions = () => {
  assert.equal(typeof computeRunHealthScore([]), 'number');
  assert.equal(computeRunHealthScore([]), 100);
  assert.equal(typeof computeRunHealthScore(mockRuns), 'number');

  const allCompleted = mockRuns.map((r) => ({ ...r, status: 'completed' as const }));
  assert.equal(computeRunHealthScore(allCompleted), 100);

  const allFailed = mockRuns.map((r) => ({ ...r, status: 'failed' as const }));
  assert.equal(computeRunHealthScore(allFailed), 0);

  const halfRunning = mockRuns.slice(0, Math.floor(mockRuns.length / 2)).map((r) => ({ ...r, status: 'running' as const }));
  const mixed = [...halfRunning, ...mockRuns.slice(halfRunning.length)];
  const mixedScore = computeRunHealthScore(mixed);
  assert.ok(mixedScore > 0 && mixedScore < 100);

  const areaScores = computeAreaHealthScores(mockRuns);
  assert.equal(areaScores.length, 4);
  for (const score of areaScores) {
    assert.ok(score.score >= 0 && score.score <= 100, 'score out of range');
    assert.ok(['auth', 'state', 'budget', 'xdr'].includes(score.area));
    assert.ok(['up', 'down', 'neutral'].includes(score.trend));
    assert.ok(typeof score.change === 'number');
    assert.ok(typeof score.total === 'number');
    assert.equal(typeof score.completed, 'number');
    assert.equal(typeof score.running, 'number');
    assert.equal(typeof score.failed, 'number');
  }

  const overall = computeOverallHealth(mockRuns);
  assert.equal(typeof overall.current, 'number');
  assert.equal(typeof overall.previous, 'number');
  assert.equal(typeof overall.change, 'number');
  assert.ok(['up', 'down', 'neutral'].includes(overall.direction));
  assert.ok(overall.current >= 0 && overall.current <= 100);
  assert.ok(overall.previous >= 0 && overall.previous <= 100);

  const emptyOverall = computeOverallHealth([]);
  assert.equal(emptyOverall.current, 100);
  assert.equal(emptyOverall.previous, 100);
  assert.equal(emptyOverall.direction, 'neutral');
  assert.equal(emptyOverall.change, 0);

  const status100 = getHealthStatus(100);
  assert.equal(status100.label, 'Healthy');

  const status60 = getHealthStatus(60);
  assert.equal(status60.label, 'Warning');

  const status30 = getHealthStatus(30);
  assert.equal(status30.label, 'Critical');

  const emptyAreaScores = computeAreaHealthScores([]);
  assert.equal(emptyAreaScores.length, 4);
  for (const score of emptyAreaScores) {
    assert.equal(score.score, 100);
    assert.equal(score.trend, 'neutral');
    assert.equal(score.total, 0);
  }
};

runAssertions();
console.log('run-health-score-utils.test.ts: all assertions passed');
