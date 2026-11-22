/**
 * search-input-controller.ts
 *
 * IME-safe, debounced search scheduling for the shared search input
 * component (Issue #1357).
 *
 * Problem
 * ───────
 * The debounced search handler previously fired on every `input`/`change`
 * event, including while an IME composition (CJK, diacritics panels, mobile
 * handwriting keyboards) was still active.  Composing multi-byte queries
 * produced a storm of intermediate searches for romaji/pinyin fragments —
 * flickering wrong results and wasted requests.
 *
 * Solution
 * ────────
 * A small, React-free state machine that owns the debounce instance:
 *
 * 1. `handleCompositionStart()` marks composition as active and cancels any
 *    pending debounce timer, so a pre-composition value cannot fire mid-
 *    composition.
 * 2. `handleInput()` forwards every value but only schedules a debounced
 *    search when composition is NOT active.  Intermediate composition text is
 *    therefore never searched.
 * 3. `handleCompositionEnd(value)` treats the final composed value as the
 *    authoritative value and schedules exactly ONE trailing debounced search.
 *    A companion `input`/`change` event that some browsers fire right after
 *    `compositionend` is collapsed by the shared debounce and de-duplicated so
 *    the handler never fires twice for the same value.
 *
 * Latin-only typing behaviour is unchanged: every non-composing input value is
 * debounced exactly as before.  Debounce delay/`maxWait` defaults come from
 * {@link SEARCH_DEBOUNCE_DEFAULTS} and are not modified here.
 */

import {
  debounce,
  SEARCH_DEBOUNCE_DEFAULTS,
} from '../lib/debounce-utils';

export interface SearchInputControllerOptions {
  /** Trailing debounce delay in ms. Default: {@link SEARCH_DEBOUNCE_DEFAULTS.delay}. */
  delay?: number;
  /**
   * Hard upper bound (ms) for how long a burst may run before the search must
   * fire. Default: {@link SEARCH_DEBOUNCE_DEFAULTS.maxWait}.
   */
  maxWait?: number;
}

/**
 * Lifecycle of one IME-safe debounced search schedule.
 */
export interface SearchInputController {
  /**
   * Feed a new input/change value. Schedules a trailing debounced search
   * unless an IME composition is currently active.
   */
  handleInput(value: string): void;

  /**
   * Mark an IME composition as started and cancel any pending debounce so an
   * intermediate value cannot produce a search while composing.
   */
  handleCompositionStart(): void;

  /**
   * Mark the composition as finished and schedule exactly one trailing search
   * for the authoritative final composed `value`.
   */
  handleCompositionEnd(value: string): void;

  /**
   * Replace the onSearch callback (used when a parent re-renders a search
   * input with a fresh closure). Cheap — does not reset pending timers.
   */
  setOnSearch(onSearch: (value: string) => void): void;

  /** Cancel any pending search and release timers. */
  dispose(): void;
}

/**
 * Create a search-scheduling controller wired to the shared (React-free)
 * debounce helper.
 *
 * @param onSearch  Called with the settled search value.
 * @param options   Debounce tuning; defaults to
 *                  {@link SEARCH_DEBOUNCE_DEFAULTS}.
 */
export function createSearchInputController(
  onSearch: (value: string) => void,
  options: SearchInputControllerOptions = {},
): SearchInputController {
  let composing = false;
  let lastScheduledSearch: string | null = null;
  let currentOnSearch = onSearch;

  const debouncedSearch = debounce(
    (value: string) => currentOnSearch(value),
    {
      delay: options.delay ?? SEARCH_DEBOUNCE_DEFAULTS.delay,
      maxWait: options.maxWait ?? SEARCH_DEBOUNCE_DEFAULTS.maxWait,
    },
  );

  const cancelPendingSearch = (): void => {
    lastScheduledSearch = null;
    debouncedSearch.cancel();
  };

  const scheduleSearch = (value: string): void => {
    // Drop identical re-schedules: browsers frequently fire a companion
    // input/change event right after compositionend with the same value,
    // which must not produce a second search.
    if (lastScheduledSearch === value) return;
    lastScheduledSearch = value;
    debouncedSearch(value);
  };

  return {
    handleInput(value: string): void {
      if (composing) return;
      scheduleSearch(value);
    },

    handleCompositionStart(): void {
      composing = true;
      // A pending pre-composition timer must not produce an intermediate
      // search while composition is in flight.
      cancelPendingSearch();
    },

    handleCompositionEnd(value: string): void {
      composing = false;
      scheduleSearch(value);
    },

    setOnSearch(next: (value: string) => void): void {
      currentOnSearch = next;
    },

    dispose(): void {
      cancelPendingSearch();
    },
  };
}