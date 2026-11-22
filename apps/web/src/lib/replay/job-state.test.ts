import { describe, expect, it } from 'vitest';
import {
  MAX_JOB_EVENTS,
  appendJobEvent,
  canTransitionJob,
  eventsAfter,
  isTerminalJobStatus,
  latestJobEvent,
  transitionJob,
  type ReplayJob,
} from './job-state';
import { ReplayJobStore } from './job-store';
import type { ReplayResult } from './result';

const BASE_TIME = '2026-04-04T10:00:00.000Z';

function replayResult(outcome: 'match' | 'mismatch' = 'mismatch'): ReplayResult {
  return {
    sourceRunId: 'run-1',
    replayRunId: 'run-2',
    outcome,
    diagnostics: {
      command: 'mock-replay',
      args: [],
      stdout: '',
      stderr: '',
      exitCode: outcome === 'match' ? 0 : 1,
      durationMs: 20,
    },
    environment: {
      status: 'match',
      mismatches: [],
      acknowledged: false,
      requiresAcknowledgement: false,
      summary: 'matches',
    },
    ranWithOverride: false,
  };
}

function job(overrides: Partial<ReplayJob> = {}): ReplayJob {
  return {
    id: 'replay-job-1',
    sourceRunId: 'run-1',
    runner: 'mock',
    status: 'queued',
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    requestedBy: 'dana',
    events: [],
    ...overrides,
  };
}

describe('replay job state', () => {
  describe('canTransitionJob', () => {
    it('allows the queued → running → terminal path', () => {
      expect(canTransitionJob('queued', 'running')).toBe(true);
      expect(canTransitionJob('running', 'succeeded')).toBe(true);
      expect(canTransitionJob('running', 'mismatch')).toBe(true);
      expect(canTransitionJob('running', 'failed')).toBe(true);
      expect(canTransitionJob('running', 'cancelled')).toBe(true);
    });

    it('allows a queued job to fail or be cancelled', () => {
      expect(canTransitionJob('queued', 'failed')).toBe(true);
      expect(canTransitionJob('queued', 'cancelled')).toBe(true);
    });

    it('rejects skipping the running phase for success', () => {
      expect(canTransitionJob('queued', 'succeeded')).toBe(false);
      expect(canTransitionJob('queued', 'mismatch')).toBe(false);
    });

    it('freezes terminal jobs', () => {
      for (const status of ['succeeded', 'mismatch', 'failed', 'cancelled'] as const) {
        expect(isTerminalJobStatus(status)).toBe(true);
        expect(canTransitionJob(status, 'running')).toBe(false);
        // Even a self-transition is rejected once terminal: the record is done.
        expect(canTransitionJob(status, status)).toBe(false);
      }
    });

    it('treats a pre-terminal self-transition as an idempotent no-op', () => {
      expect(canTransitionJob('queued', 'queued')).toBe(true);
      expect(canTransitionJob('running', 'running')).toBe(true);
    });
  });

  describe('transitionJob', () => {
    it('moves the status and stamps the time', () => {
      const result = transitionJob(job(), 'running', { at: '2026-04-04T10:00:01.000Z' });
      expect(result.ok).toBe(true);
      expect(result.job.status).toBe('running');
      expect(result.job.updatedAt).toBe('2026-04-04T10:00:01.000Z');
    });

    it('carries the failure and result in the same step', () => {
      const failure = { reason: 'timeout' as const, title: 't', message: 'm', guidance: 'g', retryable: true };
      const result = transitionJob(job({ status: 'running' }), 'failed', { failure });
      expect(result.job.failure).toEqual(failure);

      const summary = replayResult('mismatch');
      const mismatch = transitionJob(job({ status: 'running' }), 'mismatch', { result: summary });
      expect(mismatch.job.result).toEqual(summary);
    });

    it('leaves the job untouched on an illegal move', () => {
      const original = job({ status: 'queued' });
      const result = transitionJob(original, 'succeeded');
      expect(result.ok).toBe(false);
      expect(result.job).toBe(original);
      expect(result.message).toMatch(/queued.*succeeded/);
    });

    it('does not mutate the input job', () => {
      const original = job();
      const snapshot = JSON.parse(JSON.stringify(original)) as ReplayJob;
      transitionJob(original, 'running');
      expect(original).toEqual(snapshot);
    });
  });

  describe('appendJobEvent', () => {
    it('assigns increasing sequence numbers and clamps percentages', () => {
      let current = job();
      current = appendJobEvent(current, { phase: 'queued', message: 'queued', percent: 0, at: BASE_TIME });
      current = appendJobEvent(current, { phase: 'bundle', message: 'bundle', percent: 20 });
      current = appendJobEvent(current, { phase: 'runner', message: 'runner', percent: 140 });
      current = appendJobEvent(current, { phase: 'verify', message: 'verify', percent: 10 });

      expect(current.events.map((event) => event.seq)).toEqual([1, 2, 3, 4]);
      expect(current.events.map((event) => event.percent)).toEqual([0, 20, 100, 100]);
    });

    it('defaults level to info and preserves warn/error', () => {
      let current = appendJobEvent(job(), { phase: 'queued', message: 'a', percent: 0 });
      current = appendJobEvent(current, { phase: 'runner', message: 'b', percent: 10, level: 'warn' });
      current = appendJobEvent(current, { phase: 'done', message: 'c', percent: 10, level: 'error' });
      expect(current.events.map((event) => event.level)).toEqual(['info', 'warn', 'error']);
    });

    it('trims to the event cap but keeps the newest', () => {
      let current = job();
      for (let index = 0; index < MAX_JOB_EVENTS + 5; index += 1) {
        current = appendJobEvent(current, { phase: 'runner', message: `tick ${index}`, percent: index });
      }
      expect(current.events).toHaveLength(MAX_JOB_EVENTS);
      expect(current.events.at(-1)?.message).toBe(`tick ${MAX_JOB_EVENTS + 4}`);
      expect(current.events.at(-1)?.seq).toBe(MAX_JOB_EVENTS + 5);
    });

    it('reports the latest event', () => {
      expect(latestJobEvent(job())).toBeNull();
      const current = appendJobEvent(job(), { phase: 'queued', message: 'hello', percent: 0 });
      expect(latestJobEvent(current)?.message).toBe('hello');
    });

    it('filters events for an SSE reconnect', () => {
      let current = job();
      for (let index = 0; index < 4; index += 1) {
        current = appendJobEvent(current, { phase: 'runner', message: `m${index}`, percent: index * 10 });
      }
      expect(eventsAfter(current, 2).map((event) => event.seq)).toEqual([3, 4]);
      expect(eventsAfter(current, 99)).toEqual([]);
    });
  });
});

