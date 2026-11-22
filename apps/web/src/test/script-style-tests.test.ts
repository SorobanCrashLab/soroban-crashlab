import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { findScriptStyleTests, QUARANTINED_TESTS } from './script-style-tests';

/**
 * Runs every script-style test through Vitest. Importing the module executes
 * its top-level assertions, so a failure surfaces as a failing `it()` — the
 * same signal `node <file>.js` exiting non-zero used to give. See
 * `script-style-tests.ts` for why these files are not rewritten as suites.
 */
const WEB_ROOT = path.resolve(__dirname, '../..');
const scriptStyleTests = findScriptStyleTests(WEB_ROOT);

describe('script-style tests', () => {
  it('discovers the script-style suites on disk', () => {
    // Guards against a refactor that silently stops matching any file and
    // leaves the whole legacy corpus unrun while CI still reports green.
    expect(scriptStyleTests.length).toBeGreaterThan(50);
  });

  it('does not list a quarantined file as runnable', () => {
    expect(scriptStyleTests.filter((f) => QUARANTINED_TESTS.includes(f))).toEqual([]);
  });

  for (const relativePath of scriptStyleTests) {
    it(relativePath, async () => {
      await import(/* @vite-ignore */ path.join(WEB_ROOT, relativePath));
    });
  }
});
