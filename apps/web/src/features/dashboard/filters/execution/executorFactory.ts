/**
 * Executor factory (#2194).
 *
 * Selects the appropriate execution strategy based on the row count.
 * Below 50k rows: client-side (fast, no network round-trip).
 * Above 50k rows: server-side (indexed query, paginated results).
 */

import type { FuzzingRun } from '@/app/types';
import type { FilterAST } from '../ast/FilterAST';
import { executeClientFilter, countClientMatches } from './ClientFilterExecutor';
import { executeServerFilter, countServerMatches } from './ServerFilterExecutor';

export const SERVER_THRESHOLD = 50_000;

export type ExecutorType = 'client' | 'server';

export function selectExecutor(rowCount: number): ExecutorType {
  return rowCount >= SERVER_THRESHOLD ? 'server' : 'client';
}

export async function executeFilter(
  runs: FuzzingRun[],
  ast: FilterAST,
  rowCount?: number,
): Promise<{ results: FuzzingRun[]; count: number; executor: ExecutorType }> {
  const effectiveRowCount = rowCount ?? runs.length;
  const type = selectExecutor(effectiveRowCount);

  if (type === 'client') {
    const results = executeClientFilter(runs, ast);
    return { results, count: results.length, executor: 'client' };
  }

  const serverResult = await executeServerFilter(ast);
  return { results: serverResult.runs, count: serverResult.count, executor: 'server' };
}

export async function countFilter(
  runs: FuzzingRun[],
  ast: FilterAST,
  rowCount?: number,
): Promise<{ count: number; executor: ExecutorType }> {
  const effectiveRowCount = rowCount ?? runs.length;
  const type = selectExecutor(effectiveRowCount);

  if (type === 'client') {
    return { count: countClientMatches(runs, ast), executor: 'client' };
  }

  return { count: await countServerMatches(ast), executor: 'server' };
}