describe('ReplayJobStore', () => {
  it('creates a queued job with an initial event', () => {
    const store = new ReplayJobStore();
    const created = store.create({ sourceRunId: 'run-1', runner: 'mock', requestedBy: 'dana' });

    expect(created.id).toMatch(/^replay-job-/);
    expect(created.status).toBe('queued');
    expect(created.events).toHaveLength(1);
    expect(created.events[0]).toMatchObject({ phase: 'queued', percent: 0, level: 'info' });
    expect(store.get(created.id)?.id).toBe(created.id);
  });

  it('returns null for an unknown id', () => {
    expect(new ReplayJobStore().get('nope')).toBeNull();
  });

  it('appends events and transitions the stored job', () => {
    const store = new ReplayJobStore();
    const created = store.create({ sourceRunId: 'run-1', runner: 'host', requestedBy: 'dana' });

    const running = store.transition(created.id, 'running');
    expect(running?.status).toBe('running');

    const withEvent = store.appendEvent(created.id, {
      phase: 'bundle',
      message: 'resolved bundle',
      percent: 25,
    });
    expect(withEvent?.events).toHaveLength(2);
    expect(withEvent?.events[1]?.percent).toBe(25);

    const done = store.transition(created.id, 'succeeded', {
      result: replayResult('match'),
    });
    expect(done?.status).toBe('succeeded');
    expect(done?.result?.replayRunId).toBe('run-2');
  });

  it('refuses an illegal transition and returns the current job', () => {
    const store = new ReplayJobStore();
    const created = store.create({ sourceRunId: 'run-1', runner: 'mock', requestedBy: 'dana' });
    const attempted = store.transition(created.id, 'succeeded');
    expect(attempted?.status).toBe('queued');
  });

  it('lists jobs for a source run, newest first', () => {
    let now = new Date('2026-01-01T00:00:00.000Z');
    const store = new ReplayJobStore({ now: () => now });
    const first = store.create({ sourceRunId: 'run-1', runner: 'mock', requestedBy: 'dana' });
    now = new Date(now.getTime() + 1_000);
    const second = store.create({ sourceRunId: 'run-1', runner: 'mock', requestedBy: 'dana' });
    store.create({ sourceRunId: 'run-2', runner: 'mock', requestedBy: 'dana' });

    expect(store.listBySource('run-1').map((entry) => entry.id)).toEqual([second.id, first.id]);
    expect(store.listBySource('missing')).toEqual([]);
  });

  it('prunes jobs past the TTL on read', () => {
    let now = new Date('2026-01-01T00:00:00.000Z');
    const store = new ReplayJobStore({ now: () => now, ttlMs: 1_000 });
    const created = store.create({ sourceRunId: 'run-1', runner: 'mock', requestedBy: 'dana' });
    expect(store.get(created.id)).not.toBeNull();

    now = new Date('2026-01-01T00:00:05.000Z');
    expect(store.get(created.id)).toBeNull();
  });

  it('drops the oldest jobs past the capacity bound', () => {
    let now = new Date('2026-01-01T00:00:00.000Z');
    const store = new ReplayJobStore({ now: () => now, maxJobs: 2 });
    const first = store.create({ sourceRunId: 'run-1', runner: 'mock', requestedBy: 'dana' });
    now = new Date(now.getTime() + 1_000);
    const second = store.create({ sourceRunId: 'run-2', runner: 'mock', requestedBy: 'dana' });
    now = new Date(now.getTime() + 1_000);
    const third = store.create({ sourceRunId: 'run-3', runner: 'mock', requestedBy: 'dana' });

    expect(store.get(first.id)).toBeNull();
    expect(store.get(second.id)).not.toBeNull();
    expect(store.get(third.id)).not.toBeNull();
  });

  it('ignores appends and transitions for missing jobs', () => {
    const store = new ReplayJobStore();
    expect(store.appendEvent('missing', { phase: 'queued', message: 'x', percent: 0 })).toBeNull();
    expect(store.transition('missing', 'running')).toBeNull();
  });
});
