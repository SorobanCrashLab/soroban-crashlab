import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyGitHubWebhookSignature, getGitHubWebhookSecret } from './github-webhook-verify';

describe('GitHub webhook signature verification', () => {
  const secret = 'test-webhook-secret';
  const payload = '{"action":"opened","pull_request":{"id":1}}';

  it('verifies valid GitHub webhook signatures', () => {
    const hmac = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    const signature = `sha256=${hmac}`;

    expect(verifyGitHubWebhookSignature(payload, signature, secret)).toBe(true);
  });

  it('rejects invalid signatures', () => {
    const signature = 'sha256=invalid0000000000000000000000000000000000000000000000000000';
    expect(verifyGitHubWebhookSignature(payload, signature, secret)).toBe(false);
  });

  it('rejects malformed signatures', () => {
    expect(verifyGitHubWebhookSignature(payload, 'invalid-format', secret)).toBe(false);
    expect(verifyGitHubWebhookSignature(payload, '', secret)).toBe(false);
  });

  it('rejects signatures with wrong secret', () => {
    const hmac = createHmac('sha256', 'wrong-secret')
      .update(payload)
      .digest('hex');
    const signature = `sha256=${hmac}`;

    expect(verifyGitHubWebhookSignature(payload, signature, secret)).toBe(false);
  });

  it('handles Buffer payloads', () => {
    const bufferPayload = Buffer.from(payload);
    const hmac = createHmac('sha256', secret)
      .update(bufferPayload)
      .digest('hex');
    const signature = `sha256=${hmac}`;

    expect(verifyGitHubWebhookSignature(bufferPayload, signature, secret)).toBe(true);
  });

  it('throws when GITHUB_WEBHOOK_SECRET is not set', () => {
    expect(() => {
      getGitHubWebhookSecret({});
    }).toThrow('GITHUB_WEBHOOK_SECRET environment variable is not set');
  });

  it('returns secret when GITHUB_WEBHOOK_SECRET is set', () => {
    const testSecret = 'my-test-secret';
    expect(getGitHubWebhookSecret({ GITHUB_WEBHOOK_SECRET: testSecret })).toBe(testSecret);
  });
});
