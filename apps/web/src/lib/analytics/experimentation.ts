/*
 * experimentation.ts — #2299
 * Flag/experiment registry models: variants, targeting, rollout stages, owners,
 * and change history.
 */

export interface ExperimentVariant {
  name: string;
  weight: number;
  targeting?: Record<string, string>;
}

export interface Experiment {
  id: string;
  name: string;
  status: 'draft' | 'running' | 'paused' | 'completed';
  variants: ExperimentVariant[];
  owner: string;
}
