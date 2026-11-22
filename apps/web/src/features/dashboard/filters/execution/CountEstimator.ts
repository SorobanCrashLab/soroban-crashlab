/**
 * Fast approximate count estimator (#2194).
 *
 * For very large datasets where a full scan would be too slow, this
 * samples a subset of runs to estimate the match percentage, then
 * projects it against the known total.
 */

import type { FuzzingRun } from '@/app/types';
import type { FilterAST } from '../ast/FilterAST';
import { evaluate } from '../ast/visitors';

const SAMPLE_SIZE = 1000;

export function estimateCount(
  runs: FuzzingRun[],
  ast: FilterAST,
  totalKnown?: number,
): number {
  const total = totalKnown ?? runs.length;
  if (total === 0) return 0;

  if (runs.length <= SAMPLE_SIZE) {
    return runs.filter((run) => evaluate(ast, run)).length;
  }

  // Sample every Nth run for an approximate count.
  const step = Math.ceil(runs.length / SAMPLE_SIZE);
  let sampleMatches = 0;
  let sampled = 0;
  for (let i = 0; i < runs.length; i += step) {
    sampled++;
    if (evaluate(ast, runs[i])) sampleMatches++;
  }

  const ratio = sampleMatches / sampled;
  return Math.round(total * ratio);
}
