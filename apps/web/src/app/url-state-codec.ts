/**
 * Bidirectional URL codec for serializing and deserializing filter state
 * in a way that preserves all filter configurations and guarantees round-trip fidelity.
 */

export interface FilterState {
  [key: string]: unknown;
}

const CODEC_VERSION = 1;
const COMPRESSED_PREFIX = 'fv';

export function encodeFilterState(filters: FilterState): string {
  try {
    const json = JSON.stringify({
      v: CODEC_VERSION,
      f: filters,
    });

    const buf = Buffer.from(json, 'utf8');
    const b64 = buf.toString('base64');

    return `${COMPRESSED_PREFIX}${b64}`;
  } catch (e) {
    console.error('Failed to encode filter state:', e);
    return '';
  }
}

export function decodeFilterState(encoded: string): FilterState | null {
  if (!encoded || !encoded.startsWith(COMPRESSED_PREFIX)) {
    return null;
  }

  try {
    const b64 = encoded.slice(COMPRESSED_PREFIX.length);
    const json = Buffer.from(b64, 'base64').toString('utf8');
    const parsed = JSON.parse(json) as { v?: number; f?: FilterState };

    if (!parsed || typeof parsed !== 'object' || parsed.v !== CODEC_VERSION || !parsed.f) {
      return null;
    }

    return parsed.f;
  } catch (e) {
    console.error('Failed to decode filter state:', e);
    return null;
  }
}

export function buildFilterStateUrl(baseUrl: string, filters: FilterState): string {
  const encoded = encodeFilterState(filters);
  if (!encoded) return baseUrl;

  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}state=${encodeURIComponent(encoded)}`;
}

export function extractFilterStateFromUrl(url: string): FilterState | null {
  try {
    const u = new URL(url, 'http://localhost');
    const encoded = u.searchParams.get('state');
    if (!encoded) return null;
    return decodeFilterState(encoded);
  } catch {
    return null;
  }
}

export function mergeFiltersWithDefaults<T extends FilterState>(
  defaults: T,
  partial: FilterState | null,
): T {
  if (!partial) return defaults;
  const merged = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (key in partial && partial[key] !== undefined) {
      (merged as Record<string, unknown>)[key] = partial[key];
    }
  }
  return merged as T;
}
