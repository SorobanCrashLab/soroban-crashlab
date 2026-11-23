import { describe, expect, it } from 'vitest';
import { assessFreshness, ciCacheControl, retryAfterMs } from './freshness';

const NOW = Date.parse('2026-11-23T12:00:00.000Z');

describe('assessFreshness', () => {
  it('classifies fresh, stale and expired data', () => {
    const generated = new Date(NOW - 10_000).toISOString();
    expect(assessFreshness(generated, NOW, 30_000, 300_000).state).toBe('fresh');
    const stale = assessFreshness(new Date(NOW - 60_000).toISOString(), NOW, 30_000, 300_000);
    expect(stale.state).toBe('stale');
    expect(stale.ageMs).toBe(60_000);
    expect(assessFreshness(new Date(NOW - 400_000).toISOString(), NOW, 30_000, 300_000).state).toBe('expired');
  });

  it('treats invalid and future timestamps as expired', () => {
    expect(assessFreshness('not-a-date', NOW).state).toBe('expired');
    expect(assessFreshness(undefined, NOW).state).toBe('expired');
    expect(assessFreshness(new Date(NOW + 10 * 60_000).toISOString(), NOW).state).toBe('expired');
  });
});

describe('ciCacheControl', () => {
  it('emits private caching with SWR seconds', () => {
    expect(ciCacheControl(30, 300)).toBe('private, max-age=30, stale-while-revalidate=300');
  });
});

describe('retryAfterMs', () => {
  it('parses seconds, HTTP dates and missing headers', () => {
    expect(retryAfterMs('12', NOW)).toBe(12_000);
    expect(retryAfterMs(new Date(NOW + 5_000).toUTCString(), NOW)).toBe(5_000);
    expect(retryAfterMs(null, NOW)).toBe(0);
    expect(retryAfterMs('999999', NOW, 60_000)).toBe(60_000);
  });
});
