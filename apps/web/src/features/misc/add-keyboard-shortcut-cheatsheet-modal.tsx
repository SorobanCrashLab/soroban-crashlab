'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  buildCheatsheetCommandItems,
  CHEATSHEET_COMMAND_CATEGORY_LABELS,
  CHEATSHEET_COMMAND_CATEGORY_ORDER,
  filterCheatsheetCommandItems,
  filterKeyboardShortcuts,
  formatShortcutKeys,
  KEYBOARD_SHORTCUT_CHEATSHEET,
  resolveGoNavigationShortcut,
  SHORTCUT_CATEGORY_LABELS,
  shouldToggleCheatsheet,
  type CheatsheetCommandItem,
  type GoKeyPendingState,
} from '../../app/keyboard-shortcut-cheatsheet-utils';
import { commandRegistry, type CommandEntry } from '../../lib/command-palette/registry';
import { addRecent } from '../../lib/command-palette/recents';
import { isEditableTarget } from '../../lib/is-editable-target';
import { useFocusTrap } from '../../hooks/useFocusTrap';

/**
 * Global keyboard shortcut cheatsheet overlay.
 *
 * Issue: #856 - Add keyboard shortcut cheatsheet modal
 * Issue: #1658 - Cheatsheet wired to the live command palette.
 *
 * Every command entry is generated from the palette's actual registry (the
 * single source of truth) rather than a hand-maintained copy — commands that
 * are registered anywhere in the app surface here, searchable and clickable to
 * execute. The static keyboard-shortcut model only contributes the key chords
 * and the non-command row shortcuts (arrows, Enter, "/").
 */
