import { describe, expect, it } from 'vitest';
import {
  BUILTIN_TEMPLATES,
  DEFAULT_DRAFT,
  applyTemplate,
  duplicateTemplate,
  exportTemplate,
  isDraftValid,
  parseTemplate,
  validateDraft,
} from './campaign-validation';
import {
  DEFAULT_SCHEDULE,
  ScheduleExpressionError,
  describeSchedule,
  isBlackout,
  isValidTimezone,
  nextRunAfter,
  parseCron,
  parseInterval,
  validateSchedule,
} from './campaign-schedule';
import {
  UNLIMITED_BUDGET,
  evaluateBudget,
  formatStroops,
  remainingBudget,
} from './campaign-budget';
import {
  canManage,
  lifecycleAuditAction,
  rollbackOptimisticAction,
  startOptimisticAction,
} from './campaign-lifecycle';
import {
  DEFAULT_FILTER,
  filterCampaigns,
  parseFilter,
  selectVisible,
  serializeFilter,
  toggleBulkSelection,
  type CampaignListItem,
} from './campaign-list';

const NOW = Date.parse('2026-01-01T00:00:00Z');

describe('campaign validation and templates', () => {
  it('reports all invalid wizard fields', () => {
    const errors = validateDraft({ ...DEFAULT_DRAFT, name: 'x', seedCount: 0, parallelism: 99 });
    expect(errors.name).toBeTruthy();
    expect(errors.seedCount).toBeTruthy();
    expect(errors.parallelism).toBeTruthy();
    expect(errors.fixture).toBeTruthy();
    expect(isDraftValid(errors.name ? DEFAULT_DRAFT : DEFAULT_DRAFT)).toBe(false);
  });

  it('accepts a complete draft', () => {
    expect(isDraftValid({ ...DEFAULT_DRAFT, name: 'Nightly fuzz', fixture: 'token' })).toBe(true);
  });

  it('round-trips templates and versions duplicates', () => {
    const template = BUILTIN_TEMPLATES[0];
    expect(parseTemplate(exportTemplate(template))).toEqual(template);
    const duplicate = duplicateTemplate(template, BUILTIN_TEMPLATES);
    expect(duplicate.version).toBe(1);
    expect(applyTemplate(template, 'Renamed').name).toBe('Renamed');
    expect(parseTemplate('not json')).toBeNull();
  });
});

describe('campaign scheduling', () => {
  it('parses intervals and rejects invalid expressions', () => {
    expect(parseInterval('30m')).toBe(1_800_000);
    expect(parseInterval('2h')).toBe(7_200_000);
    expect(parseInterval('1d')).toBe(86_400_000);
    expect(parseInterval('abc')).toBeNull();
  });

  it('parses cron ranges, lists and steps', () => {
    const fields = parseCron('0,15 1-3/2 * * 1-5');
    expect(fields.minute).toEqual([0, 15]);
    expect(fields.hour).toEqual([1, 3]);
    expect(fields.dayOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(() => parseCron('bad expression')).toThrow(ScheduleExpressionError);
  });

  it('validates timezone and blackout windows', () => {
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('Not/AZone')).toBe(false);
    const schedule = {
      ...DEFAULT_SCHEDULE,
      timezone: 'Invalid',
      blackoutWindows: [{ start: '2026-01-02T00:00:00Z', end: '2026-01-01T00:00:00Z' }],
    };
    expect(validateSchedule(schedule)).toBeTruthy();
  });

  it('computes the next run and respects blackouts', () => {
    const schedule = {
      ...DEFAULT_SCHEDULE,
      expression: '1h',
      blackoutWindows: [{ start: '2026-01-01T00:30:00Z', end: '2026-01-01T02:30:00Z' }],
    };
    expect(nextRunAfter(schedule, NOW)).toBe(NOW + 3 * 3_600_000);
    expect(isBlackout(schedule, NOW + 3_600_000)).toBe(true);
    expect(describeSchedule(schedule)).toContain('Every 1h');
  });

  it('handles one-off schedules', () => {
    const schedule = { ...DEFAULT_SCHEDULE, kind: 'once' as const, expression: '2026-02-01T00:00:00Z' };
    expect(nextRunAfter(schedule, NOW)).toBe(Date.parse(schedule.expression));
    expect(nextRunAfter(schedule, Date.parse(schedule.expression))).toBeNull();
  });
});

