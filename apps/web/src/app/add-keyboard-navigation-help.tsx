'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

/**
 * Keyboard Navigation Help Component
 * 
 * Provides an accessible modal listing available keyboard shortcuts.
 * Triggered by the '?' key.
 */
export default function AddKeyboardNavigationHelp() {
  const [isOpen, setIsOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const toggleModal = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      e.preventDefault();
      toggleModal();
    } else if (e.key === 'Escape' && isOpen) {
      setIsOpen(false);
    }
  }, [isOpen, toggleModal]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (isOpen) {
      // Focus the close button when the modal opens for accessibility
      setTimeout(() => closeButtonRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const shortcuts = [
    { keys: ['↑', '↓'], desc: 'Navigate between fuzzing runs' },
    { keys: ['Enter'], desc: 'Open selected run details' },
    { keys: ['Esc'], desc: 'Close any active modal or drawer' },
    { keys: ['?'], desc: 'Toggle this keyboard help search' },
    { keys: ['G', 'H'], desc: 'Go to Home / Dashboard' },
    { keys: ['G', 'T'], desc: 'Go to Trends visualization' },
  ];

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 dark:bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kybd-help-title"
    >
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/50">
          <h2 id="kybd-help-title" className="text-lg font-bold flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 20">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Keyboard Shortcuts
          </h2>
          <button
            ref={closeButtonRef}
            onClick={() => setIsOpen(false)}
            className="p-1 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            aria-label="Close help"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 gap-4">
            {shortcuts.map((s, idx) => (
              <div key={idx} className="flex items-center justify-between py-1 border-b border-zinc-50 dark:border-zinc-800 last:border-0">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">{s.desc}</span>
                <div className="flex gap-1">
                  {s.keys.map((k, kIdx) => (
                    <kbd 
                      key={kIdx} 
                      className="min-w-[24px] h-6 flex items-center justify-center px-1.5 rounded border border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 text-[10px] font-mono font-bold shadow-sm"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-4 flex gap-4">
            <div className="shrink-0 h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Pro Tip</p>
              <p className="text-xs text-blue-800/80 dark:text-blue-300/80 mt-0.5">
                Keyboard shortcuts help you move 3x faster through fuzzing results.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-800/50 flex justify-end">
          <button
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg active:scale-95"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
