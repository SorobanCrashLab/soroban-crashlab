/**
 * WCAG contrast helpers and the status-colour tokens used by badges (#1884).
 *
 * Status badges previously relied on colour alone (`bg-*-50 text-*-700`) with
 * no measured contrast guarantee and no non-colour cue. Every token here is
 * asserted to clear WCAG 2.2 AA text contrast (4.5:1) in `contrast.test.ts`,
 * and every status also carries a distinct glyph + text label so the meaning
 * survives greyscale/colour-blind rendering.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parses `#rgb` / `#rrggbb`; returns null for anything else. */
export function parseHexColor(value: string): Rgb | null {
  if (typeof value !== 'string') return null;
  const hex = value.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(hex)) return null;
  const expanded =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex;
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

function channelLuminance(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: string | Rgb): number | null {
  const rgb = typeof color === 'string' ? parseHexColor(color) : color;
  if (!rgb) return null;
  return (
    0.2126 * channelLuminance(rgb.r) +
    0.7152 * channelLuminance(rgb.g) +
    0.0722 * channelLuminance(rgb.b)
  );
}

/**
 * WCAG 2.x contrast ratio between two colours. Invalid colours return `null`
 * rather than a misleading 1:1 result.
 */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  if (fg === null || bg === null) return null;
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

export type ContrastLevel = 'AA' | 'AAA';

/** Minimum ratio for normal-size text; large text is out of scope here. */
export const TEXT_CONTRAST_MINIMUM: Record<ContrastLevel, number> = {
  AA: 4.5,
  AAA: 7,
};

/** WCAG 1.4.11 non-text contrast (borders, icons, focus indicators). */
export const NON_TEXT_CONTRAST_MINIMUM = 3;

export function meetsContrast(
  foreground: string,
  background: string,
  minimum: number,
): boolean {
  const ratio = contrastRatio(foreground, background);
  return ratio !== null && ratio >= minimum;
}

export type StatusTone =
  | 'neutral'
  | 'running'
  | 'passed'
  | 'failed'
  | 'paused'
  | 'cancelled'
  | 'timeout';

export interface StatusColorToken {
  tone: StatusTone;
  foreground: string;
  background: string;
  border: string;
  /** Non-colour cue; rendered `aria-hidden` next to the text label. */
  symbol: string;
}

/**
 * Fixed light-mode chips. They are intentionally theme-independent: a pale
 * chip with dark text keeps its 4.5:1 ratio on both light and dark page
 * backgrounds.
 */
export const STATUS_COLOR_TOKENS: Record<StatusTone, StatusColorToken> = {
  neutral: {
    tone: 'neutral',
    foreground: '#3f3f46',
    background: '#f4f4f5',
    border: '#71717a',
    symbol: '●',
  },
  running: {
    tone: 'running',
    foreground: '#312e81',
    background: '#eef2ff',
    border: '#6366f1',
    symbol: '▶',
  },
  passed: {
    tone: 'passed',
    foreground: '#14532d',
    background: '#ecfdf5',
    border: '#047857',
    symbol: '✓',
  },
  failed: {
    tone: 'failed',
    foreground: '#7f1d1d',
    background: '#fef2f2',
    border: '#ef4444',
    symbol: '✕',
  },
  paused: {
    tone: 'paused',
    foreground: '#78350f',
    background: '#fffbeb',
    border: '#b45309',
    symbol: '❚❚',
  },
  cancelled: {
    tone: 'cancelled',
    foreground: '#3f3f46',
    background: '#e4e4e7',
    border: '#71717a',
    symbol: '■',
  },
  timeout: {
    tone: 'timeout',
    foreground: '#7c2d12',
    background: '#fff7ed',
    border: '#c2410c',
    symbol: '▲',
  },
};

const STATUS_ALIASES: Record<string, StatusTone> = {
  idle: 'neutral',
  queued: 'neutral',
  pending: 'neutral',
  running: 'running',
  in_progress: 'running',
  passed: 'passed',
  completed: 'passed',
  success: 'passed',
  failed: 'failed',
  error: 'failed',
  paused: 'paused',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  timeout: 'timeout',
  timed_out: 'timeout',
};

/** Maps a loose status string onto a measured tone; unknown values are neutral. */
export function statusToneFor(status: string | null | undefined): StatusTone {
  if (!status) return 'neutral';
  return STATUS_ALIASES[status.trim().toLowerCase()] ?? 'neutral';
}

export function statusColorToken(status: string | null | undefined): StatusColorToken {
  return STATUS_COLOR_TOKENS[statusToneFor(status)];
}