describe('campaign budgets', () => {
  it('stops only when auto-stop is enabled', () => {
    const budget = { ...UNLIMITED_BUDGET, maxRuns: 10, autoStop: true };
    expect(evaluateBudget(budget, { runs: 9, stroops: 0, elapsedMinutes: 0 })).toEqual({ action: 'continue' });
    expect(evaluateBudget(budget, { runs: 10, stroops: 0, elapsedMinutes: 0 })).toMatchObject({ action: 'stop', reason: 'runs' });
    expect(evaluateBudget({ ...budget, autoStop: false }, { runs: 10, stroops: 0, elapsedMinutes: 0 })).toEqual({ action: 'continue' });
  });

  it('reports remaining capacity and formats values', () => {
    const budget = { ...UNLIMITED_BUDGET, maxStroops: 2_000_000 };
    expect(remainingBudget(budget, { runs: 1, stroops: 500_000, elapsedMinutes: 2 }).stroops).toBe(1_500_000);
    expect(formatStroops(1_500_000)).toBe('1.5M');
    expect(formatStroops(Number.POSITIVE_INFINITY)).toBe('∞');
  });
});

describe('campaign lifecycle', () => {
  const snapshot = { state: 'draft' as const, scheduleId: null, updatedAt: '2026-01-01T00:00:00Z' };

  it('enforces role checks and transitions', () => {
    expect(canManage('viewer', 'running')).toBe(false);
    expect(canManage('analyst', 'running')).toBe(true);
    const optimistic = startOptimisticAction(snapshot, { type: 'scheduled', actor: 'analyst', at: 'now' }, 'a1');
    expect(optimistic.snapshot.state).toBe('scheduled');
    expect(rollbackOptimisticAction(optimistic.snapshot, optimistic.pending).state).toBe('draft');
    expect(rollbackOptimisticAction(snapshot, null)).toEqual(snapshot);
  });

  it('derives audit actions', () => {
    expect(lifecycleAuditAction({ type: 'paused', actor: 'analyst', at: 'now' })).toBe('campaign.paused');
  });
});

describe('campaign list views', () => {
  const items: CampaignListItem[] = [
    { id: 'c1', name: 'Alpha', state: 'running', owner: 'alice', tags: ['fees'], updatedAt: '2026-01-02' },
    { id: 'c2', name: 'Beta', state: 'draft', owner: 'bob', tags: [], updatedAt: '2026-01-01' },
  ];

  it('filters, sorts and round-trips serialized views', () => {
    expect(filterCampaigns(items, { ...DEFAULT_FILTER, query: 'alpha' }).map((item) => item.id)).toEqual(['c1']);
    expect(filterCampaigns(items, { ...DEFAULT_FILTER, states: ['draft'] }).map((item) => item.id)).toEqual(['c2']);
    const filter = { ...DEFAULT_FILTER, sort: 'name' as const, direction: 'asc' as const, tags: ['fees'] };
    expect(parseFilter(new URLSearchParams(serializeFilter(filter)))).toEqual(filter);
  });

  it('handles bulk selection of visible rows', () => {
    expect(toggleBulkSelection([], 'c1')).toEqual(['c1']);
    expect(toggleBulkSelection(['c1'], 'c1')).toEqual([]);
    expect(selectVisible([], items)).toEqual(['c1', 'c2']);
    expect(selectVisible(['c1', 'c2'], items)).toEqual([]);
  });
});
