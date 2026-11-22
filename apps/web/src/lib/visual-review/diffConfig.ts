/*
 * diffConfig.ts — #2298
 * Deterministic diff rendering config: thresholds, masks, mode selection.
 */

export type DiffMode = 'side-by-side' | 'onion-skin' | 'slider' | 'pixel-diff';

export interface DiffConfig {
  mode: DiffMode;
  threshold: number;
  maskRegions?: Array<{ x: number; y: number; w: number; h: number }>;
}

export const DEFAULT_DIFF_CONFIG: DiffConfig = {
  mode: 'side-by-side',
  threshold: 0,
};
