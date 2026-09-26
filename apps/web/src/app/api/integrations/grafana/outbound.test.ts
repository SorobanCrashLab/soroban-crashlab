/**
 * Grafana routes under the uniform outbound policy (#1633).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as TEST_CONNECTION } from './test-connection/route';
import { POST as ANNOTATE } from './annotations/route';

type Step = Response | 'hang';
let script: Step[];
let calls: Array<{ url: string; init: RequestInit }>;

beforeEach(() => {
  script = [];
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const step = script.shift() ?? new Response('{}', { status: 200 });
      if (step !== 'hang') return step;
      return new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const post = (path: string, body: unknown) =>
  new Request(`http://t${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const connection = () =>
  post('/api/integrations/grafana/test-connection', { baseUrl: 'https://grafana.example.com', apiToken: 'glsa_token_123' });

const annotation = () =>
  post('/api/integrations/grafana/annotations', {
    baseUrl: 'https://grafana.example.com',
    apiToken: 'glsa_token_123',
    runId: 'run-1',
    text: 'crash',
    tags: ['crashlab'],
  });

describe('Grafana test-connection (GET /api/health)', () => {
  it('succeeds against a healthy instance', async () => {
    const res = await TEST_CONNECTION(connection());
    expect((await res.json()).data).toEqual({ success: true });
    expect(calls[0].url).toBe('https://grafana.example.com/api/health');
  });

  it('retries a 429 then succeeds', async () => {
    script = [new Response('', { status: 429, headers: { 'Retry-After': '0' } }), new Response('{}', { status: 200 })];
    const res = await TEST_CONNECTION(connection());
    expect((await res.json()).data.success).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('reports a persistent 500 after bounded retries', async () => {
    script = [new Response('bad', { status: 500 }), new Response('bad', { status: 500 }), new Response('bad', { status: 500 })];
    const res = await TEST_CONNECTION(connection());
    expect((await res.json()).error).toBe('bad');
    expect(calls).toHaveLength(3);
  });

  it('answers within the budget when Grafana hangs instead of spinning forever', async () => {
    vi.useFakeTimers();
    script = ['hang', 'hang', 'hang'];
    const pending = TEST_CONNECTION(connection());
    await vi.advanceTimersByTimeAsync(10_000);
    const body = await (await pending).json();
    expect(body.data.code).toBe('INTEGRATION_TIMEOUT');
  });
});

describe('Grafana annotations (POST, not idempotent)', () => {
  it('creates an annotation', async () => {
    script = [new Response('{"id":7}', { status: 200 })];
    const res = await ANNOTATE(annotation());
    expect((await res.json()).data).toEqual({ success: true, annotationId: 7 });
  });

  it('never retries the create, even on a retryable status', async () => {
    script = [new Response('busy', { status: 503 }), new Response('{"id":1}', { status: 200 })];
    const res = await ANNOTATE(annotation());
    expect((await res.json()).error).toBe('busy');
    expect(calls).toHaveLength(1);
  });
});
