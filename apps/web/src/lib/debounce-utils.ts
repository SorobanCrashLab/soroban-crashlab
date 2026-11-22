/**
 * debounce-utils.ts
 *
 * Pure (non-React) debounce helpers for the SorobanCrashLab web app.
 *
 * Problem (Issue #1086)
 * ─────────────────────
 * The previous hard-coded 300 ms debounce was calibrated for fast, low-latency
 * connections.  On slow or high-latency networks (2G, satellite, congested WiFi)
 * the search handler fires before the previous request has even resolved, causing
 * request pile-ups, stale results being displayed out of order, and visible UI
 * flicker.  A 300 ms delay is also short enough that users on slow keyboards or
 * with accessibility needs do not get a chance to finish typing.
 *
 * Solution
 * ────────
 * 1. Raise the *default* delay to 500 ms so that most keystrokes are batched
 *    into a single request on normal connections while giving slow connections
 *    (RTT ≥ 100 ms) sufficient headroom.
 * 2. Introduce a `maxWait` option.  Without it, a user who types slowly but
 *    continuously (one keystroke every 490 ms) would never trigger the handler.
 *    `maxWait` enforces a hard upper bound — the handler always fires within
 *    `maxWait` ms of the *first* changed keystroke, regardless of how often the
 *    value keeps changing.
 * 3. Keep the implementation as a pure (React-free) utility so it can be tested
 *    without jsdom or timer mocks specific to a component framework.
 */

export interface DebounceOptions {
  /**
   * How long (ms) to wait after the last value change before settling.
   * Default: 500 ms.
   */
  delay?: number;
  /**
   * Hard upper bound (ms) from the *first* change until the handler must fire,
   * even if the value is still changing.  When omitted, no upper bound is
   * applied (pure trailing debounce).
   *
   * Recommended on slow-network paths: set to roughly 2–3× `delay` so users
   * always see an update within a reasonable wall-clock window.
   */
  maxWait?: number;
}

/**
 * Recommended defaults for search inputs on potentially slow connections.
 * Callers may override either value; these are intentionally conservative.
 */
export const SEARCH_DEBOUNCE_DEFAULTS: Required<DebounceOptions> = {
  delay: 500,
  maxWait: 1500,
};

/**
 * Returns a debounced version of `fn` that delays invocation until `delay` ms
 * have elapsed since the last call.  If `maxWait` is provided the function is
 * guaranteed to fire at least once every `maxWait` ms when called continuously.
 *
 * This is a plain-JS implementation that works in any environment (Node, browser,
 * edge runtime) without depending on React or testing infrastructure.
 *
 * @param fn     The function to debounce.
 * @param opts   {@link DebounceOptions}
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  opts: DebounceOptions = {},
): { (...args: Args): void; cancel(): void; flush(...args: Args): void } {
  const delay = opts.delay ?? SEARCH_DEBOUNCE_DEFAULTS.delay;
  const maxWait = opts.maxWait;

  let trailingTimer: ReturnType<typeof setTimeout> | null = null;
  let leadingTimer: ReturnType<typeof setTimeout> | null = null;
  let firstCallAt: number | null = null;

  function cancel(): void {
    if (trailingTimer !== null) {
      clearTimeout(trailingTimer);
      trailingTimer = null;
    }
    if (leadingTimer !== null) {
      clearTimeout(leadingTimer);
      leadingTimer = null;
    }
    firstCallAt = null;
  }

  function flush(...args: Args): void {
    cancel();
    fn(...args);
  }

  function debounced(...args: Args): void {
    const now = Date.now();

    // Schedule (or reschedule) the trailing call
    if (trailingTimer !== null) clearTimeout(trailingTimer);
    trailingTimer = setTimeout(() => {
      trailingTimer = null;
      if (leadingTimer !== null) {
        clearTimeout(leadingTimer);
        leadingTimer = null;
      }
      firstCallAt = null;
      fn(...args);
    }, delay);

    // maxWait guard: ensure the handler fires within maxWait ms of the first call
    if (maxWait !== undefined) {
      if (firstCallAt === null) {
        firstCallAt = now;
        leadingTimer = setTimeout(() => {
          leadingTimer = null;
          if (trailingTimer !== null) {
            clearTimeout(trailingTimer);
            trailingTimer = null;
          }
          firstCallAt = null;
          fn(...args);
        }, maxWait);
      }
    }
  }

  debounced.cancel = cancel;
  debounced.flush = flush;

  return debounced;
}

/**
 * Clamps `value` to the inclusive range `[min, max]`.
 * Used to validate caller-supplied debounce delays.
 *
 * @example
 * clampDelay(50, 100, 2000)   // → 100  (below min)
 * clampDelay(500, 100, 2000)  // → 500  (in range)
 * clampDelay(9000, 100, 2000) // → 2000 (above max)
 */
export function clampDelay(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Returns a validated debounce delay for a search input.
 *
 * - Values below `MIN_SEARCH_DELAY` are silently raised to the minimum.
 * - Values above `MAX_SEARCH_DELAY` are silently lowered to the maximum.
 * - Non-finite or non-number values fall back to `SEARCH_DEBOUNCE_DEFAULTS.delay`.
 *
 * @param rawDelay  Caller-supplied delay (ms), possibly from user config.
 */
export const MIN_SEARCH_DELAY = 100;
export const MAX_SEARCH_DELAY = 3000;

export function resolveSearchDelay(rawDelay: unknown): number {
  if (typeof rawDelay !== 'number' || !Number.isFinite(rawDelay)) {
    return SEARCH_DEBOUNCE_DEFAULTS.delay;
  }
  return clampDelay(rawDelay, MIN_SEARCH_DELAY, MAX_SEARCH_DELAY);
}
