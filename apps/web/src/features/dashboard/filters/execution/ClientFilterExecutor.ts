/**
 * Client-side filter executor (#2194).
 *
 * Evaluates the filter AST against an array of FuzzingRun objects in the
 * main thread. For datasets under 50k rows this is fast enough without a
 * Web Worker; the executor factory selects server-side execution above that.
 */

import type { FuzzingRun } from '@/app/types';
import type { FilterAST } from '../ast/FilterAST';
import { evaluate, countMatches } from '../ast/visitors';

export function executeClientFilter(runs: FuzzingRun[], ast: FilterAST): FuzzingRun[] {
  return runs.filter((run) => evaluate(ast, run));
}

export function countClientMatches(runs: FuzzingRun[], ast: FilterAST): number {
  return countMatches(runs, ast);
}
