import { describe, expect, it } from 'vitest';
import { containsSensitiveContent, redactArtifactText, redactText, redactValue } from './redaction';

describe('runtime secret redaction', () => {
  it('redacts known secret fields and token-shaped text in nested values', () => {
    const scrubbed = redactValue({
      rpc: { apiKey: 'private-value', message: `Authorization: Bearer ${'z'.repeat(20)}` },
    });
    expect(scrubbed).toEqual({
      rpc: { apiKey: '[REDACTED]', message: 'Authorization: Bearer [REDACTED]' },
    });
  });

  it('keeps JSON valid while scrubbing artifact values', () => {
    const scrubbed = redactArtifactText('{"webhookKey":"sensitive","state":"ready"}');
    expect(JSON.parse(scrubbed)).toEqual({
      webhookKey: '[REDACTED]',
      state: 'ready',
    });
  });

  it('detects and redacts inline credentials in logs', () => {
    const value = `api_key=${'z'.repeat(20)}`;
    expect(containsSensitiveContent(value)).toBe(true);
    expect(redactText(value)).toBe('api_key=[REDACTED]');
  });
});
