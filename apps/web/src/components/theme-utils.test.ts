import * as assert from 'node:assert/strict';
import { parseTheme, resolveEffectiveTheme, nextToggledTheme } from './theme-utils';

const runAssertions = () => {
  // parseTheme: only recognized values count as an explicit override.
  assert.equal(parseTheme('light'), 'light');
  assert.equal(parseTheme('dark'), 'dark');
  assert.equal(parseTheme(null), null);
  assert.equal(parseTheme(undefined), null);
  assert.equal(parseTheme('system'), null);
  assert.equal(parseTheme(''), null);

  // resolveEffectiveTheme: with no user override, the effective theme must
  // track the live system preference -- this is the core of #1085/#853:
  // the theme has to follow dynamic changes to prefers-color-scheme.
  assert.equal(resolveEffectiveTheme(null, true), 'dark');
  assert.equal(resolveEffectiveTheme(null, false), 'light');

  // Simulate the OS preference flipping while no override is set: the
  // resolved theme must flip with it.
  let systemPrefersDark = false;
  assert.equal(resolveEffectiveTheme(null, systemPrefersDark), 'light');
  systemPrefersDark = true;
  assert.equal(resolveEffectiveTheme(null, systemPrefersDark), 'dark');
  systemPrefersDark = false;
  assert.equal(resolveEffectiveTheme(null, systemPrefersDark), 'light');

  // An explicit user override always wins over the system preference,
  // regardless of which way the system preference changes.
  assert.equal(resolveEffectiveTheme('light', true), 'light');
  assert.equal(resolveEffectiveTheme('dark', false), 'dark');

  // nextToggledTheme: toggling flips the currently effective theme, whether
  // it came from an override or from the system preference.
  assert.equal(nextToggledTheme(null, false), 'dark');
  assert.equal(nextToggledTheme(null, true), 'light');
  assert.equal(nextToggledTheme('light', true), 'dark');
  assert.equal(nextToggledTheme('dark', false), 'light');
};

runAssertions();
console.log('theme-utils.test.ts: all assertions passed');
