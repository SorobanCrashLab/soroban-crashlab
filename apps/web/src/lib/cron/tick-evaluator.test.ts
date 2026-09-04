import { describe, expect, it } from 'vitest';
import { evaluateTick } from './tick-evaluator';
import type { Schedule, ScheduledRun } from './schedule-store';

function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 'sched-1',
    name: 'Every 30 min sweep',
    cron: '*/30 * * * *',
    enabled: true,
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z',
    lastRunAt: null,
    ...overrides,
  };
}

describe('evaluateTick — due schedules', () => {
  it('records nothing when no tick is due yet', () => {
    const out = evaluateTick({
      schedules: [schedule({ createdAt: '2026-03-01T08:05:00.000Z' })],
      history: [],
      now: new Date('2026-03-01T08:20:00.000Z'),
    });
    expect(out.created).toEqual([]);
    expect(out.history).toEqual([]);
    expect(out.schedules[0].lastRunAt).toBeNull();
  });

  it('records a single run when exactly one tick is due', () => {
    const out = evaluateTick({
      schedules: [schedule({ createdAt: '2026-03-01T08:05:00.000Z' })],
      history: [],
      now: new Date('2026-03-01T08:35:00.000Z'),
    });
    expect(out.created).toHaveLength(1);
    expect(out.created[0]).toMatchObject({
      scheduleId: 'sched-1',
      scheduledFor: '2026-03-01T08:30:00.000Z',
      executedAt: '2026-03-01T08:35:00.000Z',
      status: 'scheduled',
      tickCount: 1,
      caughtUp: false,
      tags: ['scheduled'],
    });
    expect(out.schedules[0].lastRunAt).toBe('2026-03-01T08:30:00.000Z');
  });

  it('tags every scheduled run with "scheduled"', () => {
    const out = evaluateTick({
      schedules: [schedule({ createdAt: '2026-03-01T08:05:00.000Z' })],
      history: [],
      now: new Date('2026-03-01T09:00:00.000Z'),
    });
    expect(out.created.every((r) => r.tags.includes('scheduled'))).toBe(true);
  });

  it('never fires a disabled schedule', () => {
    const out = evaluateTick({
      schedules: [schedule({ enabled: false, createdAt: '2026-03-01T00:00:00.000Z' })],
      history: [],
      now: new Date('2026-03-05T00:00:00.000Z'),
    });
    expect(out.created).toEqual([]);
  });

  it('never fires an invalid expression', () => {
    const out = evaluateTick({
      schedules: [schedule({ cron: '0 0 30 2 *', createdAt: '2026-01-01T00:00:00.000Z' })],
      history: [],
      now: new Date('2026-06-01T00:00:00.000Z'),
    });
    expect(out.created).toEqual([]);
  });
});

describe('evaluateTick — idempotency (double tick)', () => {
  it('does not double-record when called twice with the same clock', () => {
    const first = evaluateTick({
      schedules: [schedule({ createdAt: '2026-03-01T08:05:00.000Z' })],
      history: [],
      now: new Date('2026-03-01T08:35:00.000Z'),
    });
    expect(first.created).toHaveLength(1);

    const second = evaluateTick({
      schedules: first.schedules,
      history: first.history,
      now: new Date('2026-03-01T08:35:00.000Z'),
    });
    expect(second.created).toEqual([]);
    expect(second.history).toHaveLength(1);
  });

  it('is idempotent even if the anchor did not advance (history guard)', () => {
    const existing: ScheduledRun = {
      id: 'srun-sched-1-x',
      scheduleId: 'sched-1',
      scheduleName: 'Every 30 min sweep',
      cron: '*/30 * * * *',
      scheduledFor: '2026-03-01T08:30:00.000Z',
      executedAt: '2026-03-01T08:31:00.000Z',
      status: 'scheduled',
      tickCount: 1,
      caughtUp: false,
      tags: ['scheduled'],
    };
    const out = evaluateTick({
      schedules: [schedule({ createdAt: '2026-03-01T08:05:00.000Z', lastRunAt: null })],
      history: [existing],
      now: new Date('2026-03-01T08:35:00.000Z'),
    });
    expect(out.created).toEqual([]);
  });

  it('fires again once the clock advances to the next tick', () => {
    const first = evaluateTick({
      schedules: [schedule({ createdAt: '2026-03-01T08:05:00.000Z' })],
      history: [],
      now: new Date('2026-03-01T08:35:00.000Z'),
    });
    const second = evaluateTick({
      schedules: first.schedules,
      history: first.history,
      now: new Date('2026-03-01T09:05:00.000Z'),
    });
    expect(second.created).toHaveLength(1);
    expect(second.created[0].scheduledFor).toBe('2026-03-01T09:00:00.000Z');
  });
});

describe('evaluateTick — missed-tick collapse (catch-up)', () => {
  it('collapses many missed ticks into a single catch-up run', () => {
    // Worker was down for ~26 hours; a */30 schedule missed ~52 ticks.
    const out = evaluateTick({
      schedules: [schedule({ createdAt: '2026-03-01T08:00:00.000Z', lastRunAt: '2026-03-01T08:00:00.000Z' })],
      history: [],
      now: new Date('2026-03-02T10:07:00.000Z'),
    });
    expect(out.created).toHaveLength(1);
    expect(out.created[0].caughtUp).toBe(true);
    expect(out.created[0].tickCount).toBe(52);
    // The run is stamped with the most recent missed tick, not each one.
    expect(out.created[0].scheduledFor).toBe('2026-03-02T10:00:00.000Z');
    expect(out.schedules[0].lastRunAt).toBe('2026-03-02T10:00:00.000Z');
  });

  it('after a catch-up, the next evaluation is quiet', () => {
    const first = evaluateTick({
      schedules: [schedule({ createdAt: '2026-03-01T08:00:00.000Z', lastRunAt: '2026-03-01T08:00:00.000Z' })],
      history: [],
      now: new Date('2026-03-02T10:07:00.000Z'),
    });
    const second = evaluateTick({
      schedules: first.schedules,
      history: first.history,
      now: new Date('2026-03-02T10:12:00.000Z'),
    });
    expect(second.created).toEqual([]);
  });

  it('uses createdAt as the anchor when the schedule has never run', () => {
    const out = evaluateTick({
      schedules: [schedule({ cron: '0 * * * *', createdAt: '2026-03-01T08:00:00.000Z', lastRunAt: null })],
      history: [],
      now: new Date('2026-03-01T11:30:00.000Z'),
    });
    // Hourly ticks at 09:00, 10:00, 11:00 → 3 missed, one catch-up run.
    expect(out.created).toHaveLength(1);
    expect(out.created[0].tickCount).toBe(3);
    expect(out.created[0].scheduledFor).toBe('2026-03-01T11:00:00.000Z');
  });
});

describe('evaluateTick — multiple schedules', () => {
  it('evaluates each schedule independently', () => {
    const out = evaluateTick({
      schedules: [
        schedule({ id: 'a', cron: '0 * * * *', createdAt: '2026-03-01T08:00:00.000Z' }),
        schedule({ id: 'b', cron: '*/30 * * * *', enabled: false, createdAt: '2026-03-01T08:00:00.000Z' }),
        schedule({ id: 'c', cron: '0 0 * * *', createdAt: '2026-03-01T08:00:00.000Z' }),
      ],
      history: [],
      now: new Date('2026-03-01T09:05:00.000Z'),
    });
    expect(out.created.map((r) => r.scheduleId).sort()).toEqual(['a']);
  });
});
