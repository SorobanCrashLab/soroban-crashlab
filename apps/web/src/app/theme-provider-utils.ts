export type Theme = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'crashlab:theme';

export function resolveTheme(
  userTheme: Theme | null,
  systemPrefersDark: boolean,
): Theme {
  if (userTheme) return userTheme;
  return systemPrefersDark ? 'dark' : 'light';
}

export function parseStoredTheme(raw: string | null): Theme | null {
  if (raw === 'light' || raw === 'dark') return raw;
  return null;
}

export function nextTheme(current: Theme): Theme {
  return current === 'light' ? 'dark' : 'light';
}

export function toggleTheme(
  currentUserTheme: Theme | null,
  systemPrefersDark: boolean = false,
): Theme {
  const currentEffective = resolveTheme(currentUserTheme, systemPrefersDark);
  return nextTheme(currentEffective);
}

/**
 * Generates the pre-hydration "which theme applies at first paint" snippet
 * embedded in `layout.tsx`'s inline bootstrap script.
 *
 * This is the single source of truth for that decision: it is built from the
 * same `THEME_STORAGE_KEY` and light/dark logic as `resolveTheme` above, so
 * the SSR-injected script and the client-side `ThemeProvider` can never drift
 * out of sync (the historical cause of flash-of-wrong-theme bugs). Callers
 * must run the returned string before any paint-affecting DOM read.
 *
 * Assumes `t` is not already declared in the enclosing scope.
 */
export function generateThemeBootstrapScript(): string {
  return `var t = localStorage.getItem('${THEME_STORAGE_KEY}');
  var d = t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', d);`;
}

