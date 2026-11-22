/**
 * Flakiness classification for recurring crash signatures.
 *
 * #1374 — degenerate replay counts. A signature with fewer than `MIN_REPLAYS`
 * observed replays cannot support a variance-based flakiness score, so it is
 * classified `INSUFFICIENT` and the division-based score is never reached for
 * such small sample sizes. This is degenerate-case handling only — threshold
 * values are not tuned here.
 */

export type FlakinessTier = 'FLAKY' | 'STABLE' | 'INSUFFICIENT';

/** Minimum number of replays required for flakiness analysis. */
export const MIN_REPLAYS = 2;

/**
 * Score (0-100) above which a signature is considered FLAKY. Values at or
 * below this threshold are STABLE.
 */
export const FLAKINESS_THRESHOLD = 40;

/**
 * Variance score in the 0-100 range: the share of outcomes that disagree with
 * the majority replay outcome. 0 means all replays agreed; 100 means the
 * outcome is evenly split. Requires `results.length >= 1`; callers must guard
 * for `replay_count < MIN_REPLAYS` before invoking this.
 */
export function computeVarianceScore(results: boolean[]): number {
  if (results.length === 0) return 0;
  const trues = results.filter(Boolean).length;
  const minority = Math.min(trues, results.length - trues);
  return (minority / results.length) * 100;
}

/**
 * Classifies a signature from a raw replay count and per-replay outcomes.
 * Returns `INSUFFICIENT` before any score is computed when
 * `replayCount < MIN_REPLAYS`, so the division in `computeVarianceScore` is
 * never reached for degenerate sample sizes.
 */
export function classifyFlakyRun(replayCount: number, results: boolean[]): FlakinessTier {
  if (replayCount < MIN_REPLAYS) {
    return 'INSUFFICIENT';
  }
  const score = computeVarianceScore(results);
  return score > FLAKINESS_THRESHOLD ? 'FLAKY' : 'STABLE';
}

/**
 * Classifies a signature already aggregated with an observed occurrence count
 * and a 0-100 flakiness score. Occurrence counts below `MIN_REPLAYS` are
 * `INSUFFICIENT`.
 */
export function classifyFlakySignature(occurrences: number, score: number): FlakinessTier {
  if (occurrences < MIN_REPLAYS) {
    return 'INSUFFICIENT';
  }
  return score > FLAKINESS_THRESHOLD ? 'FLAKY' : 'STABLE';
}
