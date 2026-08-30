'use client';

import { useEffect, useRef, type ChangeEvent, type CompositionEvent, type InputHTMLAttributes, type Ref } from 'react';
import { createSearchInputController, type SearchInputController } from './search-input-controller';

/**
 * Shared, IME-safe debounced search input (Issue #1357).
 *
 * The input stays fully controlled and forwards every native change event to
 * `onChange` so existing controlled/uncontrolled and accessibility behaviour is
 * preserved. Search *firing* is deferred to `onSearch`, which is debounced and
 * additionally gated behind IME composition:
 *
 * - While a composition is active (`compositionstart` → `compositionend`) no
 *   search fires for intermediate romaji/pinyin fragments.
 * - When the composition ends, exactly one trailing search fires for the final
 *   composed value.
 * - Latin-only typing uses the existing debounce behaviour unchanged.
 *
 * Debounce timing defaults come from `SEARCH_DEBOUNCE_DEFAULTS`; callers may
 * override them through `debounceDelay` / `debounceMaxWait`.
 *
 * @example
 * ```tsx
 * const [query, setQuery] = useState('');
 * <SearchInput
 *   value={query}
 *   onChange={(e) => setQuery(e.target.value)}
 *   onSearch={performSearch}
 *   debounceDelay={300}
 *   aria-label="Search runs"
 * />
 * ```
 */
export interface SearchInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    | 'onChange'
    | 'value'
    | 'defaultValue'
    | 'onCompositionStart'
    | 'onCompositionEnd'
    | 'ref'
  > {
  /** Controlled input value. Updated through `onChange` as usual. */
  value: string;
  /** Native change handler — keeps the parent's controlled state in sync. */
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Debounced search callback; deferred during IME composition. */
  onSearch: (value: string) => void;
  /** Trailing debounce delay in ms. Default: `SEARCH_DEBOUNCE_DEFAULTS.delay`. */
  debounceDelay?: number;
  /**
   * Hard upper bound (ms) for a continuous typing burst.
   * Default: `SEARCH_DEBOUNCE_DEFAULTS.maxWait`.
   */
  debounceMaxWait?: number;
  /** Forwarded to the underlying `<input>`. */
  ref?: Ref<HTMLInputElement>;
}

/**
 * IME-safe debounced search input. See {@link SearchInputProps} and the module
 * documentation for the composition gating semantics.
 */
export function SearchInput({
  value,
  onChange,
  onSearch,
  debounceDelay,
  debounceMaxWait,
  ref,
  type = 'search',
  ...inputProps
}: SearchInputProps) {
  const controllerRef = useRef<SearchInputController | null>(null);

  // Keep the latest onSearch reachable from a stable controller instance so
  // fresh closures (parent re-renders) never go stale while pending timers do
  // not get cancelled on every keystroke-induced re-render.
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  // Create the controller once; only recreate it when the caller tunes the
  // debounce timing (rare). The relevant debounce delay/maxWait values are
  // unchanged defaults from debounce-utils.
  useEffect(() => {
    const controller = createSearchInputController(
      (nextValue: string) => onSearchRef.current(nextValue),
      { delay: debounceDelay, maxWait: debounceMaxWait },
    );
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
    // Timing options are intentionally the only dependencies: the controller
    // reads onSearch through the ref above so a new onSearch closure does not
    // tear down pending debounce work.
  }, [debounceDelay, debounceMaxWait]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    // Preserve native controlled-input behaviour: the parent always sees the
    // current value, including intermediate IME composition text.
    onChange(event);
    controllerRef.current?.handleInput(event.target.value);
  };

  const handleCompositionStart = (): void => {
    controllerRef.current?.handleCompositionStart();
  };

  const handleCompositionEnd = (event: CompositionEvent<HTMLInputElement>): void => {
    controllerRef.current?.handleCompositionEnd(event.currentTarget.value);
  };

  return (
    <input
      {...inputProps}
      ref={ref}
      type={type}
      value={value}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
    />
  );
}