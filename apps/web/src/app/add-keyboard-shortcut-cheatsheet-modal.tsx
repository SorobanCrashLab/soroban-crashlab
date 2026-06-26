'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  formatShortcutKeys,
  groupShortcutsByCategory,
  isTypingContext,
  KEYBOARD_SHORTCUT_CHEATSHEET,
  resolveGoNavigationShortcut,
  SHORTCUT_CATEGORY_LABELS,
  SHORTCUT_CATEGORY_ORDER,
  shouldToggleCheatsheet,
  type GoKeyPendingState,
} from './keyboard-shortcut-cheatsheet-utils';

/**
 * Global keyboard shortcut cheatsheet modal.
 *
 * Issue: #856 - Add keyboard shortcut cheatsheet modal
 */
export default function AddKeyboardShortcutCheatsheetModal() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingGoKey, setPendingGoKey] = useState<GoKeyPendingState>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const groupedShortcuts = groupShortcutsByCategory(KEYBOARD_SHORTCUT_CHEATSHEET);

  const openModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setPendingGoKey(null);
  }, []);

  const toggleModal = useCallback(() => {
    setIsOpen((previous) => !previous);
    setPendingGoKey(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const typing = isTypingContext(document.activeElement);

      if (shouldToggleCheatsheet(event, typing)) {
        event.preventDefault();
        toggleModal();
        return;
      }

      if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        closeModal();
        return;
      }

      if (typing && !isOpen) {
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

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      window.setTimeout(() => closeButtonRef.current?.focus(), 100);
      return;
    }

    if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  const handleModalKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !modalRef.current) {
      return;
    }

    const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );

    if (focusableElements.length === 0) {
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label="Open keyboard shortcuts cheatsheet"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900 text-lg font-bold text-white shadow-lg transition hover:scale-110 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:focus:ring-offset-black"
        title="Press ? for keyboard shortcuts"
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
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="keyboard-cheatsheet-title"
            aria-describedby="keyboard-cheatsheet-description"
            onKeyDown={handleModalKeyDown}
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/80 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-800/50">
              <div>
                <h2 id="keyboard-cheatsheet-title" className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                  Keyboard Shortcuts
                </h2>
                <p id="keyboard-cheatsheet-description" className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Press <kbd className="rounded border border-zinc-300 px-1 font-mono dark:border-zinc-600">?</kbd> anywhere to toggle this cheatsheet.
                </p>
              </div>
              <button
                ref={closeButtonRef}
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

            <div className="max-h-[70vh] space-y-6 overflow-y-auto p-6">
              {SHORTCUT_CATEGORY_ORDER.map((category) => {
                const shortcuts = groupedShortcuts[category];
                if (shortcuts.length === 0) {
                  return null;
                }

                return (
                  <section key={category} aria-labelledby={`shortcut-category-${category}`}>
                    <h3
                      id={`shortcut-category-${category}`}
                      className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                    >
                      {SHORTCUT_CATEGORY_LABELS[category]}
                    </h3>
                    <ul className="space-y-3" role="list">
                      {shortcuts.map((shortcut) => (
                        <li
                          key={shortcut.id}
                          className="flex items-center justify-between gap-4 border-b border-zinc-50 py-1 last:border-0 dark:border-zinc-800"
                        >
                          <span className="text-sm text-zinc-600 dark:text-zinc-300">
                            {shortcut.description}
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
