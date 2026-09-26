/**
 * Tests for Discord webhook integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateDiscordWebhookUrl,
  createDiscordAdapter,
  createRunEventEmbed,
  createCriticalAlertEmbed,
  createSimpleMessage,
} from './discord-webhook';

describe('validateDiscordWebhookUrl', () => {
  it('returns null for valid Discord webhook URLs', () => {
    expect(validateDiscordWebhookUrl('https://discord.com/api/webhooks/123/abc')).toBeNull();
    expect(validateDiscordWebhookUrl('https://discordapp.com/api/webhooks/456/def')).toBeNull();
  });

  it('returns error for empty URL', () => {
    expect(validateDiscordWebhookUrl('')).toContain('required');
  });

  it('returns error for non-Discord domain', () => {
    expect(validateDiscordWebhookUrl('https://example.com/api/webhooks/123')).toContain('domain');
  });

  it('returns error for missing webhooks path', () => {
    expect(validateDiscordWebhookUrl('https://discord.com/api/test')).toContain('path');
  });

  it('returns error for invalid URL format', () => {
    expect(validateDiscordWebhookUrl('not-a-url')).toContain('format');
  });
});

describe('createDiscordAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends notification successfully with valid webhook', async () => {
    const adapter = createDiscordAdapter({
      fetchImpl: vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 204,
        } as Response),
      ),
    });

    const result = await adapter.sendNotification(
      { webhookUrl: 'https://discord.com/api/webhooks/123/abc' },
      { content: 'Test message' },
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns error for invalid webhook URL', async () => {
    const adapter = createDiscordAdapter();
    const result = await adapter.sendNotification(
      { webhookUrl: 'https://example.com/invalid' },
      { content: 'Test' },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('domain');
  });

  it('returns error when Discord API returns non-OK response', async () => {
    const adapter = createDiscordAdapter({
      fetchImpl: vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          text: () => Promise.resolve('Bad Request'),
        } as Response),
      ),
    });

    const result = await adapter.sendNotification(
      { webhookUrl: 'https://discord.com/api/webhooks/123/abc' },
      { content: 'Test' },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Discord API error');
    expect(result.error).toContain('400');
  });

  it('returns error when fetch throws', async () => {
    const adapter = createDiscordAdapter({
      fetchImpl: vi.fn(() => Promise.reject(new Error('Network error'))),
    });

    const result = await adapter.sendNotification(
      { webhookUrl: 'https://discord.com/api/webhooks/123/abc' },
      { content: 'Test' },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Network error');
  });

  it('uses default username when not provided', async () => {
    const mockFetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve({ ok: true, status: 204 } as Response),
    );
    const adapter = createDiscordAdapter({ fetchImpl: mockFetch });

    await adapter.sendNotification(
      { webhookUrl: 'https://discord.com/api/webhooks/123/abc' },
      { content: 'Test' },
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(callBody.username).toBe('CrashLab');
  });
});

describe('createRunEventEmbed', () => {
  it('creates correct embed for started event', () => {
    const embed = createRunEventEmbed('started', 'run-123');

    expect(embed.title).toContain('STARTED');
    expect(embed.description).toContain('run-123');
    expect(embed.color).toBe(0x36a64f); // green
    expect(embed.fields).toHaveLength(2);
    expect(embed.fields?.[0].name).toBe('Run ID');
    expect(embed.fields?.[0].value).toBe('run-123');
  });

  it('creates correct embed for failed event', () => {
    const embed = createRunEventEmbed('failed', 'run-456');

    expect(embed.title).toContain('FAILED');
    expect(embed.color).toBe(0xff0000); // red
  });

  it('includes additional details in fields', () => {
    const embed = createRunEventEmbed('completed', 'run-789', {
      duration: '5m 30s',
      signature: 'SIGSEGV',
    });

    expect(embed.fields).toHaveLength(4); // Run ID, Event, duration, signature
    expect(embed.fields?.some((f) => f.name === 'duration')).toBe(true);
    expect(embed.fields?.some((f) => f.name === 'signature')).toBe(true);
  });
});

describe('createCriticalAlertEmbed', () => {
  it('creates critical alert embed with correct formatting', () => {
    const embed = createCriticalAlertEmbed('Memory Leak', 'High memory usage detected');

    expect(embed.title).toContain('CRITICAL ALERT');
    expect(embed.title).toContain('Memory Leak');
    expect(embed.description).toBe('High memory usage detected');
    expect(embed.color).toBe(0xff0000); // red
  });

  it('includes metadata as fields', () => {
    const embed = createCriticalAlertEmbed('Alert', 'Message', {
      severity: 'high',
      component: 'fuzzer',
    });

    expect(embed.fields).toHaveLength(2);
    expect(embed.fields?.[0].name).toBe('severity');
    expect(embed.fields?.[0].value).toBe('high');
  });
});

describe('createSimpleMessage', () => {
  it('creates message with content', () => {
    const message = createSimpleMessage('Hello, World!');

    expect(message.content).toBe('Hello, World!');
  });
});
