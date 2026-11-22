import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/sentry/test-connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/sentry/test-connection', () => {
  it('returns 200 with success:true for a reachable DSN', async () => {
    const response = await POST(makeRequest({ dsn: 'https://key@sentry.io/1' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { success: true } });
  });

  it('returns 422 with an error message for an unreachable DSN', async () => {
    const response = await POST(makeRequest({ dsn: 'https://example.com/not-sentry' }));
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.data.success).toBe(false);
    expect(json.data.error).toContain('valid Sentry DSN');
  });

  it('returns 400 when dsn is missing', async () => {
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it('returns 400 for a malformed JSON body', async () => {
    const badRequest = new NextRequest('http://localhost/api/sentry/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const response = await POST(badRequest);
    expect(response.status).toBe(400);
  });
});
