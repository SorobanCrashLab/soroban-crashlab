import { describe, it, expect } from 'vitest';
import { computeETag } from './fixture-caching';

describe('computeETag', () => {
  it('returns a quoted hex hash', () => {
    const etag = computeETag('{"data":"hello"}');
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
  });

  it('is deterministic for the same input', () => {
    const a = computeETag('{"x":1}');
    const b = computeETag('{"x":1}');
    expect(a).toBe(b);
  });

  it('differs for different inputs', () => {
    const a = computeETag('{"x":1}');
    const b = computeETag('{"x":2}');
    expect(a).not.toBe(b);
  });
});
