/** Bisect orchestration tests (#2207). */
import { describe, expect, it } from 'vitest';
import { bisectProgress, claimNext, createBisectJob, recordResult } from './BisectOrchestrator';

describe('bisect orchestrator', () => {
  it('assigns unique commits to parallel workers', () => {
    const job = createBisectJob('job-1', ['c3', 'c2', 'c1'], 2);
    expect(claimNext(job, 'w1')).toBe('c3');
    expect(claimNext(job, 'w2')).toBe('c2');
    expect(claimNext(job, 'w3')).toBe('c1');
    expect(claimNext(job, 'w4')).toBeUndefined();
  });

  it('stops when a crash is reproduced', () => {
    const job = createBisectJob('job-2', ['c2', 'c1']);
    claimNext(job, 'w1');
    recordResult(job, 'w1', true);
    expect(job.culprit).toBe('c2');
    expect(claimNext(job, 'w2')).toBeUndefined();
  });

  it('tracks progress and rejects bad input', () => {
    const job = createBisectJob('job-3', ['c2', 'c1']);
    expect(bisectProgress(job)).toMatchObject({ completed: 0, total: 2, percent: 0, estimatedRemainingSteps: 2 });
    claimNext(job, 'w1');
    recordResult(job, 'w1', false);
    expect(bisectProgress(job)).toMatchObject({ completed: 1, percent: 50 });
    expect(() => createBisectJob('bad', [], 0)).toThrow(/workers/);
    expect(() => recordResult(job, 'missing', false)).toThrow(/No assignment/);
  });
});
