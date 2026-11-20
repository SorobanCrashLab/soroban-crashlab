/**
 * Server-side filter executor (#2194).
 *
 * Sends the filter AST to the API for server-side execution. Used when
 * the dataset exceeds the client threshold (50k rows).
 */

import type { FuzzingRun } from '@/app/types';
import type { FilterAST } from '../ast/FilterAST';

export interface ServerFilterResult {
  count: number;
  runs: FuzzingRun[];
}

export async function executeServerFilter(
  ast: FilterAST,
  limit: number = 100,
): Promise<ServerFilterResult> {
  const response = await fetch('/api/filters/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ast, limit }),
  });

  if (!response.ok) {
    throw new Error(`Server filter execution failed: ${response.status}`);
  }

  return (await response.json()) as ServerFilterResult;
}

export async function countServerMatches(ast: FilterAST): Promise<number> {
  const response = await fetch('/api/filters/count', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ast }),
  });

  if (!response.ok) {
    throw new Error(`Server filter count failed: ${response.status}`);
  }

  const data = (await response.json()) as { count: number };
  return data.count;
}
