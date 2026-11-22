import { useEffect, useRef, useState } from 'react';
import { SEARCH_DEBOUNCE_DEFAULTS, type DebounceOptions } from './debounce-utils';

/**
 * Debounce a value to prevent rapid updates on every keystroke.
 *
 * **Issue #1086 — Slow-network fix**
 * The previous implementation used a hard-coded 300 ms delay, which is too
 * short for slow or high-latency connections: the search handler fired before
 * the previous request resolved, causing request pile-ups and stale results.
 *
 * Changes:
 * - Default `delay` raised from 300 ms → 500 ms.
 * - Added `maxWait` option (default 1500 ms): guarantees the debounced value
 *   is emitted at least once every `maxWait` ms, even if the user types
 *   continuously.  Without this, a slow typist could prevent the search from
 *   ever firing.
 *
 * @param value   The value to debounce (typically the search string).
 * @param delay   Trailing delay in ms.  Default: {@link SEARCH_DEBOUNCE_DEFAULTS.delay}.
 * @param options Additional options ({@link DebounceOptions}).
 * @returns       The debounced value — updated `delay` ms after the last change,
 *                or at most `maxWait` ms after the first change in a burst.
 *
 * @example
 * ```tsx
 * const [search, setSearch] = useState('');
 * const debouncedSearch = useDebounce(search);  // 500 ms default
 *
 * useEffect(() => {
 *   performSearch(debouncedSearch);
 * }, [debouncedSearch]);
 * ```
 *
 * @example With explicit options for a very slow connection:
 * ```tsx
 * const debouncedSearch = useDebounce(search, 800, { maxWait: 2000 });
 * ```
 */
export function useDebounce<T>(
  value: T,
  delay: number = SEARCH_DEBOUNCE_DEFAULTS.delay,
  options: Pick<DebounceOptions, 'maxWait'> = { maxWait: SEARCH_DEBOUNCE_DEFAULTS.maxWait },
): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const maxWait = options.maxWait;

  // Track the timestamp of the most recent value change for maxWait enforcement
  const firstChangeRef = useRef<number | null>(null);
  const maxWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Trailing timer: fire `delay` ms after the last change
    const trailingTimer = setTimeout(() => {
      // Cancel any pending maxWait timer because trailing fired first
      if (maxWaitTimerRef.current !== null) {
        clearTimeout(maxWaitTimerRef.current);
        maxWaitTimerRef.current = null;
      }
      firstChangeRef.current = null;
      setDebouncedValue(value);
    }, delay);

    // maxWait guard: if this is the first change in a new burst, schedule the
    // hard deadline.  We capture `value` in the closure so the maxWait flush
    // uses the value that was current when the burst started — the trailing
    // timer will update to the final value once the burst ends.
    if (maxWait !== undefined) {
      if (firstChangeRef.current === null) {
        firstChangeRef.current = Date.now();
        maxWaitTimerRef.current = setTimeout(() => {
          maxWaitTimerRef.current = null;
          firstChangeRef.current = null;
          setDebouncedValue(value);
        }, maxWait);
      }
    }

    return () => {
      clearTimeout(trailingTimer);
      // Do NOT clear maxWaitTimerRef here — it should survive individual
      // trailing-timer resets so that it still fires at the hard deadline.
    };
  }, [value, delay, maxWait]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (maxWaitTimerRef.current !== null) {
        clearTimeout(maxWaitTimerRef.current);
      }
    };
  }, []);

  return debouncedValue;
}
