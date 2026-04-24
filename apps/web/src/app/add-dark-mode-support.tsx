"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "crashlab:dark-mode";

export function useDarkMode(): {
  isDark: boolean;
  toggle: () => void;
  mounted: boolean;
} {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Initialize on client; read saved preference or OS preference and apply
  useEffect(() => {
    const t = window.setTimeout(() => {
      setMounted(true);
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved !== null) {
          const next = saved === "true";
          setIsDark(next);
          document.documentElement.classList.toggle("dark", next);
          // some setups toggle dark on body instead of html
          document.body?.classList?.toggle?.("dark", next);
        } else if (window.matchMedia) {
          const prefers = window.matchMedia(
            "(prefers-color-scheme: dark)",
          ).matches;
          setIsDark(prefers);
          document.documentElement.classList.toggle("dark", prefers);
          document.body?.classList?.toggle?.("dark", prefers);
        }
      } catch {
        // ignore localStorage errors
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  // Persist and apply whenever it changes
  useEffect(() => {
    try {
      document.documentElement.classList.toggle("dark", isDark);
      document.body?.classList?.toggle?.("dark", isDark);
      // Also set CSS variables directly on the root element so components
      // that rely on variables update immediately regardless of CSS load
      // order or specificity.
      if (isDark) {
        document.documentElement.style.setProperty("--background", "#0a0a0a");
        document.documentElement.style.setProperty("--foreground", "#ededed");
        document.documentElement.style.setProperty(
          "--header-border-color",
          "rgba(255,255,255,0.145)",
        );
      } else {
        document.documentElement.style.setProperty("--background", "#ffffff");
        document.documentElement.style.setProperty("--foreground", "#171717");
        document.documentElement.style.setProperty(
          "--header-border-color",
          "rgba(0,0,0,0.08)",
        );
      }
      localStorage.setItem(STORAGE_KEY, String(isDark));
    } catch {
      // ignore write errors
    }
  }, [isDark]);

  // If user changes OS preference and there's no saved preference, follow it.
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === null) {
          setIsDark(e.matches);
        }
      } catch {
        // ignore
      }
    };
    // Support both addEventListener and deprecated addListener
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", handler as EventListener);
    } else {
      // Some TypeScript DOM libs don't include addListener/removeListener on MediaQueryList;
      // create a narrowed type that declares them as optional instead of using `any`.
      const mqWithListener = mq as MediaQueryList & {
        addListener?: (l: (e: MediaQueryListEvent) => void) => void;
        removeListener?: (l: (e: MediaQueryListEvent) => void) => void;
      };
      if (typeof mqWithListener.addListener === "function") {
        mqWithListener.addListener(handler);
      }
    }
    return () => {
      if (typeof mq.removeEventListener === "function") {
        mq.removeEventListener("change", handler as EventListener);
      } else {
        const mqWithListener = mq as MediaQueryList & {
          addListener?: (l: (e: MediaQueryListEvent) => void) => void;
          removeListener?: (l: (e: MediaQueryListEvent) => void) => void;
        };
        if (typeof mqWithListener.removeListener === "function") {
          mqWithListener.removeListener(handler);
        }
      }
    };
  }, []);

  const toggle = useCallback(() => {
    setIsDark((prev) => !prev);
  }, []);

  return { isDark, toggle, mounted };
}

export default function DarkModeToggle() {
  const { isDark, toggle, mounted } = useDarkMode();
  if (!mounted) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm">
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
        Theme
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        onClick={toggle}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 ${
          isDark ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-600"
        }`}
        aria-label="Toggle dark mode"
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            isDark ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      <span className="text-sm font-medium">
        {isDark ? (
          <span className="text-blue-400">Dark</span>
        ) : (
          <span className="text-zinc-500 dark:text-zinc-400">Light</span>
        )}
      </span>
    </div>
  );
}
