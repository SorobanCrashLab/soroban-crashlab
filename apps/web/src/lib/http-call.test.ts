import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  DEFAULT_HTTP_CALL_POLICY,
  httpCall,
  OutboundNetworkError,
  OutboundTimeoutError,
  outboundErrorCode,
  parseRetryAfterMs,
} from './http-call';
import { ERROR_CODES } from './error-codes';

/**
 * A fake provider. Each test queues the behaviour of successive requests:
 * a status (with optional headers) or 'hang' (accept, never answer).
 */
type Step = { status: number; headers?: Record<string, string>; body?: string } | 'hang';

let server: http.Server;
let baseUrl: string;
let script: Step[] = [];
let hits: Array<{ method: string; url: string }> = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits.push({ method: req.method ?? '', url: req.url ?? '' });
    const step = script.shift() ?? { status: 200, body: 'ok' };
    if (step === 'hang') return; // never respond
    res.writeHead(step.status, step.headers);
    res.end(step.body ?? '');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  script = [];
  hits = [];
});

const fast = { backoff: { baseMs: 5, maxMs: 20 }, random: () => 0 };

describe('httpCall against a fake provider (#1633)', () => {
  it('returns the response on success without retrying', async () => {
    script = [{ status: 200, body: 'hello' }];

    const res = await httpCall('fake', `${baseUrl}/ok`, {}, fast);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello');
    expect(hits).toHaveLength(1);
  });

  it('retries a 429 and honours Retry-After', async () => {
    script = [{ status: 429, headers: { 'Retry-After': '0' } }, { status: 200 }];
    const waits: number[] = [];

    const res = await httpCall('fake', `${baseUrl}/limited`, {}, {
      ...fast,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });

    expect(res.status).toBe(200);
    expect(hits).toHaveLength(2);
    expect(waits).toHaveLength(1);
  });

  it('caps a long Retry-After at the backoff ceiling', async () => {
    script = [{ status: 503, headers: { 'Retry-After': '120' } }, { status: 200 }];
    const waits: number[] = [];

    await httpCall('fake', `${baseUrl}/slow-down`, {}, {
      ...fast,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });

    expect(waits).toEqual([20]);
  });

  it('gives up on a persistent 500 after the bounded retries and returns it', async () => {
    script = [{ status: 500 }, { status: 500 }, { status: 500 }, { status: 200 }];

    const res = await httpCall('fake', `${baseUrl}/broken`, {}, fast);

    expect(res.status).toBe(500);
    expect(hits).toHaveLength(DEFAULT_HTTP_CALL_POLICY.maxRetries + 1);
  });

  it('does not retry a non-retryable 4xx', async () => {
    script = [{ status: 401 }];

    const res = await httpCall('fake', `${baseUrl}/denied`, {}, fast);

    expect(res.status).toBe(401);
    expect(hits).toHaveLength(1);
  });

  it('times out a hung attempt, retries, then throws a typed timeout error', async () => {
    script = ['hang', 'hang', 'hang'];
    const started = Date.now();

    const error = await httpCall('fake', `${baseUrl}/hang`, {}, {
      ...fast,
      attemptTimeoutMs: 50,
      totalBudgetMs: 1_000,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(OutboundTimeoutError);
    expect((error as OutboundTimeoutError).integration).toBe('fake');
    expect((error as OutboundTimeoutError).attempts).toBe(3);
    expect(hits).toHaveLength(3);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('never exceeds the total budget however slow each attempt is', async () => {
    script = ['hang', 'hang', 'hang'];
    const started = Date.now();

    const error = await httpCall('fake', `${baseUrl}/hang`, {}, {
      ...fast,
      attemptTimeoutMs: 5_000,
      totalBudgetMs: 120,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(OutboundTimeoutError);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('does not retry a POST unless the caller vouches for idempotency', async () => {
    script = [{ status: 503 }, { status: 200 }];
    const plain = await httpCall('fake', `${baseUrl}/create`, { method: 'POST', body: '{}' }, fast);
    expect(plain.status).toBe(503);
    expect(hits).toHaveLength(1);

    hits = [];
    script = [{ status: 503 }, { status: 200 }];
    const deduped = await httpCall('fake', `${baseUrl}/create`, { method: 'POST', body: '{}' }, {
      ...fast,
      idempotent: true,
    });
    expect(deduped.status).toBe(200);
    expect(hits).toHaveLength(2);
  });

  it('throws a typed network error when the provider is unreachable', async () => {
    const closed = http.createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((resolve) => closed.close(() => resolve()));

    const error = await httpCall('fake', `http://127.0.0.1:${port}/`, {}, fast).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(OutboundNetworkError);
    expect((error as OutboundNetworkError).attempts).toBe(DEFAULT_HTTP_CALL_POLICY.maxRetries + 1);
  });

  it('propagates a caller abort untouched instead of retrying', async () => {
    script = ['hang'];
    const controller = new AbortController();
    const pending = httpCall('fake', `${baseUrl}/hang`, { signal: controller.signal }, fast);
    setTimeout(() => controller.abort(), 20);

    const error = await pending.catch((err: unknown) => err);

    expect(error).not.toBeInstanceOf(OutboundTimeoutError);
    expect((error as Error).name).toBe('AbortError');
    expect(hits).toHaveLength(1);
  });
});

describe('error taxonomy and helpers', () => {
  it('maps outbound failures onto catalogued error codes', () => {
    expect(outboundErrorCode(new OutboundTimeoutError('x', 1, 1))).toBe('INTEGRATION_TIMEOUT');
    expect(outboundErrorCode(new OutboundNetworkError('x', new Error('boom'), 1))).toBe('INTEGRATION_UNAVAILABLE');
    expect(outboundErrorCode(new Error('other'))).toBe('INTERNAL_ERROR');
    expect(ERROR_CODES.INTEGRATION_TIMEOUT.httpStatus).toBe(504);
    expect(ERROR_CODES.INTEGRATION_UNAVAILABLE.httpStatus).toBe(502);
  });

  it('parses Retry-After as seconds or an HTTP date', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z');
    expect(parseRetryAfterMs('3', now)).toBe(3_000);
    expect(parseRetryAfterMs('Thu, 01 Jan 2026 00:00:05 GMT', now)).toBe(5_000);
    expect(parseRetryAfterMs(null, now)).toBeNull();
    expect(parseRetryAfterMs('soon', now)).toBeNull();
  });

  it('keeps the default budget inside the 10 s serverless limit', () => {
    expect(DEFAULT_HTTP_CALL_POLICY.totalBudgetMs).toBeLessThan(10_000);
    expect(DEFAULT_HTTP_CALL_POLICY.attemptTimeoutMs).toBeLessThan(DEFAULT_HTTP_CALL_POLICY.totalBudgetMs);
  });
});
