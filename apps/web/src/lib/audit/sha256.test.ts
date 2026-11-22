import { describe, expect, it } from 'vitest';
import { sha256Hex } from './sha256';

describe('browser-safe sha256', () => {
  it('matches Node crypto digests for UTF-8 input', async () => {
    const { createHash } = await import('node:crypto');
    const inputs = ['', 'abc', 'audit ✓ 🚀', 'x'.repeat(1000)];

    for (const input of inputs) {
      expect(sha256Hex(input)).toBe(createHash('sha256').update(input, 'utf8').digest('hex'));
    }
  });
});
