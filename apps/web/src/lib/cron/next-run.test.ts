import { describe, expect, it } from 'vitest';
import { parseCron } from './parser';
import { nextRun, nextRuns } from './next-run';

const at = (iso: string) => new Date(iso);
const run = (cron: string, from: string) => nextRun(parseCron(cron), at(from)).toISOString();

describe('nextRun — basic advancement', () => {
  it('returns the next whole minute for "* * * * *"', () => {
    expect(run('* * * * *', '2026-03-01T08:15:30.000Z')).toBe('2026-03-01T08:16:00.000Z');
  });

  it('is strictly after the input even when the input already matches', () => {
    expect(run('*/15 * * * *', '2026-03-01T08:15:00.000Z')).toBe('2026-03-01T08:30:00.000Z');
  });

  it('advances to the next stepped minute', () => {
    expect(run('*/20 * * * *', '2026-03-01T08:05:00.000Z')).toBe('2026-03-01T08:20:00.000Z');
  });

  it('rolls the hour when minutes are exhausted', () => {
    expect(run('*/20 * * * *', '2026-03-01T08:50:00.000Z')).toBe('2026-03-01T09:00:00.000Z');
  });

  it('finds a fixed daily time later today', () => {
    expect(run('0 9 * * *', '2026-03-01T06:00:00.000Z')).toBe('2026-03-01T09:00:00.000Z');
  });

  it('rolls to tomorrow when the daily time has passed', () => {
    expect(run('0 9 * * *', '2026-03-01T12:00:00.000Z')).toBe('2026-03-02T09:00:00.000Z');
  });
});

describe('nextRun — month and year boundaries (UTC)', () => {
  it('crosses a month boundary', () => {
    expect(run('0 0 1 * *', '2026-03-15T00:00:00.000Z')).toBe('2026-04-01T00:00:00.000Z');
  });

  it('crosses a 31 → 30-day month boundary', () => {
    // 31st only: April has no 31st, so the next hit is May 31.
    expect(run('0 0 31 * *', '2026-04-10T00:00:00.000Z')).toBe('2026-05-31T00:00:00.000Z');
  });

  it('crosses a year boundary', () => {
    expect(run('30 23 31 12 *', '2026-12-31T23:00:00.000Z')).toBe('2026-12-31T23:30:00.000Z');
    expect(run('0 0 1 1 *', '2026-06-01T00:00:00.000Z')).toBe('2027-01-01T00:00:00.000Z');
  });

  it('handles Feb 29 across leap years', () => {
    // 2026, 2027 are not leap years; 2028 is.
    expect(run('0 0 29 2 *', '2026-03-01T00:00:00.000Z')).toBe('2028-02-29T00:00:00.000Z');
  });

  it('handles a specific month + day', () => {
    expect(run('0 12 4 7 *', '2026-07-04T12:00:00.000Z')).toBe('2027-07-04T12:00:00.000Z');
  });
});

describe('nextRun — day-of-week and day-of-month semantics', () => {
  it('matches a weekday (2026-03-02 is a Monday, UTC)', () => {
    expect(at('2026-03-02T00:00:00.000Z').getUTCDay()).toBe(1);
    expect(run('0 0 * * 1', '2026-03-01T00:00:00.000Z')).toBe('2026-03-02T00:00:00.000Z');
  });

  it('when BOTH dom and dow are restricted, matches on EITHER', () => {
    // Fire on the 1st of the month OR on any Monday.
    const cron = '0 0 1 * 1';
    // 2026-03-01 is a Sunday → not Monday, but it is the 1st → matches.
    expect(run(cron, '2026-02-27T00:00:00.000Z')).toBe('2026-03-01T00:00:00.000Z');
    // From the 2nd (Monday) the next hit is that same day via the dow branch.
    expect(run(cron, '2026-03-01T12:00:00.000Z')).toBe('2026-03-02T00:00:00.000Z');
    // Then the following Monday (the 9th).
    expect(run(cron, '2026-03-02T12:00:00.000Z')).toBe('2026-03-09T00:00:00.000Z');
  });

  it('when only dom is restricted, dow is ignored', () => {
    expect(run('0 0 15 * *', '2026-03-01T00:00:00.000Z')).toBe('2026-03-15T00:00:00.000Z');
  });
});

describe('nextRun — unsatisfiable expressions', () => {
  it('throws for Feb 30', () => {
    expect(() => run('0 0 30 2 *', '2026-01-01T00:00:00.000Z')).toThrow(RangeError);
  });
});

describe('nextRuns', () => {
  it('returns successive runs oldest-first', () => {
    const list = nextRuns(parseCron('*/30 * * * *'), at('2026-03-01T08:05:00.000Z'), 4);
    expect(list.map((d) => d.toISOString())).toEqual([
      '2026-03-01T08:30:00.000Z',
      '2026-03-01T09:00:00.000Z',
      '2026-03-01T09:30:00.000Z',
      '2026-03-01T10:00:00.000Z',
    ]);
  });

  it('stops early when the expression is unsatisfiable', () => {
    expect(nextRuns(parseCron('0 0 30 2 *'), at('2026-01-01T00:00:00.000Z'), 3)).toEqual([]);
  });
});
