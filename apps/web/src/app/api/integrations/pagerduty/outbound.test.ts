/**
 * PagerDuty routes under the uniform outbound policy (#1633): each scenario
 * scripts the fake Events API behind `fetch`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as TRIGGER } from './trigger/route';
import { POST as TEST_CONNECTION } from './test-connection/route';
import { PAGERDUTY_FETCH_TIMEOUT_MS } from '@/lib/timeouts';

const KEY = 'k'.repeat(32);
type Step = Response | 'hang';
let script: Step[];
let calls: RequestInit[];

function hangUntilAborted(init: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
}

beforeEach(() => {
  script = [];
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(init);
      const step = script.shift() ?? new Response('{}', { status: 202 });
      return step === 'hang' ? hangUntilAborted(init) : step;
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const triggerRequest = () =>
  new Request('http://t/api/integrations/pagerduty/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ integrationKey: KEY, runId: 'run-1', signature: 'sig', summary: 'boom' }),
  });

const testConnectionRequest = () =>
  new Request('http://t/api/integrations/pagerduty/test-connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ integrationKey: KEY }),
  });

describe.each([
  ['trigger', TRIGGER, triggerRequest],
  ['test-connection', TEST_CONNECTION, testConnectionRequest],
] as const)('PagerDuty %s', (_name, handler, makeRequest) => {
  it('succeeds on a 202', async () => {
    script = [new Response('{"dedup_key":"d"}', { status: 202 })];
    const res = await handler(makeRequest());
    expect((await res.json()).data.success).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('retries a 429 (dedup_key makes the POST safe to repeat) and succeeds', async () => {
    script = [new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } }), new Response('{}', { status: 202 })];
    const res = await handler(makeRequest());
    expect((await res.json()).data.success).toBe(true);
    expect(calls).toHaveLength(2);
    // Every attempt resends the same dedup_key.
    expect(new Set(calls.map((init) => JSON.parse(String(init.body)).dedup_key)).size).toBe(1);
  });

  it('surfaces a persistent 500 as an error after bounded retries', async () => {
    script = [new Response('down', { status: 500 }), new Response('down', { status: 500 }), new Response('down', { status: 500 })];
    const res = await handler(makeRequest());
    expect((await res.json()).error).toBe('down');
    expect(calls).toHaveLength(3);
  });

  it('answers within the budget when PagerDuty hangs, with a typed timeout code', async () => {
    vi.useFakeTimers();
    script = ['hang', 'hang', 'hang'];
    const pending = handler(makeRequest());
    await vi.advanceTimersByTimeAsync(10_000);
    const body = await (await pending).json();
    expect(body.data.code).toBe('INTEGRATION_TIMEOUT');
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it('bounds every attempt with an abort signal', async () => {
    await handler(makeRequest());
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);
    expect(PAGERDUTY_FETCH_TIMEOUT_MS).toBeLessThan(10_000);
  });
});
