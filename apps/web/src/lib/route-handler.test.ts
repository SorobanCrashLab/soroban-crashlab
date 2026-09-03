import { describe, expect, it } from 'vitest';
import { jsonError, readJsonBody, withRouteErrorHandling } from './route-handler';

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
