"use client";

import { useCallback, useEffect, useState } from "react";
import {
  nextTheme,
  parseStoredTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "./theme-provider-utils";

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function readTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = parseStoredTheme(localStorage.getItem(THEME_STORAGE_KEY));
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function DarkModeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = readTheme();
    applyTheme(initial);
    const timer = window.setTimeout(() => {
      setTheme(initial);
      setMounted(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = nextTheme(current);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      applyTheme(next);
      return next;
    });
  }, []);

  if (!mounted) {
    return (
      <button
        type="button"
        className="flex items-center justify-center w-8 h-8 rounded-lg border border-zinc-200 dark:border-zinc-700"
        aria-hidden="true"
        tabIndex={-1}
      />
    );
  }

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex items-center justify-center w-8 h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      aria-label={label}
      title={label}
    >
      {theme === "dark" ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
}
