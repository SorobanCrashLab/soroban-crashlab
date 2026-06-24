'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function MobileNavDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
        aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isOpen}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed right-0 top-0 h-full w-72 max-w-[80vw] bg-white dark:bg-zinc-950 shadow-2xl border-l border-zinc-200 dark:border-zinc-800 p-6 overflow-y-auto animate-in slide-in-from-right duration-300 ease-out">
            <div className="flex items-center justify-between mb-8">
              <span className="font-semibold text-lg">Navigation</span>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label="Close navigation menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex flex-col gap-2" role="navigation" aria-label="Mobile navigation">
              <Link
                href="/logs"
                className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  pathname === '/logs'
                    ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                Logs
              </Link>
              <Link
                href="/triage"
                className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  pathname === '/triage'
                    ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                Triage
              </Link>
              <Link
                href="/settings/accessibility"
                className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  pathname === '/settings/accessibility'
                    ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                Keyboard Nav
              </Link>
              <Link
                href="/settings/alerting"
                className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  pathname === '/settings/alerting'
                    ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                Alerts
              </Link>
              <Link
                href="/#reporting-templates"
                className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  pathname === '/'
                    ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
                onClick={() => setIsOpen(false)}
              >
                Templates
              </Link>
              <hr className="my-2 border-zinc-200 dark:border-zinc-800" />
              <a
                href="https://github.com/SorobanCrashLab/soroban-crashlab"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-3 rounded-xl text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                GitHub
              </a>
              <a
                href="https://github.com/SorobanCrashLab/soroban-crashlab/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-3 rounded-xl text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Open Issues
              </a>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
