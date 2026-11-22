'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { isEditableTarget } from '../lib/is-editable-target';
import { commandRegistry, type CommandEntry, type ScoredEntry } from '../lib/command-palette/registry';
import { fuzzyMatch, highlightSegments } from '../lib/command-palette/matcher';
import { addRecent, getRecents } from '../lib/command-palette/recents';
import { buildStaticEntries } from '../app/command-palette-static-entries';
import { createRunsProvider } from '../app/command-palette-runs-provider';
import { useTheme } from './ThemeProvider';
import { useMaintainerMode } from '../app/useMaintainerMode';

/**
 * Global command palette (Cmd/Ctrl+K). Registers its own static entries and
 * the runs provider into the shared registry on mount — see
 * `src/app/command-palette-static-entries.ts` and
 * `src/app/command-palette-runs-provider.ts` for the feature-owned
 * contributions this component wires up.
 */
export default function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const { toggle: toggleTheme } = useTheme();
  const { toggle: toggleMaintainerMode } = useMaintainerMode();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ScoredEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [commandStack, setCommandStack] = useState<CommandEntry[]>([]);
  const [argumentCommand, setArgumentCommand] = useState<CommandEntry | null>(null);
  const [argumentValues, setArgumentValues] = useState<Record<string, string | string[]>>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const closePalette = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
    setIsSearching(false);
    setCommandStack([]);
    setArgumentCommand(null);
    setArgumentValues({});
    setErrorMessage('');
    abortRef.current?.abort();
  }, []);

  useFocusTrap({
    containerRef: dialogRef,
    active: isOpen,
    onClose: closePalette,
    initialFocusRef: inputRef,
  });

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

  useEffect(() => {
    if (!isOpen) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (commandStack.length > 0) return () => controller.abort();

    commandRegistry
      .search(query, {
        signal: controller.signal,
        recentIds,
        context: { pathname },
      })
      .then((next) => {
        if (controller.signal.aborted) return;
        setResults(next);
        setActiveIndex(0);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResults([]);
        setErrorMessage(error instanceof Error ? error.message : 'Unable to search commands.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsSearching(false);
      });

    return () => controller.abort();
  }, [isOpen, query, recentIds, commandStack, pathname]);

  const openPalette = useCallback(() => {
    setRecentIds(getRecents());
    setQuery('');
    setIsSearching(true);
    setCommandStack([]);
    setArgumentCommand(null);
    setErrorMessage('');
    setIsOpen(true);
  }, []);

  const runCommand = useCallback(async (entry: CommandEntry, values?: Record<string, string | string[]>) => {
    setIsExecuting(true);
    setErrorMessage('');
    try {
      await entry.run(values);
      setRecentIds(addRecent(entry.id));
      closePalette();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Command failed.');
    } finally {
      setIsExecuting(false);
    }
  }, [closePalette]);

  const executeEntry = useCallback((scored: ScoredEntry) => {
    if (scored.entry.children?.length) {
      setCommandStack((current) => [...current, scored.entry]);
      setQuery('');
      setIsSearching(false);
      setErrorMessage('');
      return;
    }
    if (scored.entry.arguments?.length) {
      setArgumentCommand(scored.entry);
      setArgumentValues({});
      setErrorMessage('');
      return;
    }
    void runCommand(scored.entry);
  }, [runCommand]);

  const submitArguments = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!argumentCommand) return;
    for (const argument of argumentCommand.arguments ?? []) {
      const value = argumentValues[argument.id];
      if (argument.required && (!value || (Array.isArray(value) && value.length === 0))) {
        setErrorMessage(`${argument.label} is required.`);
        return;
      }
    }
    void runCommand(argumentCommand, argumentValues);
  };

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

      if (isEditableTarget(event.target) && event.target !== inputRef.current) {
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, openPalette, closePalette]);

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (visibleResults.length === 0 ? 0 : (prev + 1) % visibleResults.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => (visibleResults.length === 0 ? 0 : (prev - 1 + visibleResults.length) % visibleResults.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = visibleResults[activeIndex];
      if (selected) executeEntry(selected);
    } else if (event.key === 'Backspace' && query === '' && commandStack.length > 0) {
      event.preventDefault();
      setCommandStack((current) => current.slice(0, -1));
    }
  };

  const visibleResults = (() => {
    if (commandStack.length === 0) return results;
    const children = commandStack[commandStack.length - 1].children ?? [];
    return children.flatMap((entry) => {
      if (query.trim() === '') return [{ entry, score: 0, indices: [] }];
      const titleMatch = fuzzyMatch(query, entry.title);
      const descriptionMatch = fuzzyMatch(query, entry.description ?? entry.subtitle ?? '');
      const keywordMatches = (entry.keywords ?? []).map((keyword) => fuzzyMatch(query, keyword));
      const matches = [
        titleMatch.matched ? { score: titleMatch.score * 4 } : null,
        descriptionMatch.matched ? { score: descriptionMatch.score * 2 } : null,
        ...keywordMatches.map((match) => (match.matched ? { score: match.score } : null)),
      ].filter((match): match is { score: number } => match !== null);
      if (matches.length === 0) return [];
      return [{ entry, score: Math.max(...matches.map((match) => match.score)), indices: titleMatch.indices }];
    }).sort((a, b) => b.score - a.score);
  })();

  const activeEntry = visibleResults[activeIndex]?.entry;
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
          {commandStack.length > 0 ? (
            <button
              type="button"
              onClick={() => setCommandStack((current) => current.slice(0, -1))}
              className="shrink-0 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              aria-label={`Back from ${commandStack[commandStack.length - 1].title}`}
            >
              ← {commandStack[commandStack.length - 1].title}
            </button>
          ) : (
            <span aria-hidden="true" className="text-zinc-400">⌘K</span>
          )}
          <input
            ref={inputRef}
            role={argumentCommand ? undefined : 'combobox'}
            aria-expanded={argumentCommand ? undefined : 'true'}
            aria-controls={argumentCommand ? undefined : 'command-palette-listbox'}
            aria-activedescendant={argumentCommand ? undefined : activeDescendantId}
            aria-autocomplete={argumentCommand ? undefined : 'list'}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setIsSearching(commandStack.length === 0);
              setErrorMessage('');
              setQuery(event.target.value);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder={argumentCommand ? 'Complete command arguments' : 'Search pages, runs, and actions…'}
            disabled={Boolean(argumentCommand) || isExecuting}
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

        {argumentCommand ? (
          <form onSubmit={submitArguments} className="space-y-4 p-4">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{argumentCommand.title}</h2>
            {(argumentCommand.arguments ?? []).map((argument) => (
              <label key={argument.id} className="block space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                <span>{argument.label}{argument.required ? ' *' : ''}</span>
                {argument.type === 'text' ? (
                  <input
                    autoFocus
                    required={argument.required}
                    value={typeof argumentValues[argument.id] === 'string' ? argumentValues[argument.id] as string : ''}
                    onChange={(event) => setArgumentValues((current) => ({ ...current, [argument.id]: event.target.value }))}
                    className="w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 dark:border-zinc-700"
                  />
                ) : argument.type === 'select' ? (
                  <select
                    required={argument.required}
                    value={typeof argumentValues[argument.id] === 'string' ? argumentValues[argument.id] as string : ''}
                    onChange={(event) => setArgumentValues((current) => ({ ...current, [argument.id]: event.target.value }))}
                    className="w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 dark:border-zinc-700"
                  >
                    <option value="">Select…</option>
                    {(argument.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : (
                  <span className="block space-y-1">
                    {(argument.options ?? []).map((option) => {
                      const selectedValues = Array.isArray(argumentValues[argument.id]) ? argumentValues[argument.id] as string[] : [];
                      return (
                        <span key={option} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedValues.includes(option)}
                            onChange={(event) => setArgumentValues((current) => ({
                              ...current,
                              [argument.id]: event.target.checked
                                ? [...selectedValues, option]
                                : selectedValues.filter((value) => value !== option),
                            }))}
                          />
                          {option}
                        </span>
                      );
                    })}
                  </span>
                )}
              </label>
            ))}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setArgumentCommand(null)} className="rounded-lg px-3 py-2 text-sm">Back</button>
              <button type="submit" disabled={isExecuting} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">
                {isExecuting ? 'Running…' : 'Run command'}
              </button>
            </div>
          </form>
        ) : (
          <ul
            id="command-palette-listbox"
            role="listbox"
            aria-label="Command results"
            className="max-h-80 overflow-y-auto p-2"
          >
            {isSearching && <li className="px-3 py-2 text-sm text-muted">Searching…</li>}
            {!isSearching && visibleResults.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted">
                {errorMessage || 'No matching commands.'}
              </li>
            )}
            {visibleResults.map((scored, index) => {
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
                    {scored.entry.subtitle && (
                      <span className="ml-2 text-xs text-zinc-400">{scored.entry.subtitle}</span>
                    )}
                  </span>
                  {scored.entry.children?.length ? (
                    <span aria-label="Has submenu" className="shrink-0 text-xs text-zinc-400">›</span>
                  ) : scored.entry.shortcut ? (
                    <kbd className="shrink-0 rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-xs dark:border-zinc-700">{scored.entry.shortcut}</kbd>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {isExecuting && <p role="status" className="px-4 pb-3 text-xs text-muted">Running command…</p>}
        {errorMessage && visibleResults.length > 0 && <p role="alert" className="px-4 pb-3 text-xs text-red-600">{errorMessage}</p>}
      </div>

      <div className="sr-only" aria-live="polite" role="status">
        {visibleResults.length} result{visibleResults.length === 1 ? '' : 's'}
        {activeEntry ? `, ${activeEntry.title} selected` : ''}
      </div>
    </div>
  );
}
