/**
 * Pure theme-resolution helpers used by ThemeProvider.
 */

export type Theme = 'light' | 'dark';

export const STORAGE_KEY = 'crashlab:theme';

/**
 * Parses a raw stored/broadcast value into a valid Theme, or null when it
 * isn't a recognized override (e.g. never set, or cleared).
 */
export function parseTheme(value: string | null | undefined): Theme | null {
  return value === 'light' || value === 'dark' ? value : null;
}

/**
 * Resolves the effective theme: an explicit user override always wins;
 * otherwise the theme tracks the current system preference. Because
 * `systemPrefersDark` is expected to be kept live (via a
 * `prefers-color-scheme` change listener), this keeps the effective theme
 * in sync with the OS setting whenever there is no override.
 */
export function resolveEffectiveTheme(userTheme: Theme | null, systemPrefersDark: boolean): Theme {
  if (userTheme) return userTheme;
  return systemPrefersDark ? 'dark' : 'light';
}

/**
 * Computes the theme that a toggle action should switch to, based on the
 * currently effective theme (override or system-derived).
 */
export function nextToggledTheme(userTheme: Theme | null, systemPrefersDark: boolean): Theme {
  const base = resolveEffectiveTheme(userTheme, systemPrefersDark);
  return base === 'light' ? 'dark' : 'light';
}
