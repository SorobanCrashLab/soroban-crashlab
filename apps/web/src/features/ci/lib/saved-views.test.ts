import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW_STATE,
  buildShareUrl,
  deserializeViewState,
  serializeViewState,
  viewStateFromSearchParams,
  viewStateToQuery,
} from './saved-views';
import type { ViewState } from './saved-views';

const full: ViewState = {
  version: 1,
  view: 'release',
  q: 'checkout timeout',
  branch: 'main',
  pr: 2314,
  sha: 'a'.repeat(40),
  gate: 'e2e',
  status: 'fail',
  onlyFailures: true,
  selectedRunId: 'gh-run-9001',
};

describe('saved view serialization', () => {
  it('round-trips a full state', () => {
    const token = serializeViewState(full);
    expect(token.startsWith('ci1.')).toBe(true);
    expect(deserializeViewState(token)).toEqual(full);
  });

  it('is canonical regardless of key insertion order and drops empty values', () => {
    const reordered = {
      selectedRunId: 'gh-run-9001',
      onlyFailures: true,
      status: 'fail',
      gate: 'e2e',
      sha: 'a'.repeat(40),
      pr: 2314,
      branch: 'main',
      q: 'checkout timeout',
      view: 'release',
      version: 1,
    } as ViewState;
    expect(serializeViewState(reordered)).toBe(serializeViewState(full));
    expect(serializeViewState({ version: 1, view: 'pr', q: '', onlyFailures: false })).toBe(
      serializeViewState(DEFAULT_VIEW_STATE),
    );
  });

  it('rejects malformed or unsupported tokens without throwing', () => {
    expect(deserializeViewState(null)).toBeNull();
    expect(deserializeViewState('nope')).toBeNull();
    expect(deserializeViewState('ci1.not-json')).toBeNull();
    expect(deserializeViewState(`ci1.${encodeURIComponent(JSON.stringify({ version: 9, view: 'pr' }))}`)).toBeNull();
    expect(deserializeViewState(`ci1.${encodeURIComponent(JSON.stringify({ version: 1, view: 'unknown' }))}`)).toBeNull();
  });

  it('builds and reads a shareable URL', () => {
    const url = buildShareUrl('https://example.test/quality/ci?view=pr', full);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/quality/ci');
    expect(viewStateFromSearchParams(parsed.searchParams)).toEqual(full);
    expect(viewStateFromSearchParams({ state: serializeViewState(DEFAULT_VIEW_STATE) })).toEqual(
      DEFAULT_VIEW_STATE,
    );
  });

  it('maps a saved view to an API query', () => {
    expect(viewStateToQuery(full)).toMatchObject({
      view: 'release',
      branch: 'main',
      pr: 2314,
      gate: 'e2e',
      status: 'fail',
      limit: 100,
    });
  });
});
