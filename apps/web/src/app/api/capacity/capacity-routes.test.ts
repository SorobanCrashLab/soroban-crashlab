import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as createCampaign } from '../campaigns/route';
import { GET as capacityReport } from './route';
import { POST as reportUsage } from './usage/route';
import { POST as createSchedule } from '../schedules/route';
import { PUT as updateSchedule } from '../schedules/[id]/route';
import { POST as tick } from '../schedules/tick/route';
import { resetSchedulerState } from '../schedules/_store';
import { getAuditLog, resetAuditLog } from '@/lib/audit';
import { CapacityLedger, resetCapacityLedger } from '@/lib/capacity/usage-ledger';
import { ENV_API_KEY_IDENTITY } from '@/lib/rbac';
import { createApiToken, resetApiTokenStore } from '@/lib/storage/api-token-store';
import { InMemoryIdempotencyStore, resetIdempotencyStore } from '@/lib/storage/idempotency-store';
import { assignRole, resetRoleStore } from '@/lib/storage/role-store';

const QUOTA_ENV = [
  'CRASHLAB_QUOTA_CONCURRENT_WORKERS',
  'CRASHLAB_QUOTA_SEEDS_PER_DAY',
  'CRASHLAB_QUOTA_RPC_CALLS_PER_DAY',
  'CRASHLAB_QUOTA_STORAGE_GB',
  'CRASHLAB_SCHEDULING_WINDOWS',
  'CRASHLAB_WEBHOOK_API_KEY',
];

const OPERATOR_KEY = 'operator-key-for-tests';

function campaignRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function campaignId(res: Response): Promise<string> {
  return ((await res.json()) as { data: { campaign: { id: string } } }).data.campaign.id;
}

function usageRequest(body: unknown, token?: string): NextRequest {
  return new NextRequest('http://localhost/api/capacity/usage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  for (const name of QUOTA_ENV) delete process.env[name];
  resetCapacityLedger(new CapacityLedger());
  resetIdempotencyStore(new InMemoryIdempotencyStore());
  resetApiTokenStore();
  resetAuditLog();
  await resetRoleStore();
});

afterEach(() => {
  for (const name of QUOTA_ENV) delete process.env[name];
  resetCapacityLedger();
  resetIdempotencyStore();
});

