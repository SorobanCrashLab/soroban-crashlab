/**
 * Pure helpers for the issue triage board page.
 */

import type { FuzzingRun, RunStatus } from '../types';

export type TriageColumn = 'failed' | 'active' | 'cancelled';

export interface TriageColumnDef {
  id: TriageColumn;
  title: string;
  statuses: RunStatus[];
}

export const TRIAGE_COLUMNS: TriageColumnDef[] = [
  { id: 'failed',    title: 'Failed',    statuses: ['failed']    },
  { id: 'active',    title: 'Active',    statuses: ['running']   },
  { id: 'cancelled', title: 'Cancelled', statuses: ['cancelled'] },
];

/** Returns runs belonging to a triage column. */
export function getColumnRuns(runs: FuzzingRun[], column: TriageColumnDef): FuzzingRun[] {
  return runs.filter((r) => (column.statuses as string[]).includes(r.status));
}

/** Returns a summary count map for all columns. */
export function getColumnCounts(runs: FuzzingRun[]): Record<TriageColumn, number> {
  return {
    failed:    getColumnRuns(runs, TRIAGE_COLUMNS[0]).length,
    active:    getColumnRuns(runs, TRIAGE_COLUMNS[1]).length,
    cancelled: getColumnRuns(runs, TRIAGE_COLUMNS[2]).length,
  };
}
