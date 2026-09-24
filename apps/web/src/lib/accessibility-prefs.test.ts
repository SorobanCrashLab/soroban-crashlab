import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACCESSIBILITY_PREFS,
  parseAccessibilityPrefs,
} from './accessibility-prefs';

describe('accessibility prefs', () => {
  it('round-trips valid prefs and heals invalid values', () => {
    expect(parseAccessibilityPrefs(DEFAULT_ACCESSIBILITY_PREFS)).toEqual(DEFAULT_ACCESSIBILITY_PREFS);
    expect(parseAccessibilityPrefs({ motion: 'nope', textScale: 999, contrast: 'nope' })).toEqual(
      DEFAULT_ACCESSIBILITY_PREFS,
    );
    expect(parseAccessibilityPrefs({ motion: 'reduced', textScale: 125, contrast: 'high' })).toEqual({
      motion: 'reduced',
      textScale: 125,
      contrast: 'high',
    });
  });
});
