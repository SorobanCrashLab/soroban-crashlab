/**
 * Tests for Discord webhook API route
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { POST } from './route';

describe('POST /api/integrations/discord', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns 503 when webhook URL is not configured', async () => {
    delete process.env.DISCORD_WEBHOOK_URL;

    const request = new Request('http://localhost/api/integrations/discord', {
      method: 'POST',
      body: JSON.stringify({ content: 'Test' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toContain('not configured');
  });

  it('returns 400 for invalid JSON body', async () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/123/abc';

    const request = new Request('http://localhost/api/integrations/discord', {
      method: 'POST',
      body: 'invalid json',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('JSON');
  });

  it('returns 400 when message has no content or embeds', async () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/123/abc';

    const request = new Request('http://localhost/api/integrations/discord', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('content or embeds');
  });

  it('returns 200 when notification is sent successfully', async () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/123/abc';

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 204,
      } as Response),
    );

    const request = new Request('http://localhost/api/integrations/discord', {
      method: 'POST',
      body: JSON.stringify({ content: 'Test message' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.success).toBe(true);
    expect(data.data.message).toContain('successfully');
  });

  it('returns 500 when Discord webhook fails', async () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/123/abc';

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid payload'),
      } as Response),
    );

    const request = new Request('http://localhost/api/integrations/discord', {
      method: 'POST',
      body: JSON.stringify({ content: 'Test' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBeDefined();
  });

  it('accepts message with embeds', async () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/123/abc';

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 204,
      } as Response),
    );

    const request = new Request('http://localhost/api/integrations/discord', {
      method: 'POST',
      body: JSON.stringify({
        embeds: [{ title: 'Test', description: 'Test description' }],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.success).toBe(true);
  });
});
