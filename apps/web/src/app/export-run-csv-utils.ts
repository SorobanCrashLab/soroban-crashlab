/**
 * Utility functions for building the Run History CSV export.
 */

import type { FuzzingRun } from './types';
import { csvEscape } from './csv-escape';

export interface CsvColumnDef {
  header: string;
  value: (run: FuzzingRun) => string | number;
}

export const CSV_COLUMN_DEFS: Record<string, CsvColumnDef> = {
  id: { header: 'ID', value: (run) => run.id },
  status: { header: 'Status', value: (run) => run.status },
  area: { header: 'Area', value: (run) => run.area },
  severity: { header: 'Severity', value: (run) => run.severity },
  duration: { header: 'Duration (ms)', value: (run) => run.duration.toFixed(0) },
  seedCount: { header: 'Seed Count', value: (run) => run.seedCount },
  cpuInstructions: { header: 'CPU Instructions', value: (run) => run.cpuInstructions },
  memoryBytes: { header: 'Memory (Bytes)', value: (run) => run.memoryBytes },
  minResourceFee: { header: 'Min Fee', value: (run) => run.minResourceFee },
};

export const ALL_CSV_COLUMNS = Object.keys(CSV_COLUMN_DEFS);

/**
 * Resolves which column ids should appear in the export.
 * Columns hidden in the table (absent from `visibleColumns`) are dropped
 * entirely rather than being emitted as empty columns. Unknown ids (e.g.
 * UI-only pseudo-columns like "actions" or "report") are ignored.
 */
export function resolveCsvColumns(visibleColumns?: string[]): string[] {
  if (!visibleColumns) {
    return ALL_CSV_COLUMNS;
  }
  return visibleColumns.filter((c) => c in CSV_COLUMN_DEFS);
}

/**
 * Builds the full CSV document (header row + one row per run) for the
 * given runs, restricted to the resolved set of visible columns.
 *
 * All field values (headers and data) are RFC-4180 escaped to handle
 * commas, double-quotes, and newlines correctly.
 */
export function buildRunsCsv(runs: FuzzingRun[], visibleColumns?: string[]): string {
  const cols = resolveCsvColumns(visibleColumns);
  const headers = cols.map((c) => csvEscape(CSV_COLUMN_DEFS[c].header));
  const rows = [
    headers.join(','),
    ...runs.map((run) =>
      cols.map((c) => csvEscape(CSV_COLUMN_DEFS[c].value(run))).join(',')
    ),
  ];
  return rows.join('\n');
}
