import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import * as nodemailer from 'nodemailer';
import { setStoredSmtpConfig, getEmailLog } from '@/lib/integrations/smtp-store';

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
  return new NextRequest('http://localhost/api/integrations/smtp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/integrations/smtp/send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when "to" is missing or invalid', async () => {
    const response = await POST(makeRequest({ to: 'not-an-email' }));
    expect(response.status).toBe(400);
  });

  it('returns 404 when no SMTP configuration has been saved yet', async () => {
    const response = await POST(makeRequest({ to: 'recipient@example.com' }));
    expect(response.status).toBe(404);
  });

  it('sends the email and records a "sent" history entry once configured', async () => {
    setStoredSmtpConfig(validConfig);
    const sendMail = vi.fn().mockResolvedValue({ messageId: '<test@example.com>' });
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);

    const response = await POST(makeRequest({ to: 'recipient@example.com' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { success: true, messageId: '<test@example.com>' } });

    const log = getEmailLog();
    expect(log[0]).toMatchObject({
      to: 'recipient@example.com',
      status: 'sent',
      messageId: '<test@example.com>',
    });
  });

  it('records a "failed" history entry and returns 422 when sending fails', async () => {
    setStoredSmtpConfig(validConfig);
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail: vi.fn().mockRejectedValue(new Error('Connection refused')),
    } as never);

    const response = await POST(makeRequest({ to: 'recipient@example.com' }));
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.error).toContain('Connection refused');

    const log = getEmailLog();
    expect(log[0]).toMatchObject({ to: 'recipient@example.com', status: 'failed' });
  });

  it('returns 400 for a malformed JSON body', async () => {
    const badRequest = new NextRequest('http://localhost/api/integrations/smtp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const response = await POST(badRequest);
    expect(response.status).toBe(400);
  });
});
