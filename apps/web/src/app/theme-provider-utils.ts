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
