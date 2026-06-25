import * as assert from 'node:assert/strict';
import {
  nextTheme,
  parseStoredTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
} from './theme-provider-utils';

// THEME_STORAGE_KEY
assert.equal(THEME_STORAGE_KEY, 'crashlab:theme');

// parseStoredTheme
assert.equal(parseStoredTheme('light'), 'light');
assert.equal(parseStoredTheme('dark'), 'dark');
assert.equal(parseStoredTheme(null), null);
assert.equal(parseStoredTheme(''), null);
assert.equal(parseStoredTheme('system'), null);
assert.equal(parseStoredTheme('Light'), null);   // case-sensitive
assert.equal(parseStoredTheme('DARK'), null);

// resolveTheme — user preference takes priority
assert.equal(resolveTheme('light', true), 'light');   // user=light overrides system dark
assert.equal(resolveTheme('dark', false), 'dark');    // user=dark overrides system light

// resolveTheme — falls back to system when no user preference
assert.equal(resolveTheme(null, true), 'dark');
assert.equal(resolveTheme(null, false), 'light');

// nextTheme
assert.equal(nextTheme('light'), 'dark');
assert.equal(nextTheme('dark'), 'light');

// toggle cycle: light → dark → light
assert.equal(nextTheme(nextTheme('light')), 'light');

console.log('theme-provider-utils.test.ts: all assertions passed');
