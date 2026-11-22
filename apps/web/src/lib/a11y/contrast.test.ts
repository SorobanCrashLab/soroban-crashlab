import { describe, expect, it } from 'vitest';
import {
  NON_TEXT_CONTRAST_MINIMUM,
  STATUS_COLOR_TOKENS,
  TEXT_CONTRAST_MINIMUM,
  contrastRatio,
  meetsContrast,
  parseHexColor,
  relativeLuminance,
  statusColorToken,
  statusToneFor,
} from './contrast';

describe('WCAG contrast helpers', () => {
  it('parses three- and six-digit hex colours', () => {
    expect(parseHexColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHexColor('000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseHexColor('#7f1d1d')).toEqual({ r: 127, g: 29, b: 29 });
    expect(parseHexColor('rebeccapurple')).toBeNull();
    expect(parseHexColor('#12345')).toBeNull();
  });

  it('computes the canonical black/white ratio', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('not-a-colour', '#ffffff')).toBeNull();
    expect(relativeLuminance('not-a-colour')).toBeNull();
  });

  it('applies AA and AAA thresholds', () => {
    expect(meetsContrast('#000000', '#ffffff', TEXT_CONTRAST_MINIMUM.AA)).toBe(true);
    expect(meetsContrast('#666666', '#ffffff', TEXT_CONTRAST_MINIMUM.AA)).toBe(true);
    expect(meetsContrast('#999999', '#ffffff', TEXT_CONTRAST_MINIMUM.AA)).toBe(false);
  });

  it('keeps every status chip readable at 4.5:1 (WCAG 2.2 AA)', () => {
    for (const token of Object.values(STATUS_COLOR_TOKENS)) {
      const ratio = contrastRatio(token.foreground, token.background);
      expect(ratio, `${token.tone} text contrast`).not.toBeNull();
      expect(ratio as number, `${token.tone} text contrast`).toBeGreaterThanOrEqual(
        TEXT_CONTRAST_MINIMUM.AA,
      );

      const borderRatio = contrastRatio(token.border, token.background);
      expect(borderRatio, `${token.tone} border contrast`).not.toBeNull();
      expect(borderRatio as number, `${token.tone} border contrast`).toBeGreaterThanOrEqual(
        NON_TEXT_CONTRAST_MINIMUM,
      );
    }
  });

  it('gives each status a distinct non-colour cue', () => {
    const symbols = Object.values(STATUS_COLOR_TOKENS).map((token) => token.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
    for (const symbol of symbols) expect(symbol.length).toBeGreaterThan(0);
  });

  it('maps loose status strings onto measured tones', () => {
    expect(statusToneFor('RUNNING')).toBe('running');
    expect(statusToneFor('completed')).toBe('passed');
    expect(statusToneFor('timed_out')).toBe('timeout');
    expect(statusToneFor('../../../etc/passwd')).toBe('neutral');
    expect(statusToneFor(null)).toBe('neutral');
    expect(statusColorToken('failed')).toBe(STATUS_COLOR_TOKENS.failed);
  });
});