describe('POST /api/campaigns — quota enforcement at creation (#1904)', () => {
  it('admits everything when no quotas are configured (backwards compatible)', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await createCampaign(campaignRequest({ preset: 'deep', workers: 32 }))).status).toBe(201);
    }
  });

  it('rejects with 429 QUOTA_EXCEEDED, details and Retry-After once workers are exhausted', async () => {
    process.env.CRASHLAB_QUOTA_CONCURRENT_WORKERS = '8';
    const first = await createCampaign(campaignRequest({ parallelism: 6 }));
    expect(first.status).toBe(201);
    expect((await first.json()).data.capacity).toMatchObject({ campaignClass: 'interactive', workers: 6, quotaOverride: false });

    const second = await createCampaign(campaignRequest({ parallelism: 4 }));
    expect(second.status).toBe(429);
    expect(second.headers.get('Retry-After')).toBe('60');
    const body = await second.json();
    expect(body.code).toBe('QUOTA_EXCEEDED');
    expect(body.quota).toEqual({ resource: 'concurrent_workers', limit: 8, used: 6, requested: 4 });
  });

  it('reserves headroom: deep cannot take the last share of the daily seeds', async () => {
    process.env.CRASHLAB_QUOTA_SEEDS_PER_DAY = '1000';
    expect((await createCampaign(campaignRequest({ campaignClass: 'deep', seeds: 700 }))).status).toBe(201);
    expect((await createCampaign(campaignRequest({ campaignClass: 'deep', seeds: 100 }))).status).toBe(429);
    // Interactive work may still use the reserved 25%.
    expect((await createCampaign(campaignRequest({ campaignClass: 'interactive', seeds: 300 }))).status).toBe(201);
  });

  it('rejects with 403 SCHEDULING_WINDOW_CLOSED outside the class window', async () => {
    // A window that is closed right now: it opened and closed in the past hour.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const start = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const end = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    process.env.CRASHLAB_SCHEDULING_WINDOWS = `deep=${pad(start.getUTCHours())}:00-${pad(end.getUTCHours())}:00`;

    const res = await createCampaign(campaignRequest({ preset: 'deep' }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('SCHEDULING_WINDOW_CLOSED');
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    // Interactive campaigns are never windowed.
    expect((await createCampaign(campaignRequest({ preset: 'smoke' }))).status).toBe(201);
  });

  it('does not charge a replayed idempotent request twice', async () => {
    process.env.CRASHLAB_QUOTA_CONCURRENT_WORKERS = '4';
    const headers = { 'Idempotency-Key': 'same' };
    expect((await createCampaign(campaignRequest({ workers: 4 }, headers))).status).toBe(201);
    expect((await createCampaign(campaignRequest({ workers: 4 }, headers))).status).toBe(200);
    expect((await (await capacityReport(new NextRequest('http://localhost/api/capacity'))).json()).data.usage.activeWorkers).toBe(4);
  });

  it('validates capacity fields', async () => {
    const res = await createCampaign(campaignRequest({ workers: 'many' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/campaigns — admin override audit (#1904)', () => {
  beforeEach(() => {
    process.env.CRASHLAB_QUOTA_CONCURRENT_WORKERS = '1';
    process.env.CRASHLAB_WEBHOOK_API_KEY = OPERATOR_KEY;
  });

  it('lets a maintainer bypass a quota with a reason and audits it', async () => {
    await assignRole({ identityType: 'api-key', identityValue: ENV_API_KEY_IDENTITY, role: 'maintainer' });
    await createCampaign(campaignRequest({ workers: 1 }));

    const res = await createCampaign(
      campaignRequest(
        { workers: 1 },
        { Authorization: `Bearer ${OPERATOR_KEY}`, 'X-CrashLab-Quota-Override': 'incident #42 hotfix verification' },
      ),
    );
    expect(res.status).toBe(201);
    const id = await campaignId(res.clone());
    expect((await res.json()).data.capacity.quotaOverride).toBe(true);

    const entry = getAuditLog().list().find((e) => e.action === 'quota.override');
    expect(entry).toMatchObject({
      actor: `api-key:${ENV_API_KEY_IDENTITY}`,
      target: id,
      metadata: { reason: 'incident #42 hotfix verification', bypassed: 'quota', campaignClass: 'interactive' },
    });
  });

  it('refuses the override for a non-maintainer and audits nothing', async () => {
    await createCampaign(campaignRequest({ workers: 1 }));
    const res = await createCampaign(
      campaignRequest({ workers: 1 }, { Authorization: `Bearer ${OPERATOR_KEY}`, 'X-CrashLab-Quota-Override': 'please' }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('QUOTA_OVERRIDE_FORBIDDEN');
    expect(getAuditLog().list().some((e) => e.action === 'quota.override')).toBe(false);
  });

  it('requires a usable reason', async () => {
    const res = await createCampaign(campaignRequest({ workers: 1 }, { 'X-CrashLab-Quota-Override': ' ' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/capacity/usage — mid-run path (#1904)', () => {
  let runnerToken: string;

  beforeEach(() => {
    runnerToken = createApiToken({ name: 'runner', scopes: ['runs:write'] }).secret;
  });

  it('requires a runs:write token', async () => {
    expect((await reportUsage(usageRequest({ campaignId: 'x', seedsProcessed: 1, status: 'running' }))).status).toBe(401);
    const readOnly = createApiToken({ name: 'ro', scopes: ['runs:read'] }).secret;
    expect((await reportUsage(usageRequest({ campaignId: 'x', seedsProcessed: 1, status: 'running' }, readOnly))).status).toBe(403);
  });

  it('returns 404 for a campaign without a lease and 400 for a bad report', async () => {
    expect((await reportUsage(usageRequest({ campaignId: 'nope', seedsProcessed: 1, status: 'running' }, runnerToken))).status).toBe(404);
    expect((await reportUsage(usageRequest({ campaignId: 'x', seedsProcessed: -1, status: 'running' }, runnerToken))).status).toBe(400);
  });

  it('throttles a deep campaign mid-run once the scope passes its daily share', async () => {
    process.env.CRASHLAB_QUOTA_SEEDS_PER_DAY = '1000';
    const id = await campaignId(await createCampaign(campaignRequest({ campaignClass: 'deep', seeds: 500 })));

    const ok = await (await reportUsage(usageRequest({ campaignId: id, seedsProcessed: 400, status: 'running' }, runnerToken))).json();
    expect(ok.data.throttle).toEqual({ throttle: false });

    const over = await (await reportUsage(usageRequest({ campaignId: id, seedsProcessed: 800, status: 'running' }, runnerToken))).json();
    expect(over.data.throttle).toMatchObject({ throttle: true, code: 'QUOTA_EXCEEDED', resource: 'seeds_per_day' });
    expect(over.data.lease.seedsUsed).toBe(800);

    const done = await (await reportUsage(usageRequest({ campaignId: id, seedsProcessed: 800, status: 'finished' }, runnerToken))).json();
    expect(done.data.throttle).toEqual({ throttle: false });
    expect(done.data.lease.finished).toBe(true);
  });
});

describe('GET /api/capacity — utilization and cost report (#1904)', () => {
  it('reports limits, class shares, usage, utilization and cost', async () => {
    process.env.CRASHLAB_QUOTA_CONCURRENT_WORKERS = '10';
    process.env.CRASHLAB_SCHEDULING_WINDOWS = 'deep=00:00-06:00,bogus';
    const runner = createApiToken({ name: 'runner', scopes: ['runs:write'] }).secret;
    const id = await campaignId(await createCampaign(campaignRequest({ preset: 'nightly', workers: 2, project: 'dex' })));
    await reportUsage(usageRequest({ campaignId: id, seedsProcessed: 50, status: 'finished' }, runner));

    const res = await capacityReport(new NextRequest('http://localhost/api/capacity?windowHours=1'));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.scope).toBe('global');
    expect(data.limits.concurrentWorkers).toBe(10);
    expect(data.classes.map((c: { campaignClass: string; limits: { concurrentWorkers: number } }) => [c.campaignClass, c.limits.concurrentWorkers])).toEqual([
      ['interactive', 10],
      ['nightly', 9],
      ['deep', 8],
    ]);
    expect(data.classes[2].window).toBe('00:00-06:00 UTC');
    expect(data.windowErrors).toHaveLength(1);
    expect(data.utilization.capacityWorkerHours).toBe(10);
    expect(data.cost.rows).toEqual([{ project: 'dex', campaignClass: 'nightly', seeds: 50, resourceUnits: 100 }]);
    expect(data.cost.totalResourceUnits).toBe(100);
  });

  it('validates the window size', async () => {
    expect((await capacityReport(new NextRequest('http://localhost/api/capacity?windowHours=0'))).status).toBe(400);
    expect((await capacityReport(new NextRequest('http://localhost/api/capacity?windowHours=99999'))).status).toBe(400);
  });
});

describe('schedules — capacity class and windows (#1904)', () => {
  function scheduleRequest(url: string, method: string, body: unknown): NextRequest {
    return new NextRequest(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  beforeEach(() => resetSchedulerState());
  afterEach(() => resetSchedulerState());

  it('accepts a campaign class on create and update, and rejects unknown ones', async () => {
    const created = await createSchedule(
      scheduleRequest('http://localhost/api/schedules', 'POST', { name: 'Deep sweep', cron: '0 2 * * *', campaignClass: 'deep' }),
    );
    expect(created.status).toBe(201);
    const { schedule } = (await created.json()).data;
    expect(schedule.campaignClass).toBe('deep');

    const bad = await createSchedule(
      scheduleRequest('http://localhost/api/schedules', 'POST', { name: 'Odd', cron: '0 2 * * *', campaignClass: 'urgent' }),
    );
    expect(bad.status).toBe(400);

    const params = { params: Promise.resolve({ id: schedule.id }) };
    const updated = await updateSchedule(
      scheduleRequest(`http://localhost/api/schedules/${schedule.id}`, 'PUT', { campaignClass: 'nightly' }),
      params,
    );
    expect((await updated.json()).data.schedule.campaignClass).toBe('nightly');
    const badPut = await updateSchedule(
      scheduleRequest(`http://localhost/api/schedules/${schedule.id}`, 'PUT', { campaignClass: 7 }),
      { params: Promise.resolve({ id: schedule.id }) },
    );
    expect(badPut.status).toBe(400);
  });

  it('defers windowed schedules on tick and reports them', async () => {
    delete process.env.CRASHLAB_CRON_SECRET;
    process.env.CRASHLAB_SCHEDULING_WINDOWS = 'nightly=00:00-01:00';
    const res = await tick(scheduleRequest('http://localhost/api/schedules/tick', 'POST', { now: '2026-03-02T12:00:00.000Z' }));
    const { data } = await res.json();
    // The seeded nightly schedules are due but outside 00:00-01:00 UTC.
    expect(data.deferred.length).toBeGreaterThan(0);
    expect(data.deferred.every((d: { campaignClass: string }) => d.campaignClass === 'nightly')).toBe(true);
    expect(data.created).toEqual([]);
  });
});
