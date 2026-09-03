'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { isEditableTarget } from '../lib/is-editable-target';
import { commandRegistry, type ScoredEntry } from '../lib/command-palette/registry';
import { highlightSegments } from '../lib/command-palette/matcher';
import { addRecent, getRecents } from '../lib/command-palette/recents';
import { buildStaticEntries } from '../app/command-palette-static-entries';
import { createRunsProvider } from '../app/command-palette-runs-provider';
import { debounce } from '../lib/debounce-utils';
import { useTheme } from './ThemeProvider';
import { useMaintainerMode } from '../app/useMaintainerMode';

const SEARCH_DEBOUNCE_MS = 150;

/**
 * Global command palette (Cmd/Ctrl+K). Registers its own static entries and
 * the runs provider into the shared registry on mount — see
 * `src/app/command-palette-static-entries.ts` and
 * `src/app/command-palette-runs-provider.ts` for the feature-owned
 * contributions this component wires up.
 */
export default function CommandPalette() {
  const router = useRouter();
  const { toggle: toggleTheme } = useTheme();
  const { toggle: toggleMaintainerMode } = useMaintainerMode();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ScoredEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const navigate = useCallback((path: string) => router.push(path), [router]);
  const exportCurrentView = useCallback(() => {
    if (typeof window !== 'undefined') window.print();
  }, []);

  useEffect(() => {
    const unregisterEntries = commandRegistry.registerEntries(
      buildStaticEntries({
        navigate,
        toggleTheme,
        toggleMaintainerMode,
        exportCurrentView,
        onRecentsCleared: () => setRecentIds([]),
      }),
    );
    const unregisterProvider = commandRegistry.registerProvider(createRunsProvider(navigate));
    return () => {
      unregisterEntries();
      unregisterProvider();
    };
  }, [navigate, toggleTheme, toggleMaintainerMode, exportCurrentView]);

  // The debouncer is built inside the effect rather than memoised across
  // renders: it reads `abortRef` and a render-phase `useMemo` that touches a
  // ref is rejected by the React Compiler. Behaviour is unchanged — each
  // keystroke replaces the pending call, which is what the debounce did.
  useEffect(() => {
    if (!isOpen) return;

    const runSearch = debounce(
      (value: string, currentRecentIds: string[]) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        commandRegistry
          .search(value, { signal: controller.signal, recentIds: currentRecentIds })
          .then((next) => {
            if (controller.signal.aborted) return;
            setResults(next);
            setActiveIndex(0);
          })
          .catch(() => {});
      },
      { delay: SEARCH_DEBOUNCE_MS },
    );

    runSearch(query, recentIds);
    return () => runSearch.cancel();
  }, [isOpen, query, recentIds]);

  const openPalette = useCallback(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    setRecentIds(getRecents());
    setQuery('');
    setIsOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
    abortRef.current?.abort();
  }, []);

  const executeEntry = useCallback(
    (scored: ScoredEntry) => {
      addRecent(scored.entry.id);
      closePalette();
      void scored.entry.run();
    },
    [closePalette],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isPaletteChord =
        (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k';

      // A modifier chord doesn't insert a literal character, so — like the
      // cheatsheet's Ctrl+/ — it's safe to honor even while a field is
      // focused (the editable-field guard from #856 is deliberately not
      // applied here, only reused for gating plain-key navigation below).
      if (isPaletteChord) {
        event.preventDefault();
        if (isOpen) {
          closePalette();
        } else {
          openPalette();
        }
        return;
      }

      if (!isOpen) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        closePalette();
        return;
      }

      if (isEditableTarget(event.target) && event.target !== inputRef.current) {
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, openPalette, closePalette]);

  useEffect(() => {
    if (isOpen) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }
    if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (results.length === 0 ? 0 : (prev + 1) % results.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => (results.length === 0 ? 0 : (prev - 1 + results.length) % results.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = results[activeIndex];
      if (selected) executeEntry(selected);
    } else if (event.key === 'Tab' && dialogRef.current) {
      const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusableElements.length === 0) return;
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const activeEntry = results[activeIndex]?.entry;
  const activeDescendantId = activeEntry ? `command-palette-option-${activeEntry.id}` : undefined;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) closePalette();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <span aria-hidden="true" className="text-zinc-400">⌘K</span>
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-listbox"
            aria-activedescendant={activeDescendantId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search pages, runs, and actions…"
            className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-50"
          />
          <button
            type="button"
            onClick={closePalette}
            aria-label="Close command palette"
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-zinc-800"
          >
            <span aria-hidden="true">Esc</span>
          </button>
        </div>

        <ul
          id="command-palette-listbox"
          role="listbox"
          aria-label="Command results"
          className="max-h-80 overflow-y-auto p-2"
        >
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted">
              No matching commands.
            </li>
          )}
          {results.map((scored, index) => {
            const segments = highlightSegments(scored.entry.title, scored.indices);
            const selected = index === activeIndex;
            return (
              <li
                key={scored.entry.id}
                id={`command-palette-option-${scored.entry.id}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => executeEntry(scored)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
                  selected
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'text-zinc-700 dark:text-zinc-300'
                }`}
              >
                <span>
                  {segments.map((segment, segmentIndex) => (
                    <span
                      key={segmentIndex}
                      className={segment.highlighted ? 'font-semibold text-blue-600 dark:text-blue-400' : undefined}
                    >
                      {segment.text}
                    </span>
                  ))}
                </span>
                {scored.entry.subtitle && (
                  <span className="shrink-0 text-xs text-zinc-400">{scored.entry.subtitle}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="sr-only" aria-live="polite" role="status">
        {results.length} result{results.length === 1 ? '' : 's'}
        {activeEntry ? `, ${activeEntry.title} selected` : ''}
      </div>
    </div>
  );
}
