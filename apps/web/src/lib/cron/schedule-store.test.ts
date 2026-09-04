import { describe, expect, it } from 'vitest';
import { CronParseError } from './parser';
import {
  addSchedule,
  createSchedule,
  deleteSchedule,
  describeSchedule,
  nextRunForSchedule,
  setScheduleEnabled,
  updateSchedule,
  validateCron,
  validateScheduleName,
  type Schedule,
} from './schedule-store';

const NOW = '2026-03-01T08:00:00.000Z';

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 'sched-1',
    name: 'Nightly auth sweep',
    cron: '0 3 * * *',
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
    lastRunAt: null,
    ...overrides,
  };
}

describe('validateScheduleName', () => {
  it('rejects empty names', () => {
    expect(validateScheduleName('   ', [])).toMatch(/cannot be empty/);
  });

  it('rejects overly long names', () => {
    expect(validateScheduleName('x'.repeat(81), [])).toMatch(/cannot exceed 80/);
  });

  it('rejects duplicates case-insensitively', () => {
    const existing = [makeSchedule()];
    expect(validateScheduleName('nightly AUTH sweep', existing)).toMatch(/already exists/);
  });

  it('allows a schedule to keep its own name', () => {
    const existing = [makeSchedule()];
    expect(validateScheduleName('Nightly auth sweep', existing, 'sched-1')).toBeNull();
  });
});

describe('validateCron', () => {
  it('returns null for a valid expression', () => {
    expect(validateCron('*/30 * * * *')).toBeNull();
  });

  it('returns a precise message for an invalid expression', () => {
    expect(validateCron('0 99 * * *')).toMatch(/hour value 99 .* out of range/);
  });
});

describe('createSchedule', () => {
  it('trims fields and defaults enabled to true', () => {
    const s = createSchedule({ name: '  Weekly  ', cron: '  0 0 * * 1  ' }, NOW, 'sched-9');
    expect(s).toMatchObject({
      id: 'sched-9',
      name: 'Weekly',
      cron: '0 0 * * 1',
      enabled: true,
      lastRunAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('honours an explicit enabled: false', () => {
    expect(createSchedule({ name: 'Paused', cron: '0 0 * * *', enabled: false }, NOW, 'x').enabled).toBe(
      false,
    );
  });

  it('throws CronParseError for a bad expression', () => {
    expect(() => createSchedule({ name: 'Bad', cron: 'nope' }, NOW, 'x')).toThrow(CronParseError);
  });

  it('appends via addSchedule without mutating the input list', () => {
    const original: Schedule[] = [makeSchedule()];
    const created = createSchedule({ name: 'Second', cron: '0 0 * * *' }, NOW, 'sched-2');
    const next = addSchedule(original, created);
    expect(next).toHaveLength(2);
    expect(original).toHaveLength(1);
  });
});

describe('updateSchedule', () => {
  const list = [makeSchedule()];

  it('patches the name and bumps updatedAt', () => {
    const next = updateSchedule(list, 'sched-1', { name: 'Renamed' }, '2026-03-02T00:00:00.000Z');
    expect(next[0].name).toBe('Renamed');
    expect(next[0].updatedAt).toBe('2026-03-02T00:00:00.000Z');
  });

  it('clears the firing anchor when the expression changes', () => {
    const withAnchor = [makeSchedule({ lastRunAt: '2026-03-01T03:00:00.000Z' })];
    const next = updateSchedule(withAnchor, 'sched-1', { cron: '0 4 * * *' }, NOW);
    expect(next[0].lastRunAt).toBeNull();
  });

  it('keeps the anchor when the expression is unchanged', () => {
    const withAnchor = [makeSchedule({ lastRunAt: '2026-03-01T03:00:00.000Z' })];
    const next = updateSchedule(withAnchor, 'sched-1', { cron: '0 3 * * *', name: 'x' }, NOW);
    expect(next[0].lastRunAt).toBe('2026-03-01T03:00:00.000Z');
  });

  it('throws for an invalid patched expression and leaves the list untouched', () => {
    expect(() => updateSchedule(list, 'sched-1', { cron: '61 * * * *' }, NOW)).toThrow(CronParseError);
  });

  it('ignores unknown ids', () => {
    expect(updateSchedule(list, 'missing', { name: 'x' }, NOW)).toEqual(list);
  });
});

describe('deleteSchedule / setScheduleEnabled', () => {
  it('removes by id', () => {
    expect(deleteSchedule([makeSchedule()], 'sched-1')).toEqual([]);
  });

  it('toggles enabled', () => {
    const next = setScheduleEnabled([makeSchedule()], 'sched-1', false, NOW);
    expect(next[0].enabled).toBe(false);
  });
});

describe('describeSchedule / nextRunForSchedule', () => {
  it('humanizes the expression', () => {
    expect(describeSchedule(makeSchedule({ cron: '*/30 * * * *' }))).toBe('every 30 minutes');
  });

  it('returns "Invalid cron expression" for a broken schedule', () => {
    expect(describeSchedule(makeSchedule({ cron: 'broken' }))).toBe('Invalid cron expression');
  });

  it('computes the next fire time', () => {
    const next = nextRunForSchedule(makeSchedule({ cron: '0 3 * * *' }), new Date('2026-03-01T08:00:00.000Z'));
    expect(next?.toISOString()).toBe('2026-03-02T03:00:00.000Z');
  });

  it('returns null for an unsatisfiable expression', () => {
    expect(
      nextRunForSchedule(makeSchedule({ cron: '0 0 30 2 *' }), new Date('2026-03-01T08:00:00.000Z')),
    ).toBeNull();
  });
});
