import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { THEME_STORAGE_KEY, generateThemeBootstrapScript } from './theme-provider-utils';

/**
 * Guards the extracted pre-paint bootstrap (issue #1545).
 *
 * The script moved out of layout.tsx into public/theme-script.js so that
 * `script-src 'self'` can replace `'unsafe-inline'`. That move split the logic
 * across two files, which is exactly how they drift — a silent mismatch means
 * the SSR'd decision and the client `ThemeProvider` disagree, the historical
 * cause of flash-of-wrong-theme bugs. These assertions keep the two in step and
 * protect the `theme-ready` gate the CSS transition relies on.
 */

const WEB_ROOT = path.resolve(__dirname, '../..');
const SCRIPT_PATH = path.join(WEB_ROOT, 'public/theme-script.js');
const script = fs.readFileSync(SCRIPT_PATH, 'utf8');

describe('extracted pre-paint bootstrap', () => {
  it('is served as a static file and loaded from the document head', () => {
    const layout = fs.readFileSync(path.join(WEB_ROOT, 'src/app/layout.tsx'), 'utf8');

    expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
    expect(layout).toContain('<script src="/theme-script.js" />');
    // No inline bootstrap remains, which is what lets script-src drop
    // 'unsafe-inline'.
    expect(layout).not.toContain('dangerouslySetInnerHTML');
  });

  it('stays in sync with the shared generator', () => {
    // The file cannot import the TS constant, so assert it reads the same
    // storage key rather than a duplicated literal.
    expect(script).toContain(THEME_STORAGE_KEY);

    // And that it implements the same light/dark decision the generator
    // produces, so the two cannot disagree about first paint.
    for (const fragment of [
      "localStorage.getItem('crashlab:theme')",
      "'(prefers-color-scheme: dark)'",
      "document.documentElement.classList.toggle('dark', d)",
    ]) {
      expect(generateThemeBootstrapScript()).toContain(fragment);
      expect(script).toContain(fragment);
    }
  });

  it('applies the theme-ready gate the CSS transition depends on', () => {
    // globals.css only enables transitions under html.theme-ready. Losing this
    // line would not throw; it would quietly reintroduce the theme flash the
    // gate exists to prevent.
    expect(script).toContain("document.documentElement.classList.add('theme-ready')");

    const globalsCss = fs.readFileSync(path.join(WEB_ROOT, 'src/app/globals.css'), 'utf8');
    expect(globalsCss).toContain('html.theme-ready');
  });

  it('applies the accessibility preferences the inline script handled', () => {
    expect(script).toContain("crashlab:accessibility-prefs:v1");
    expect(script).toContain("'(prefers-reduced-motion: reduce)'");
    expect(script).toContain('data-text-scale');
    expect(script).toContain('high-contrast');
  });

  it('is defensive so a blocked or corrupt read cannot break hydration', () => {
    expect(script).toContain('try {');
    // Optional catch binding: nothing reads the error, and binding one trips
    // no-unused-vars.
    expect(script).toContain('} catch {}');
  });
});
