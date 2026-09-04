import {
  resolveTheme,
  parseStoredTheme,
  nextTheme,
  toggleTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from './theme-provider-utils';

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected} but got ${actual}`);
  }
}

// THEME_STORAGE_KEY constant is exported
{
  assertEqual(THEME_STORAGE_KEY, 'crashlab:theme');
}

// resolveTheme: returns user theme when provided (light)
{
  const result = resolveTheme('light', false);
  assertEqual(result, 'light');
}

// resolveTheme: returns user theme when provided (dark)
{
  const result = resolveTheme('dark', true);
  assertEqual(result, 'dark');
}

// resolveTheme: returns dark when user theme is null and system prefers dark
{
  const result = resolveTheme(null, true);
  assertEqual(result, 'dark');
}

// resolveTheme: returns light when user theme is null and system prefers light
{
  const result = resolveTheme(null, false);
  assertEqual(result, 'light');
}

// resolveTheme: user theme takes precedence over system preference
{
  const result = resolveTheme('light', true);
  assertEqual(result, 'light');
}

// parseStoredTheme: returns 'light' when input is 'light'
{
  const result = parseStoredTheme('light');
  assertEqual(result, 'light');
}

// parseStoredTheme: returns 'dark' when input is 'dark'
{
  const result = parseStoredTheme('dark');
  assertEqual(result, 'dark');
}

// parseStoredTheme: returns null for null input
{
  const result = parseStoredTheme(null);
  assertEqual(result, null);
}

// parseStoredTheme: returns null for empty string
{
  const result = parseStoredTheme('');
  assertEqual(result, null);
}

// parseStoredTheme: returns null for invalid theme value
{
  const result = parseStoredTheme('invalid');
  assertEqual(result, null);
}

// parseStoredTheme: returns null for numeric string
{
  const result = parseStoredTheme('123');
  assertEqual(result, null);
}

// parseStoredTheme: returns null for arbitrary text
{
  const result = parseStoredTheme('auto');
  assertEqual(result, null);
}

// parseStoredTheme: returns null for mixed case that doesn't match exactly
{
  const result = parseStoredTheme('Light');
  assertEqual(result, null);
}

// parseStoredTheme: returns null for whitespace-padded values
{
  const result = parseStoredTheme(' light ');
  assertEqual(result, null);
}

// nextTheme: toggles light to dark
{
  const result = nextTheme('light');
  assertEqual(result, 'dark');
}

// nextTheme: toggles dark to light
{
  const result = nextTheme('dark');
  assertEqual(result, 'light');
}

// nextTheme: repeated toggles cycle correctly
{
  let current: Theme = 'light';
  current = nextTheme(current);
  assertEqual(current, 'dark');
  current = nextTheme(current);
  assertEqual(current, 'light');
  current = nextTheme(current);
  assertEqual(current, 'dark');
}

// Edge case: resolveTheme handles boolean systemPrefersDark correctly
{
  const darkResult = resolveTheme(null, true);
  const lightResult = resolveTheme(null, false);
  assertEqual(darkResult, 'dark');
  assertEqual(lightResult, 'light');
}

// toggleTheme: computes next theme state deterministically
{
  assertEqual(toggleTheme(null, false), 'dark');
  assertEqual(toggleTheme(null, true), 'light');
  assertEqual(toggleTheme('light', false), 'dark');
  assertEqual(toggleTheme('dark', false), 'light');
  assertEqual(toggleTheme('light', true), 'dark');
  assertEqual(toggleTheme('dark', true), 'light');
}

// Hammer-test: 20 synthetic toggles starting from null in light system mode
{
  let current: Theme | null = null;
  const systemPrefersDark = false;
  const history: Theme[] = [];
  for (let i = 0; i < 20; i++) {
    current = toggleTheme(current, systemPrefersDark);
    history.push(current);
  }
  for (let i = 0; i < 20; i++) {
    const expected = i % 2 === 0 ? 'dark' : 'light';
    assertEqual(history[i], expected, `Toggle step ${i + 1} expected ${expected} but got ${history[i]}`);
  }
  assertEqual(current, 'light', '20 toggles in light system mode should return to light');
}

// Hammer-test: 20 synthetic toggles starting from null in dark system mode
{
  let current: Theme | null = null;
  const systemPrefersDark = true;
  const history: Theme[] = [];
  for (let i = 0; i < 20; i++) {
    current = toggleTheme(current, systemPrefersDark);
    history.push(current);
  }
  for (let i = 0; i < 20; i++) {
    const expected = i % 2 === 0 ? 'light' : 'dark';
    assertEqual(history[i], expected, `Toggle step ${i + 1} expected ${expected} but got ${history[i]}`);
  }
  assertEqual(current, 'dark', '20 toggles in dark system mode should return to dark');
}

console.log('theme-provider-utils.test.ts: all assertions passed');
