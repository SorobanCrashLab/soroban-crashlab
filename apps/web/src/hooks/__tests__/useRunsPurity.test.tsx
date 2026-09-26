/**
 * Render-purity tests for the useRuns module-global cache (issue #1611).
 *
 * `useRuns` keeps a module-level cache. Reading it during render while also
 * reading `Date.now()` made the render impure: under React 19 concurrent
 * rendering the same tree could produce different stale-vs-fresh decisions on
 * different attempts, and the result was papered over with an inline
 * `react-hooks/purity` suppression.
 *
 * These tests render the hook twice through `react-dom/server` — no DOM and no
 * effects, which is exactly the render phase we care about — and assert that
 * the cache-derived decision is identical both times, including after the
 * clock moves past `cacheTime`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useRef } from 'react';
import { renderToString } from 'react-dom/server';
import { useRuns, clearRunsCache } from '../useRuns';
import type { FuzzingRun } from '../../app/types';

const FAKE_NOW = 1_700_000_000_000;
const CACHE_TIME = 5 * 60_000;
const STALE_TIME = 30_000;

function makeRun(id: string): FuzzingRun {
  return { id } as unknown as FuzzingRun;
}

/** Surfaces the cache-derived render decision as comparable markup. */
function Probe() {
  const { runs, total, dataState } = useRuns({
    autoFetch: false,
    cacheTime: CACHE_TIME,
    staleTime: STALE_TIME,
  });
  // A single interpolated child keeps this one text node, so the markup has no
  // `<!-- -->` separators to normalize away before comparing.
  const summary = `${dataState}|${total}|${runs.map((r) => r.id).join(',')}`;
  return <span data-testid="probe">{summary}</span>;
}

function renderProbe(): string {
  return renderToString(<Probe />);
}

/**
 * Seeds the module cache through the hook's public `mutate` path.
 *
 * `mutate` writes the module cache synchronously, so a single render is enough.
 * The null-checked ref is the render-phase-update pattern the lint rules
 * sanction, and it keeps this to one pass.
 */
function seedCache(runs: FuzzingRun[]): void {
  function Seed() {
    const { mutate } = useRuns({ autoFetch: false });
    const seeded = useRef<boolean | null>(null);
    if (seeded.current == null) {
      seeded.current = true;
      mutate(runs);
    }
    return <span />;
  }
  renderToString(<Seed />);
}

describe('useRuns render purity', () => {
  beforeEach(() => {
    clearRunsCache();
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    clearRunsCache();
  });

  it('reads no clock during render', () => {
    seedCache([makeRun('a')]);
    const spy = vi.spyOn(Date, 'now');
    try {
      renderProbe();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('produces an identical cache decision across two renders', () => {
    seedCache([makeRun('a'), makeRun('b')]);
    const first = renderProbe();
    const second = renderProbe();
    expect(first).toBe(second);
    expect(first).toContain('success');
    expect(first).toContain('a,b');
  });

  it('keeps the same decision when the clock advances past cacheTime', () => {
    seedCache([makeRun('a')]);
    const first = renderProbe();

    // Well past cacheTime. A render-time freshness check would drop the cached
    // entry here and fall back to an empty/loading render; a pure render keeps
    // the snapshotted decision identical.
    vi.setSystemTime(FAKE_NOW + CACHE_TIME * 10);

    const second = renderProbe();
    expect(second).toBe(first);
  });

  it('keeps the same decision when the clock moves backwards', () => {
    seedCache([makeRun('a')]);
    const first = renderProbe();
    vi.setSystemTime(FAKE_NOW - CACHE_TIME * 10);
    expect(renderProbe()).toBe(first);
  });

  it('renders identically across many renders with a moving clock', () => {
    seedCache([makeRun('a'), makeRun('b')]);
    const first = renderProbe();
    for (const offset of [0, 1_000, STALE_TIME, CACHE_TIME, CACHE_TIME * 100]) {
      vi.setSystemTime(FAKE_NOW + offset);
      expect(renderProbe()).toBe(first);
    }
  });

  it('does not mutate the module cache during render', () => {
    seedCache([makeRun('a')]);
    const before = renderProbe();
    // Repeated renders must not be able to clear or rewrite the entry, which
    // would make the next mount see a different cache.
    for (let i = 0; i < 5; i += 1) {
      vi.setSystemTime(FAKE_NOW + i * 60_000);
      renderProbe();
    }
    const after = renderProbe();
    expect(after).toBe(before);
  });

  it('still prefers explicit initialData over the cache', () => {
    seedCache([makeRun('cached')]);
    function InitialProbe() {
      const { runs, dataState } = useRuns({
        autoFetch: false,
        initialData: [makeRun('initial')],
      });
      return <span>{dataState}|{runs.map((r) => r.id).join(',')}</span>;
    }
    const out = renderToString(<InitialProbe />);
    expect(out).toContain('initial');
    expect(out).not.toContain('cached');
  });

  it('renders a clean loading state when the cache is empty', () => {
    const out = renderProbe();
    expect(out).toContain('loading');
    expect(out).toContain('|0|');
  });
});
