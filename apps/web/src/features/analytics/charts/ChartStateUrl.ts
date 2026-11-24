/**
 * Shareable URL state for charts (#2302): selected range, series, normalization
 * and comparison toggle round-trip through query parameters.
 */

import type { NormalizeMode } from '../../../components/charts/transforms/normalize';

export interface ChartUrlState {
  /** Visible range as epoch ms, or null for the full range. */
  range: [number, number] | null;
  /** Visible series ids, in order. */
  series: string[];
  normalize: NormalizeMode;
  /** Overlay the previous period for comparison. */
  compare: boolean;
}

export const DEFAULT_CHART_STATE: ChartUrlState = {
  range: null,
  series: [],
  normalize: 'none',
  compare: false,
};

const NORMALIZE_MODES: NormalizeMode[] = ['none', 'percent', 'zscore', 'index'];

export function encodeChartState(state: ChartUrlState): string {
  const p = new URLSearchParams();
  if (state.range) p.set('range', `${state.range[0]}-${state.range[1]}`);
  if (state.series.length) p.set('series', state.series.join(','));
  if (state.normalize !== 'none') p.set('norm', state.normalize);
  if (state.compare) p.set('compare', '1');
  return p.toString();
}

export function decodeChartState(query: string | URLSearchParams): ChartUrlState {
  const p = typeof query === 'string' ? new URLSearchParams(query) : query;
  const state: ChartUrlState = { ...DEFAULT_CHART_STATE, series: [] };

  const range = p.get('range')?.match(/^(\d+)-(\d+)$/);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    if (from < to) state.range = [from, to];
  }

  const series = p.get('series');
  if (series) state.series = series.split(',').map((s) => s.trim()).filter(Boolean);

  const norm = p.get('norm') as NormalizeMode | null;
  if (norm && NORMALIZE_MODES.includes(norm)) state.normalize = norm;

  state.compare = p.get('compare') === '1';
  return state;
}
