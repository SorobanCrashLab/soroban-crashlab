import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const TOKEN_DIR = path.join(__dirname, 'tokens');
const readCss = (file: string) => readFileSync(path.join(TOKEN_DIR, file), 'utf8');

function readHexTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const match of css.matchAll(/--([\w-]+):\s*(#[\da-f]{6})\s*;/gi)) {
    tokens.set(match[1], match[2]);
  }
  return tokens;
}

function requiredToken(tokens: Map<string, string>, name: string): string {
  const value = tokens.get(name);
  if (!value) throw new Error(`Missing color token: ${name}`);
  return value;
}

function blockAfter(css: string, selector: string): string {
  const selectorIndex = css.indexOf(selector);
  if (selectorIndex < 0) throw new Error(`Missing token selector: ${selector}`);
  const openBrace = css.indexOf('{', selectorIndex);
  const closeBrace = css.indexOf('}', openBrace);
  if (openBrace < 0 || closeBrace < 0) throw new Error(`Invalid token block: ${selector}`);
  return css.slice(openBrace + 1, closeBrace);
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = hex.match(/[\da-f]{2}/gi);
    if (!channels || channels.length !== 3) throw new Error(`Invalid hex color: ${hex}`);
    const [red, green, blue] = channels.map((channel) => {
      const value = Number.parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function expectTextContrast(tokens: Map<string, string>, minimum = 4.5) {
  for (const intent of ['success', 'warning', 'error', 'info', 'neutral']) {
    const foreground = requiredToken(tokens, `ds-color-${intent}-text`);
    const background = requiredToken(tokens, `ds-color-${intent}-bg`);
    expect(contrastRatio(foreground, background), `${intent} contrast ratio`).toBeGreaterThanOrEqual(minimum);
  }
}

describe('design token accessibility', () => {
  it('keeps semantic status text at WCAG AA contrast in light and dark themes', () => {
    expectTextContrast(readHexTokens(readCss('themes/light.css')));
    expectTextContrast(readHexTokens(readCss('themes/dark.css')));
  });

  it('keeps primary text and controls distinguishable from their surfaces', () => {
    for (const file of ['themes/light.css', 'themes/dark.css']) {
      const tokens = readHexTokens(readCss(file));
      const surface = requiredToken(tokens, 'ds-color-background');
      expect(contrastRatio(requiredToken(tokens, 'ds-color-text-primary'), surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(requiredToken(tokens, 'ds-color-border'), surface)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(
        requiredToken(tokens, 'ds-color-action-primary-text'),
        requiredToken(tokens, 'ds-color-action-primary-bg'),
      )).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps text and status pairs high contrast in light and dark high-contrast modes', () => {
    const highContrast = readCss('themes/high-contrast.css');
    const lightTokens = readHexTokens(blockAfter(highContrast, '.high-contrast {'));
    const darkTokens = readHexTokens(blockAfter(highContrast, '.high-contrast.dark,'));

    expect(contrastRatio(
      requiredToken(lightTokens, 'ds-color-text-primary'),
      requiredToken(lightTokens, 'ds-color-background'),
    )).toBeGreaterThanOrEqual(7);
    expectTextContrast(lightTokens, 7);
    expect(contrastRatio(
      requiredToken(darkTokens, 'ds-color-text-primary'),
      requiredToken(darkTokens, 'ds-color-background'),
    )).toBeGreaterThanOrEqual(7);
    expectTextContrast(darkTokens, 7);
  });

  it('provides reduced-motion values for system and user preferences', () => {
    const motion = readCss('motion.css');
    expect(motion).toContain('@media (prefers-reduced-motion: reduce)');
    expect(motion).toContain('html[data-motion="reduced"]');
    expect(motion).toMatch(/--motion-duration-normal:\s*0ms/);
  });
});
