import { describe, it, expect } from 'vitest';
import {
  encodeFilterState,
  decodeFilterState,
  buildFilterStateUrl,
  extractFilterStateFromUrl,
  mergeFiltersWithDefaults,
} from './url-state-codec';

describe('URL State Codec', () => {
  it('should encode and decode filter state', () => {
    const filters = {
      status: 'failed',
      network: 'soroban',
      limit: 50,
    };

    const encoded = encodeFilterState(filters);
    expect(encoded).toMatch(/^fv/);

    const decoded = decodeFilterState(encoded);
    expect(decoded).toEqual(filters);
  });

  it('should handle complex nested filter state', () => {
    const filters = {
      search: 'contract deploy',
      tags: ['production', 'critical'],
      metadata: { version: '1.0', release: true },
    };

    const encoded = encodeFilterState(filters);
    const decoded = decodeFilterState(encoded);

    expect(decoded).toEqual(filters);
  });

  it('should return null for invalid encoded state', () => {
    expect(decodeFilterState('invalid')).toBeNull();
    expect(decodeFilterState('')).toBeNull();
    expect(decodeFilterState('notavalidb64==')).toBeNull();
  });

  it('should build filter state URLs', () => {
    const filters = { status: 'failed' };
    const url = buildFilterStateUrl('/dashboard', filters);

    expect(url).toContain('/dashboard?state=');
    expect(url).toMatch(/state=fv/);
  });

  it('should append state to existing query parameters', () => {
    const filters = { status: 'failed' };
    const url = buildFilterStateUrl('/dashboard?tab=overview', filters);

    expect(url).toContain('tab=overview');
    expect(url).toContain('&state=');
  });

  it('should extract filter state from URL', () => {
    const filters = { status: 'failed', network: 'soroban' };
    const encoded = encodeFilterState(filters);
    const url = `http://localhost/dashboard?state=${encodeURIComponent(encoded)}`;

    const extracted = extractFilterStateFromUrl(url);
    expect(extracted).toEqual(filters);
  });

  it('should return null when state param missing', () => {
    const extracted = extractFilterStateFromUrl('http://localhost/dashboard?tab=overview');
    expect(extracted).toBeNull();
  });

  it('should merge partial filters with defaults', () => {
    const defaults = {
      status: 'all',
      network: 'soroban',
      limit: 25,
    };

    const partial = {
      status: 'failed',
      limit: 50,
    };

    const merged = mergeFiltersWithDefaults(defaults, partial);

    expect(merged.status).toBe('failed');
    expect(merged.network).toBe('soroban');
    expect(merged.limit).toBe(50);
  });

  it('should ignore keys not in defaults', () => {
    const defaults = { status: 'all' };
    const partial = { status: 'failed', unknown: 'value' };

    const merged = mergeFiltersWithDefaults(defaults, partial);

    expect(merged).toEqual({ status: 'failed' });
    expect('unknown' in merged).toBe(false);
  });
});
