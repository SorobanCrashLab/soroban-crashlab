import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Guards the self-hosted font setup (issue #1406).
 *
 * Source Sans 3 and JetBrains Mono used to be pulled from Google at runtime
 * via a stylesheet <link> plus two preconnects. `next/font` now downloads and
 * subsets them at build time, so a visitor's browser must never contact
 * fonts.googleapis.com or fonts.gstatic.com. These assertions fail loudly if a
 * future change reintroduces the runtime dependency.
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
    for (const source of [layout, globalCss, nextConfig]) {
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

  it('loads both families through next/font', () => {
    expect(fontsModule).toMatch(/from "next\/font\/google"/);
    expect(fontsModule).toMatch(/Source_Sans_3\(/);
    expect(fontsModule).toMatch(/JetBrains_Mono\(/);
  });

  it('covers latin and latin-ext so accented UI strings render', () => {
    const subsets = fontsModule.match(/subsets: \[[^\]]*\]/g) ?? [];
    expect(subsets).toHaveLength(2);
    for (const subset of subsets) {
      expect(subset).toContain('"latin"');
      expect(subset).toContain('"latin-ext"');
    }
  });

  it('preserves the four body weights and three mono weights', () => {
    const weights = fontsModule.match(/weight: \[[^\]]*\]/g) ?? [];
    expect(weights).toHaveLength(2);
    expect(weights[0]).toBe('weight: ["400", "500", "600", "700"]');
    expect(weights[1]).toBe('weight: ["400", "500", "600"]');
  });

  it('leaves font-display to the next/font default (swap)', () => {
    expect(fontsModule).not.toMatch(/^\s*display:/m);
  });

  it('wires the generated variables into the Tailwind theme tokens', () => {
    expect(globalCss).toMatch(/--font-sans: var\(--font-source-sans\)/);
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
    expect(nextConfig).toMatch(/"font-src 'self' data:"/);
    expect(nextConfig).toMatch(/"style-src 'self' 'unsafe-inline'"/);
  });
});
