import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Guards the self-hosted font setup (issue #1406).
 *
 * The font files are committed under `src/app/fonts` and loaded via
 * `next/font/local`. The browser never contacts fonts.googleapis.com or
 * fonts.gstatic.com, and the build never depends on Google Fonts being
 * reachable — a hard requirement for the offline Docker gate.
 */

const WEB_ROOT = path.resolve(__dirname, '../..');

const read = (relativePath: string) =>
  fs.readFileSync(path.join(WEB_ROOT, relativePath), 'utf8');

const layout = read('src/app/layout.tsx');
const fontsModule = read('src/app/fonts.ts');
const globalCss = read('src/app/globals.css');
const nextConfig = read('next.config.ts');

describe('self-hosted fonts', () => {
  it('does not reference Google font hosts anywhere in the app shell', () => {
    for (const source of [layout, globalCss, nextConfig, fontsModule]) {
      expect(source).not.toMatch(/fonts\.googleapis\.com/);
      expect(source).not.toMatch(/fonts\.gstatic\.com/);
    }
  });

  it('drops the font preconnect hints from the document head', () => {
    expect(layout).not.toMatch(/rel="preconnect"/);
  });

  it('keeps the favicon and theme-color meta tags untouched', () => {
    expect(layout).toMatch(/rel="icon"/);
    expect(layout).toMatch(/rel="apple-touch-icon"/);
    expect(layout).toMatch(/name="theme-color"/);
  });

  it('applies the generated font variables on <html>', () => {
    expect(layout).toMatch(/import \{ fontVariables \} from "\.\/fonts"/);
    expect(layout).toMatch(/<html lang="en" className=\{fontVariables\}/);
  });

  it('loads all families from committed local font files', () => {
    expect(fontsModule).toMatch(/from "next\/font\/local"/);
    expect(fontsModule).not.toMatch(/from "next\/font\/google"/);

    const fontFiles = [
      'src/app/fonts/inter-variable.woff2',
      'src/app/fonts/lora-variable.woff2',
      'src/app/fonts/space-grotesk-variable.woff2',
      'src/app/fonts/jetbrains-mono-variable.woff2',
    ];
    for (const file of fontFiles) {
      expect(fs.existsSync(path.join(WEB_ROOT, file))).toBe(true);
      expect(fs.statSync(path.join(WEB_ROOT, file)).size).toBeGreaterThan(1000);
      expect(fontsModule).toContain(`./fonts/${path.basename(file)}`);
    }
  });

  it('covers the full variable weight range of each family', () => {
    const weights = fontsModule.match(/weight: "[0-9]+ [0-9]+"/g) ?? [];
    expect(weights).toEqual([
      'weight: "100 900"', // Inter
      'weight: "400 700"', // Lora
      'weight: "300 700"', // Space Grotesk
      'weight: "100 800"', // JetBrains Mono
    ]);
  });

  it('leaves font-display to the next/font default (swap)', () => {
    expect(fontsModule).not.toMatch(/^\s*display:/m);
  });

  it('wires the generated variables into the Tailwind theme tokens', () => {
    expect(globalCss).toMatch(/--font-sans: var\(--font-inter\)/);
    expect(globalCss).toMatch(/--font-mono: var\(--font-jetbrains-mono\)/);
  });

  it('has no hard-coded family names left in stylesheets', () => {
    const stylesheets = ['src/app/globals.css', 'src/components/ConfirmDialog.css'];
    for (const stylesheet of stylesheets) {
      const css = read(stylesheet);
      expect(css).not.toMatch(/'Source Sans 3'/);
      expect(css).not.toMatch(/'JetBrains Mono'/);
    }
  });

  it('narrows the CSP now that no external font origin is used', () => {
    // The CSP moved out of next.config.ts into the per-request proxy in
    // issue #1545, because a static headers() value cannot carry a nonce.
    // The directives themselves are asserted in src/lib/csp.test.ts.
    const cspModule = read('src/lib/csp.ts');

    expect(cspModule).toMatch(/"font-src 'self' data:"/);
    expect(cspModule).toMatch(/"style-src 'self' 'unsafe-inline'"/);
    // No external font origin may reappear in the policy.
    expect(cspModule).not.toMatch(/fonts\.googleapis\.com/);
    expect(cspModule).not.toMatch(/fonts\.gstatic\.com/);
  });
});
