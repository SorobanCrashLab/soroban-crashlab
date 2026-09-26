import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/schedules/tick/route';
import { getCronLock, setCronLock, createInMemoryCronLock } from '@/lib/cron/lock';
import { resetSchedulerState } from '@/app/api/schedules/_store';

describe('POST /api/schedules/tick', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env = { ...originalEnv };
    process.env.CRASHLAB_CRON_SECRET = 'test-secret';
    resetSchedulerState();
    setCronLock(createInMemoryCronLock());
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = originalEnv;
  });

  it('returns 401 without Authorization header', async () => {
    const request = new NextRequest('http://localhost/api/schedules/tick', {
      method: 'POST',
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('returns 401 with invalid Authorization header', async () => {
    const request = new NextRequest('http://localhost/api/schedules/tick', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('returns 401 with wrong scheme', async () => {
    const request = new NextRequest('http://localhost/api/schedules/tick', {
      method: 'POST',
      headers: { authorization: 'Basic dGVzdDp0ZXN0' },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('accepts valid Bearer token', async () => {
    const request = new NextRequest('http://localhost/api/schedules/tick', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('returns 409 when lock is held (concurrent tick)', async () => {
    const lock = getCronLock();
    const now = new Date();
    const slotKey = `tick:${Math.floor(now.getTime() / 60_000)}`;

    await lock.acquire(slotKey);

    const request = new NextRequest('http://localhost/api/schedules/tick', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });

    const response = await POST(request);
    expect(response.status).toBe(409);

    await lock.release(slotKey);
  });

  it('is idempotent for same time slot', async () => {
    const request1 = new NextRequest('http://localhost/api/schedules/tick', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
      body: JSON.stringify({ now: '2026-01-01T00:00:00.000Z' }),
    });

    const response1 = await POST(request1);
    expect(response1.status).toBe(200);
    const data1 = await response1.json();
    expect(data1.data.idempotent).not.toBe(true);

    // Second call with same time should be idempotent
    const request2 = new NextRequest('http://localhost/api/schedules/tick', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
      body: JSON.stringify({ now: '2026-01-01T00:00:00.000Z' }),
    });

    const response2 = await POST(request2);
    expect(response2.status).toBe(200);
    const data2 = await response2.json();
    expect(data2.data.idempotent).toBe(true);
  });

  it('advances schedules on tick', async () => {
    const request = new NextRequest('http://localhost/api/schedules/tick', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
      body: JSON.stringify({ now: '2026-03-01T03:00:00.000Z' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.data).toHaveProperty('created');
    expect(data.data).toHaveProperty('schedules');
    expect(data.data).toHaveProperty('history');
    expect(data.data).toHaveProperty('evaluatedAt');
    expect(Array.isArray(data.data.created)).toBe(true);
    expect(Array.isArray(data.data.schedules)).toBe(true);
    expect(Array.isArray(data.data.history)).toBe(true);
  });

  it('works without CRASHLAB_CRON_SECRET in development', async () => {
    delete process.env.CRASHLAB_CRON_SECRET;

    const request = new NextRequest('http://localhost/api/schedules/tick', {
      method: 'POST',
    });

    const response = await POST(request);
    // Should work in development without secret
    expect(response.status).toBe(200);
  });

  it('accepts time override in request body', async () => {
    const request = new NextRequest('http://localhost/api/schedules/tick', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
      body: JSON.stringify({ now: '2026-03-01T03:00:00.000Z' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.data.evaluatedAt).toBe('2026-03-01T03:00:00.000Z');
  });
});

describe('CronLock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('acquires and releases lock', async () => {
    const lock = createInMemoryCronLock();

    const acquired1 = await lock.acquire('test-lock');
    expect(acquired1).toBe(true);

    const acquired2 = await lock.acquire('test-lock');
    expect(acquired2).toBe(false);

    await lock.release('test-lock');

    const acquired3 = await lock.acquire('test-lock');
    expect(acquired3).toBe(true);
  });

  it('lock expires after TTL', async () => {
    const lock = createInMemoryCronLock();

    await lock.acquire('test-lock');
    expect(await lock.isLocked('test-lock')).toBe(true);

    // Advance time past TTL
    vi.advanceTimersByTime(61_000);

    expect(await lock.isLocked('test-lock')).toBe(false);
    const acquired = await lock.acquire('test-lock');
    expect(acquired).toBe(true);
  });

  it('different locks are independent', async () => {
    const lock = createInMemoryCronLock();

    await lock.acquire('lock-1');
    expect(await lock.isLocked('lock-1')).toBe(true);
    expect(await lock.isLocked('lock-2')).toBe(false);

    await lock.acquire('lock-2');
    expect(await lock.isLocked('lock-2')).toBe(true);
  });
});