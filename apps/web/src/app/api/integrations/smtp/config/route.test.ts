import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('nodemailer', () => ({
  createTransport: vi.fn(),
}));

import { GET, POST } from './route';

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/integrations/smtp/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/integrations/smtp/config', () => {
  it('GET returns 404 when no config has been saved yet', async () => {
    const response = await GET();
    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json).toHaveProperty('error');
  });

  it('POST rejects an invalid config with 422', async () => {
    const response = await POST(
      makePostRequest({
        host: '',
        port: 587,
        secure: false,
        auth: { user: 'user@example.com', pass: 'secret' },
        from: 'alerts@example.com',
        enabled: false,
      }),
    );
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json).toHaveProperty('error');
  });

  it('POST rejects a malformed JSON body with 400', async () => {
    const badRequest = new NextRequest('http://localhost/api/integrations/smtp/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const response = await POST(badRequest);
    expect(response.status).toBe(400);
  });

  const validConfig = {
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    auth: { user: 'user@example.com', pass: 'secret' },
    from: 'alerts@example.com',
    enabled: true,
  };

  it('POST accepts a valid config', async () => {
    const response = await POST(makePostRequest(validConfig));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: validConfig });
  });

  it('GET then returns the previously saved config', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: validConfig });
  });
});
