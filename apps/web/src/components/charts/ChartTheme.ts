export interface ChartTheme {
  text: string;
  muted: string;
  grid: string;
  surface: string;
  focus: string;
  palette: readonly string[];
}

export const DEFAULT_CHART_THEME: ChartTheme = {
  text: 'var(--ds-color-text-primary, currentColor)',
  muted: 'var(--ds-color-text-secondary, #737373)',
  grid: 'var(--ds-color-border, #d4d4d4)',
  surface: 'var(--ds-color-surface, #ffffff)',
  focus: 'var(--ds-color-focus, #111111)',
  palette: [
    'var(--ds-color-info-text, #1e40af)',
    'var(--ds-color-success-text, #166534)',
    'var(--ds-color-warning-text, #854d0e)',
    'var(--ds-color-error-text, #b91c1c)',
    '#7c3aed',
    '#0891b2',
  ],
};

export function resolveSeriesColor(color: string | undefined, index: number, theme = DEFAULT_CHART_THEME): string {
  return color ?? theme.palette[index % theme.palette.length] ?? theme.text;
}
