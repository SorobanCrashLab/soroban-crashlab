import { describe, expect, it } from 'vitest';
import { redactSecrets, redactSnapshot } from './redaction';
import type { EntitySnapshot } from './types';

describe('secret redaction', () => {
  it('redacts bearer tokens, API keys and secret-key patterns', () => {
    const input = [
      'Authorization: Bearer abcdef1234567890',
      'api_key=sk-live-abcdefghijklmnopqrst',
      'GITHUB_TOKEN: ghp_abcdefghijklmnopqrstuvwxyz',
    ].join('\n');
    const output = redactSecrets(input);
    expect(output).not.toContain('abcdef1234567890');
    expect(output).not.toContain('sk-live-abcdefghijklmnopqrst');
    expect(output).toContain('[REDACTED]');
  });

  it('redacts credentials in URLs and private key blocks', () => {
    expect(redactSecrets('https://example.com/runs?token=abc123&page=2')).toContain('token=[REDACTED]');
    const pem = '-----BEGIN PRIVATE KEY-----\nZXample\n-----END PRIVATE KEY-----';
    expect(redactSecrets(pem)).toBe('[REDACTED PRIVATE KEY]');
  });

  it('redacts Stellar secret seeds without touching public keys', () => {
    const seed = `S${'A'.repeat(55)}`;
    expect(redactSecrets(`seed=${seed}`)).toContain('[REDACTED]');
    expect(redactSecrets('GABCDEFG')).toBe('GABCDEFG');
  });

  it('redacts nested snapshot fields', () => {
    const snapshot: EntitySnapshot = {
      id: 'run-1',
      type: 'run',
      title: 'token=abc123 run',
      status: 'failed',
      timestamp: '2026-01-01T00:00:00Z',
      sourceUrl: '/runs/run-1',
      summary: 'Bearer abcdef1234567890',
      fields: { command: 'api_key=sk-abcdefghijklmnopqrst', count: 3 },
    };
    const redacted = redactSnapshot(snapshot);
    expect(redacted.title).toContain('[REDACTED]');
    expect(redacted.summary).not.toContain('abcdef1234567890');
    expect(redacted.fields?.command).toContain('[REDACTED]');
    expect(redacted.fields?.count).toBe(3);
  });
});
