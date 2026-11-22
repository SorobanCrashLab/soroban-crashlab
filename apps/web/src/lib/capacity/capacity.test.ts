import { describe, expect, it } from 'vitest';
import {
  deriveCampaignRequest,
  evaluateCampaignAdmission,
  evaluateMidRunThrottle,
  parseOverrideReason,
} from './campaign-admission';
import {
  campaignClassForPreset,
  checkAdmission,
  effectiveLimit,
  parseQuotaLimits,
  secondsUntilNextUtcDay,
  type QuotaLimits,
  type QuotaUsage,
} from './quotas';
import { CapacityLedger, LEASE_TTL_MS } from './usage-ledger';
import { formatWindow, isWindowOpen, parseSchedulingWindows, secondsUntilWindowOpens } from './windows';

const UNLIMITED: QuotaLimits = { concurrentWorkers: null, seedsPerDay: null, rpcCallsPerDay: null, storageBytes: null };
const IDLE: QuotaUsage = { activeWorkers: 0, seedsToday: 0, rpcCallsToday: 0, storageBytes: 0 };
const NOON = new Date('2026-10-16T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

describe('quotas', () => {
  it('matches the Rust priority headroom (capacity.rs)', () => {
    expect(effectiveLimit(100, 'interactive')).toBe(100);
    expect(effectiveLimit(100, 'nightly')).toBe(90);
    expect(effectiveLimit(100, 'deep')).toBe(75);
    expect(campaignClassForPreset('smoke')).toBe('interactive');
    expect(campaignClassForPreset('deep')).toBe('deep');
    expect(campaignClassForPreset('bogus')).toBeNull();
  });

  it('reads limits from the environment; unset or invalid means unlimited', () => {
    expect(parseQuotaLimits({})).toEqual(UNLIMITED);
    expect(
      parseQuotaLimits({ concurrentWorkers: '16', seedsPerDay: '5000000', rpcCallsPerDay: 'lots', storageGb: '0.5' }),
    ).toEqual({ concurrentWorkers: 16, seedsPerDay: 5_000_000, rpcCallsPerDay: null, storageBytes: 536_870_912 });
    expect(parseQuotaLimits({ seedsPerDay: '0' }).seedsPerDay).toBeNull();
  });

  it('admits everything when unlimited', () => {
    expect(checkAdmission(UNLIMITED, IDLE, { campaignClass: 'deep', workers: 999, seeds: 1e12, rpcCalls: 1e9 })).toEqual({ ok: true });
  });

  it('reports the first violated resource with a retry hint', () => {
    const limits = { ...UNLIMITED, concurrentWorkers: 4, seedsPerDay: 1_000 };
    const workers = checkAdmission(limits, { ...IDLE, activeWorkers: 3 }, { campaignClass: 'interactive', workers: 2, seeds: 1, rpcCalls: 0 }, NOON);
    expect(workers).toEqual({
      ok: false,
      violation: { resource: 'concurrent_workers', limit: 4, used: 3, requested: 2 },
      retryAfterSeconds: 60,
    });

    const seeds = checkAdmission(limits, { ...IDLE, seedsToday: 700 }, { campaignClass: 'deep', workers: 1, seeds: 100, rpcCalls: 0 }, NOON);
    expect(seeds).toMatchObject({ ok: false, violation: { resource: 'seeds_per_day', limit: 750 } });
    expect(!seeds.ok && seeds.retryAfterSeconds).toBe(12 * 60 * 60);
  });

  it('stops admitting once storage is full', () => {
    const decision = checkAdmission({ ...UNLIMITED, storageBytes: 100 }, { ...IDLE, storageBytes: 100 }, { campaignClass: 'interactive', workers: 1, seeds: 1, rpcCalls: 0 });
    expect(decision).toMatchObject({ ok: false, violation: { resource: 'storage_bytes', requested: 0 }, retryAfterSeconds: null });
  });

  it('computes seconds to the next UTC day', () => {
    expect(secondsUntilNextUtcDay(new Date('2026-10-16T23:59:30.000Z'))).toBe(30);
  });
});

describe('scheduling windows', () => {
  it('parses windows and reports bad entries', () => {
    const { windows, errors } = parseSchedulingWindows('deep=22:00-06:00, nightly=20:00-23:00,interactive=00:00-01:00,deep=9');
    expect(windows).toEqual({ deep: { startMinute: 1320, endMinute: 360 }, nightly: { startMinute: 1200, endMinute: 1380 } });
    expect(errors).toHaveLength(2);
    expect(parseSchedulingWindows(undefined)).toEqual({ windows: {}, errors: [] });
    expect(parseSchedulingWindows('deep=05:00-05:00').errors).toHaveLength(1);
    expect(formatWindow(windows.deep!)).toBe('22:00-06:00 UTC');
  });

  it('handles windows that wrap past midnight; interactive is always open', () => {
    const { windows } = parseSchedulingWindows('deep=22:00-06:00');
    expect(isWindowOpen(windows, 'deep', new Date('2026-10-16T23:30:00Z'))).toBe(true);
    expect(isWindowOpen(windows, 'deep', new Date('2026-10-16T05:59:00Z'))).toBe(true);
    expect(isWindowOpen(windows, 'deep', new Date('2026-10-16T06:00:00Z'))).toBe(false);
    expect(isWindowOpen(windows, 'interactive', NOON)).toBe(true);
    expect(isWindowOpen(windows, 'nightly', NOON)).toBe(true);
    expect(secondsUntilWindowOpens(windows, 'deep', NOON)).toBe(10 * 60 * 60);
    expect(secondsUntilWindowOpens(windows, 'deep', new Date('2026-10-16T23:00:00Z'))).toBe(0);
  });
});

describe('CapacityLedger', () => {
  function ledgerAt(start = NOON.getTime()) {
    let now = start;
    const ledger = new CapacityLedger(() => now);
    return { ledger, advance: (ms: number) => (now += ms) };
  }

  const admit = (ledger: CapacityLedger, id: string, overrides: Partial<Parameters<CapacityLedger['admit']>[0]> = {}) =>
    ledger.admit({ campaignId: id, scope: 'global', project: 'default', campaignClass: 'nightly', workers: 2, seeds: 1_000, rpcCalls: 0, ...overrides });

  it('charges the reservation while running and refunds unused seeds on finish', () => {
    const { ledger } = ledgerAt();
    admit(ledger, 'c1');
    expect(ledger.usage('global')).toEqual({ activeWorkers: 2, seedsToday: 1_000, rpcCallsToday: 0, storageBytes: 0 });

    ledger.report('c1', { seedsProcessed: 400, rpcCalls: 12, storageBytes: 2048, status: 'finished' });
    expect(ledger.usage('global')).toEqual({ activeWorkers: 0, seedsToday: 400, rpcCallsToday: 12, storageBytes: 2048 });
  });

  it('never moves cumulative counters backwards and ignores other scopes', () => {
    const { ledger } = ledgerAt();
    admit(ledger, 'c1', { seeds: 10 });
    ledger.report('c1', { seedsProcessed: 50, status: 'running' });
    ledger.report('c1', { seedsProcessed: 20, status: 'running' });
    expect(ledger.get('c1')?.seedsUsed).toBe(50);
    expect(ledger.usage('global').seedsToday).toBe(50); // used beyond the reservation is charged
    expect(ledger.usage('org-b').seedsToday).toBe(0);
    expect(ledger.report('missing', { seedsProcessed: 1, status: 'running' })).toBeUndefined();
  });

  it('releases workers when a lease expires and renews it on progress', () => {
    const { ledger, advance } = ledgerAt();
    admit(ledger, 'c1', { campaignClass: 'interactive' });
    advance(LEASE_TTL_MS.interactive - 1);
    ledger.report('c1', { seedsProcessed: 1, status: 'running' });
    advance(LEASE_TTL_MS.interactive - 1);
    expect(ledger.usage('global').activeWorkers).toBe(2);
    advance(2);
    expect(ledger.usage('global').activeWorkers).toBe(0);
  });

  it('starts a new daily window at UTC midnight', () => {
    const { ledger, advance } = ledgerAt();
    admit(ledger, 'c1');
    advance(12 * HOUR);
    expect(ledger.usage('global').seedsToday).toBe(0);
  });

  it('computes utilization as busy-worker-hours over capacity-hours', () => {
    const { ledger, advance } = ledgerAt();
    admit(ledger, 'c1', { workers: 4 });
    advance(2 * HOUR);
    ledger.report('c1', { seedsProcessed: 100, status: 'finished' });
    advance(2 * HOUR);
    const now = NOON.getTime() + 4 * HOUR;
    expect(ledger.utilization('global', now - 4 * HOUR, now, 8)).toMatchObject({
      busyWorkerHours: 8,
      capacityWorkerHours: 32,
      utilization: 0.25,
    });
    expect(ledger.utilization('global', now - 4 * HOUR, now, null).utilization).toBeNull();
  });

  it('rolls up cost as seeds x resource units per project and class', () => {
    const { ledger } = ledgerAt();
    admit(ledger, 'a', { project: 'zeta', campaignClass: 'deep' });
    admit(ledger, 'b', { project: 'alpha', campaignClass: 'nightly' });
    admit(ledger, 'c', { project: 'alpha', campaignClass: 'interactive' });
    ledger.report('a', { seedsProcessed: 10, status: 'finished' });
    ledger.report('b', { seedsProcessed: 10, status: 'finished' });
    ledger.report('c', { seedsProcessed: 10, status: 'finished' });
    expect(ledger.costRollup('global', NOON.getTime() - HOUR, NOON.getTime() + HOUR)).toEqual([
      { project: 'alpha', campaignClass: 'interactive', seeds: 10, resourceUnits: 10 },
      { project: 'alpha', campaignClass: 'nightly', seeds: 10, resourceUnits: 20 },
      { project: 'zeta', campaignClass: 'deep', seeds: 10, resourceUnits: 40 },
    ]);
  });
});

describe('campaign admission', () => {
  it('derives the request from the dashboard form and presets', () => {
    expect(deriveCampaignRequest({ parallelism: 4 })).toEqual({
      ok: true,
      request: { scope: 'global', project: 'default', campaignClass: 'interactive', workers: 4, seeds: 1_000, rpcCalls: 0 },
    });
    expect(deriveCampaignRequest({ preset: 'deep', workers: 2, project: 'dex' })).toMatchObject({
      ok: true,
      request: { campaignClass: 'deep', workers: 2, seeds: 10_000_000, project: 'dex' },
    });
    expect(deriveCampaignRequest({ campaignClass: 'huge' }).ok).toBe(false);
    expect(deriveCampaignRequest({ workers: -1 }).ok).toBe(false);
    expect(deriveCampaignRequest({ seeds: 1.5 }).ok).toBe(false);
    expect(deriveCampaignRequest({ project: '../x' }).ok).toBe(false);
  });

  it('checks the window before quotas', () => {
    const request = { scope: 'global', project: 'default', campaignClass: 'deep' as const, workers: 99, seeds: 1, rpcCalls: 0 };
    const windows = parseSchedulingWindows('deep=00:00-06:00').windows;
    expect(
      evaluateCampaignAdmission({ request, limits: { ...UNLIMITED, concurrentWorkers: 1 }, usage: IDLE, windows, now: NOON }),
    ).toEqual({ ok: false, kind: 'window', retryAfterSeconds: 12 * 60 * 60 });
  });

  it('validates the override reason', () => {
    expect(parseOverrideReason(null)).toEqual({ reason: null });
    expect(parseOverrideReason(' incident 42 ')).toEqual({ reason: 'incident 42' });
    expect(parseOverrideReason('  ')).toHaveProperty('error');
    expect(parseOverrideReason('x'.repeat(201))).toHaveProperty('error');
  });
});

describe('mid-run throttle', () => {
  const base = { finished: false, windows: {}, now: NOON };

  it('throttles a class that has used its daily share, but not a higher-priority one', () => {
    const limits = { ...UNLIMITED, seedsPerDay: 1_000 };
    const usage = { ...IDLE, seedsToday: 800 };
    expect(evaluateMidRunThrottle({ ...base, campaignClass: 'deep', limits, usage })).toEqual({
      throttle: true,
      code: 'QUOTA_EXCEEDED',
      resource: 'seeds_per_day',
      retryAfterSeconds: 12 * 60 * 60,
    });
    expect(evaluateMidRunThrottle({ ...base, campaignClass: 'interactive', limits, usage })).toEqual({ throttle: false });
  });

  it('pauses deep work when its window closes and never throttles a finished campaign', () => {
    const windows = parseSchedulingWindows('deep=00:00-06:00').windows;
    expect(evaluateMidRunThrottle({ ...base, windows, campaignClass: 'deep', limits: UNLIMITED, usage: IDLE })).toMatchObject({
      throttle: true,
      code: 'SCHEDULING_WINDOW_CLOSED',
    });
    expect(
      evaluateMidRunThrottle({ ...base, windows, finished: true, campaignClass: 'deep', limits: UNLIMITED, usage: IDLE }),
    ).toEqual({ throttle: false });
  });
});
