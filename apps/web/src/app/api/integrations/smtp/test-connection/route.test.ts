import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import * as nodemailer from 'nodemailer';

vi.mock('nodemailer', () => ({
  createTransport: vi.fn(),
}));

import { POST } from './route';

const validConfig = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  auth: { user: 'user@example.com', pass: 'secret' },
  from: 'alerts@example.com',
  enabled: true,
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/integrations/smtp/test-connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/integrations/smtp/test-connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with success:true when the transporter verifies', async () => {
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      verify: vi.fn().mockResolvedValue(true),
    } as never);

    const response = await POST(makeRequest(validConfig));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { success: true } });
  });

  it('returns 422 with an error message when the transporter fails to verify', async () => {
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      verify: vi.fn().mockRejectedValue(new Error('Invalid login')),
    } as never);

    const response = await POST(makeRequest(validConfig));
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.error).toContain('Invalid login');
  });

  it('returns 422 for a structurally invalid config without calling nodemailer', async () => {
    const response = await POST(makeRequest({ ...validConfig, host: '' }));
    expect(response.status).toBe(422);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed JSON body', async () => {
    const badRequest = new NextRequest('http://localhost/api/integrations/smtp/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const response = await POST(badRequest);
    expect(response.status).toBe(400);
  });
});
