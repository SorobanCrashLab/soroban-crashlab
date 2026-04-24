'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

/**
 * Accessible Keyboard Navigation Blueprint
 * 
 * This component provides global accessibility enhancements for the dashboard:
 * 1. Skip to main content link (visible on focus)
 * 2. Keyboard shortcuts reference modal (triggered by '?' key)
 * 3. Focus management with proper focus trap
 * 4. ARIA landmarks and semantic HTML
 * 
 * Acceptance Criteria:
 * - Accessible keyboard nav blueprint is visible and functional in the dashboard
 * - All interactive elements are keyboard accessible
 * - Focus indicators are clearly visible
 * - Modal has proper ARIA attributes and focus trap
 * - Supports both light and dark modes
 * 
 * Issue: #284 - Add Accessible keyboard nav blueprint
 */

interface Shortcut {
  key: string;
  description: string;
}

const DASHBOARD_SHORTCUTS: Shortcut[] = [
  { key: 'Tab', description: 'Navigate forward through interactive elements' },
  { key: 'Shift + Tab', description: 'Navigate backward through interactive elements' },
  { key: 'Arrow Up/Down', description: 'Navigate between feature cards' },
  { key: 'Enter', description: 'Open details for selected card or run' },
  { key: 'Esc', description: 'Close any open drawer or modal' },
  { key: '?', description: 'Toggle this keyboard shortcuts help' },
  { key: '/', description: 'Focus search or filters (if available)' },
];

export default function AddAccessibleKeyboardNavBlueprint() {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const toggleHelp = useCallback(() => {
    setIsHelpOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInputField = activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName);
      
      // Toggle help with '?' (only when not in input fields)
      if (e.key === '?' && !isInputField) {
        e.preventDefault();
        toggleHelp();
      }
      
      // Close with 'Esc'
      if (e.key === 'Escape' && isHelpOpen) {
        e.preventDefault();
        setIsHelpOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHelpOpen, toggleHelp]);

  // Focus management: Save and restore focus
  useEffect(() => {
    if (isHelpOpen) {
      // Save current focus
      previousFocusRef.current = document.activeElement as HTMLElement;
      
      // Focus first element in modal after render
      setTimeout(() => {
        const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable?.focus();
      }, 100);
    } else if (previousFocusRef.current) {
      // Restore focus when modal closes
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isHelpOpen]);

  // Focus trap logic for the modal
  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      if (focusableElements.length === 0) return;
      
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        // Shift + Tab: wrap to last element
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: wrap to first element
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  };

  const handleClose = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsHelpOpen(false);
      setIsLoading(false);
    }, 100);
  };

  return (
    <>
      {/* Skip to Content Link - Hidden until focused (WCAG 2.4.1) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all font-medium"
      >
        Skip to main content
      </a>

      {/* Global Shortcut Trigger Button */}
      <button
        ref={triggerRef}
        onClick={toggleHelp}
        aria-label="Open keyboard shortcuts help"
        aria-expanded={isHelpOpen}
        aria-haspopup="dialog"
        className="fixed bottom-6 right-6 z-40 p-3 bg-zinc-900 dark:bg-zinc-800 text-white dark:text-zinc-200 rounded-full shadow-lg hover:scale-110 hover:bg-zinc-800 dark:hover:bg-zinc-700 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black"
        title="Press '?' for keyboard shortcuts"
      >
        <span className="text-xl font-bold" aria-hidden="true">?</span>
      </button>

      {/* Shortcuts Modal Overlay */}
      {isHelpOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleClose();
            }
          }}
        >
          <div
            ref={modalRef}
            onKeyDown={handleModalKeyDown}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            aria-describedby="shortcuts-description"
            className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50">
              <h2 id="shortcuts-title" className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                Dashboard Keyboard Shortcuts
              </h2>
              <button
                onClick={handleClose}
                disabled={isLoading}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                aria-label="Close shortcuts help"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-6">
              <p id="shortcuts-description" className="sr-only">
                List of available keyboard shortcuts for navigating the dashboard
              </p>
              
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <>
                  <ul className="space-y-4" role="list">
                    {DASHBOARD_SHORTCUTS.map((shortcut, index) => (
                      <li key={index} className="flex items-center justify-between group">
                        <span className="text-sm text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors">
                          {shortcut.description}
                        </span>
                        <kbd className="inline-flex items-center px-2 py-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-mono font-bold text-zinc-700 dark:text-zinc-300 shadow-sm">
                          {shortcut.key}
                        </kbd>
                      </li>
                    ))}
                  </ul>
                  
                  <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                    <p className="text-xs text-zinc-500 dark:text-zinc-500 text-center italic">
                      Blueprint: Use semantic landmarks and focus-visible styles for optimal accessibility.
                    </p>
                  </div>

                  <div className="mt-6">
                    <button
                      onClick={handleClose}
                      disabled={isLoading}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition shadow-md active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Got it!
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