export default function AddKeyboardShortcutCheatsheetModal() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<CommandEntry[]>([]);
  const [pendingGoKey, setPendingGoKey] = useState<GoKeyPendingState>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Non-command shortcuts: general + dashboard rows (no route). Navigation rows
  // are rendered from the live registry with their key chords attached instead.
  const shortcutRows = useMemo(
    () => KEYBOARD_SHORTCUT_CHEATSHEET.filter((shortcut) => !shortcut.route),
    [],
  );

  const commandItems = useMemo(() => buildCheatsheetCommandItems(entries), [entries]);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setPendingGoKey(null);
  }, []);

  const openModal = useCallback(() => {
    // Snapshot the live registry: whatever commands have registered (palette
    // static entries + feature-owned contributions) is exactly what renders.
    setEntries(commandRegistry.listEntries());
    setQuery('');
    setPendingGoKey(null);
    setIsOpen(true);
  }, []);

  const toggleModal = useCallback(() => {
    setIsOpen((previous) => {
      if (!previous) {
        setEntries(commandRegistry.listEntries());
        setQuery('');
      }
      setPendingGoKey(null);
      return !previous;
    });
  }, []);

  const executeCommand = useCallback(
    (item: CheatsheetCommandItem) => {
      const entry = entries.find((candidate) => candidate.id === item.commandId);
      if (!entry) return;
      addRecent(entry.id);
      closeModal();
      void entry.run();
    },
    [entries, closeModal],
  );

  const filteredShortcuts = useMemo(
    () => filterKeyboardShortcuts(shortcutRows, query),
    [shortcutRows, query],
  );
  const filteredCommands = useMemo(
    () => filterCheatsheetCommandItems(commandItems, query),
    [commandItems, query],
  );

  useFocusTrap({
    containerRef: dialogRef,
    active: isOpen,
    onClose: closeModal,
    initialFocusRef: searchRef,
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const typing = isEditableTarget(event.target);

      if (shouldToggleCheatsheet(event, typing)) {
        event.preventDefault();
        toggleModal();
        return;
      }

      // While the overlay is open focus lives inside the search field; typed
      // characters belong to the query, never to a G-chord.
      if (typing && isOpen) {
        return;
      }

      if (event.key === 'Escape' && isOpen) {
        return;
      }

      const navigation = resolveGoNavigationShortcut(event.key, pendingGoKey);
      setPendingGoKey(navigation.nextPendingGoKey);

      if (navigation.route) {
        event.preventDefault();
        router.push(navigation.route);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeModal, isOpen, pendingGoKey, router, toggleModal]);

  useEffect(() => {
    if (!pendingGoKey) {
      return;
    }

    const timer = window.setTimeout(() => setPendingGoKey(null), 1200);
    return () => window.clearTimeout(timer);
  }, [pendingGoKey]);

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label="Open keyboard shortcuts cheatsheet"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900 text-lg font-bold text-white shadow-lg transition hover:scale-110 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:focus:ring-offset-black"
        title="Press ? or Ctrl+/ for keyboard shortcuts"
      >
        <span aria-hidden="true">?</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="keyboard-cheatsheet-title"
            aria-describedby="keyboard-cheatsheet-description"
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/80 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-800/50">
              <div>
                <h2 id="keyboard-cheatsheet-title" className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                  Keyboard Shortcuts
                </h2>
                <p id="keyboard-cheatsheet-description" className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Press <kbd className="rounded border border-zinc-300 px-1 font-mono dark:border-zinc-600">?</kbd> or{' '}
                  <kbd className="rounded border border-zinc-300 px-1 font-mono dark:border-zinc-600">Ctrl+/</kbd> anywhere to toggle this cheatsheet.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                aria-label="Close keyboard shortcuts cheatsheet"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="border-b border-zinc-100 px-6 py-3 dark:border-zinc-800">
              <input
                ref={searchRef}
                type="search"
                role="searchbox"
                aria-label="Filter shortcuts and commands"
                placeholder="Search shortcuts and commands…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              />
            </div>

            <div className="max-h-[60vh] space-y-6 overflow-y-auto p-6">
              {filteredShortcuts.length === 0 && filteredCommands.length === 0 && (
                <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  No shortcuts or commands match “{query}”.
                </p>
              )}

              {filteredShortcuts.length > 0 && (
                <section aria-labelledby="shortcut-rows-title">
                  <h3
                    id="shortcut-rows-title"
                    className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                  >
                    Keyboard rows
                  </h3>
                  <ul className="space-y-3" role="list">
                    {filteredShortcuts.map((shortcut) => (
                      <li
                        key={shortcut.id}
                        className="flex items-center justify-between gap-4 border-b border-zinc-50 py-1 last:border-0 dark:border-zinc-800"
                      >
                        <span className="text-sm text-zinc-600 dark:text-zinc-300">
                          {shortcut.description}
                          <span className="ml-2 hidden text-xs text-zinc-400 sm:inline">
                            {SHORTCUT_CATEGORY_LABELS[shortcut.category]}
                          </span>
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          {shortcut.keys.map((keyLabel, index) => (
                            <span key={`${shortcut.id}-${keyLabel}-${index}`} className="flex items-center gap-1">
                              {index > 0 && (
                                <span className="text-[10px] uppercase text-zinc-400 dark:text-zinc-500">then</span>
                              )}
                              <kbd className="inline-flex min-w-[24px] items-center justify-center rounded border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-zinc-700 shadow-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
                                {keyLabel}
                              </kbd>
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {CHEATSHEET_COMMAND_CATEGORY_ORDER.map((category) => {
                const items = filteredCommands.filter((item) => item.category === category);
                if (items.length === 0) {
                  return null;
                }

                return (
                  <section key={category} aria-labelledby={`command-category-${category}`}>
                    <h3
                      id={`command-category-${category}`}
                      className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                    >
                      {CHEATSHEET_COMMAND_CATEGORY_LABELS[category]}
                    </h3>
                    <ul className="space-y-1" role="list">
                      {items.map((item) => (
                        <li key={item.commandId}>
                          <button
                            type="button"
                            onClick={() => executeCommand(item)}
                            className="flex w-full items-center justify-between gap-4 rounded-lg px-2 py-1.5 text-left transition hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-zinc-800"
                          >
                            <span className="text-sm text-zinc-700 dark:text-zinc-200">
                              {item.title}
                              {item.subtitle ? (
                                <span className="ml-2 text-xs text-zinc-400">{item.subtitle}</span>
                              ) : null}
                            </span>
                            {(item.keys?.length ?? 0) > 0 ? (
                              <span className="flex shrink-0 items-center gap-1">
                                {item.keys!.map((keyLabel, index) => (
                                  <span key={`${item.commandId}-${keyLabel}-${index}`} className="flex items-center gap-1">
                                    {index > 0 && (
                                      <span className="text-[10px] uppercase text-zinc-400 dark:text-zinc-500">then</span>
                                    )}
                                    <kbd className="inline-flex min-w-[24px] items-center justify-center rounded border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-zinc-700 shadow-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
                                      {keyLabel}
                                    </kbd>
                                  </span>
                                ))}
                              </span>
                            ) : (
                              <span aria-hidden="true" className="text-xs text-zinc-300 dark:text-zinc-600">
                                run
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-800/50">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {pendingGoKey === 'g'
                  ? 'Go-to shortcut armed — press a destination key.'
                  : `Example: ${formatShortcutKeys(['G', 'R'])} opens Runs.`}
              </p>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95 dark:focus:ring-offset-zinc-900"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}