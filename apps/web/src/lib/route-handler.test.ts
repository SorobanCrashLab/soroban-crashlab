import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonError, readJsonBody, withRouteErrorHandling } from './route-handler';
import { logger } from './logger';

describe('route-handler', () => {
  it('returns a consistent JSON error envelope', async () => {
    const response = jsonError('Bad request', 400);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Bad request' });
  });

  it('parses valid JSON bodies and rejects malformed payloads', async () => {
    const validRequest = new Request('https://example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    });

    await expect(readJsonBody(validRequest)).resolves.toEqual({ body: { ok: true } });

    const invalidRequest = new Request('https://example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid json',
    });

    const result = await readJsonBody(invalidRequest);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(400);
      await expect(result.error.json()).resolves.toEqual({
        error: 'Request body must be valid JSON.',
      });
    }
  });

  it('normalizes unexpected undefined handler results into a 500 JSON error', async () => {
    const wrapped = withRouteErrorHandling('GET /api/test', async () => {
      return undefined as unknown as Response;
    });

    const response = await wrapped();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'An unexpected error occurred.',
    });
  });
});

describe('request size rejection', () => {
  afterEach(() => vi.restoreAllMocks());

  it('emits the standard 413 envelope and logs the route class', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const wrapped = withRouteErrorHandling('POST /api/webhooks/retry', async () => new Response('ok'));
    const request = new Request('https://example.com/api/webhooks/retry', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '999999' },
      body: '{}',
    });

    const response = await wrapped(request);
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: 'PAYLOAD_TOO_LARGE', limit: 256 * 1024, actual: 999999 }),
    );
    expect(info).toHaveBeenCalledWith(
      'POST /api/webhooks/retry rejected (size limit)',
      expect.objectContaining({ status: 413, route_class: 'webhook' }),
    );
  });
});
