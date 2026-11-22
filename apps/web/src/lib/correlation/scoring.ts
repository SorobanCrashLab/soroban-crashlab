/**
 * Correlation scoring (#2304). Each shared piece of metadata is a signal with a
 * weight; signals combine with noisy-OR so independent evidence reinforces
 * without ever exceeding 1.
 */

import type { CorrelationArtifact, Signal, SignalKind } from './model';

export type SignalWeights = Record<SignalKind, number>;

export const BASE_WEIGHTS: SignalWeights = {
  content_hash: 0.95,
  run_id: 0.9,
  trace_id: 0.9,
  signature: 0.6,
  commit_env: 0.35,
  time_proximity: 0.3,
};

/** Artifacts further apart than this get no time-proximity credit. */
export const TIME_WINDOW_MS = 60_000;

export function combineConfidence(weights: number[]): number {
  return Number((1 - weights.reduce((p, w) => p * (1 - Math.min(Math.max(w, 0), 1)), 1)).toFixed(4));
}

export function signalsBetween(a: CorrelationArtifact, b: CorrelationArtifact, weights: SignalWeights = BASE_WEIGHTS): Signal[] {
  const signals: Signal[] = [];
  if (a.contentHash && a.contentHash === b.contentHash) {
    signals.push({ kind: 'content_hash', weight: weights.content_hash, reason: `identical content hash ${a.contentHash.slice(0, 12)}` });
  }
  const aRun = a.runId ?? (a.type === 'run' ? a.id : undefined);
  const bRun = b.runId ?? (b.type === 'run' ? b.id : undefined);
  if (aRun && aRun === bRun) signals.push({ kind: 'run_id', weight: weights.run_id, reason: `same run ${aRun}` });
  const aTrace = a.traceId ?? (a.type === 'trace' ? a.id : undefined);
  const bTrace = b.traceId ?? (b.type === 'trace' ? b.id : undefined);
  if (aTrace && aTrace === bTrace) signals.push({ kind: 'trace_id', weight: weights.trace_id, reason: `same trace ${aTrace}` });
  if (a.signature && a.signature === b.signature) {
    signals.push({ kind: 'signature', weight: weights.signature, reason: `same failure signature "${a.signature}"` });
  }
  if (a.commit && a.commit === b.commit && a.env && a.env === b.env) {
    signals.push({ kind: 'commit_env', weight: weights.commit_env, reason: `same commit ${a.commit.slice(0, 8)} and environment ${a.env}` });
  }
  const gap = Math.abs(a.timestamp - b.timestamp);
  if (gap <= TIME_WINDOW_MS && signals.length > 0) {
    // Time proximity only corroborates other evidence; alone it is too noisy.
    signals.push({
      kind: 'time_proximity',
      weight: Number((weights.time_proximity * (1 - gap / TIME_WINDOW_MS)).toFixed(4)),
      reason: `produced ${Math.round(gap / 1000)}s apart`,
    });
  }
  return signals;
}
