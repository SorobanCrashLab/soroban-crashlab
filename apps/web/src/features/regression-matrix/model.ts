/*
 * Multi-Run Regression & Compatibility Matrix (#2329).
 *
 * Pure aggregation model: build multi-dimensional matrices from runs, detect
 * regressions against baselines, isolate responsible dimensions, annotate
 * flaky cells and produce deterministic exports. No colour-only encodings.
 */

export type MatrixAxis = 'version' | 'environment' | 'target' | 'runner' | 'seedSet';
export type RunStatus = 'pass' | 'fail' | 'crash' | 'error';
export type MatrixMetric = 'status' | 'crashRate' | 'signatureCount' | 'durationMs';

export interface RunOutcome {
  id: string;
  axes: Record<MatrixAxis, string>;
  status: RunStatus;
  crashRate: number;
  signatureIds: string[];
  durationMs: number;
  flaky?: boolean;
}

export interface MatrixCell {
  row: string;
  column: string;
  runs: number;
  passed: number;
  failed: number;
  crashed: number;
  crashRate: number;
  topSignatures: string[];
  status: 'pass' | 'warn' | 'fail' | 'no-data';
  statusLabel: string;
  flakyRuns: number;
}

export interface Matrix {
  rowAxis: MatrixAxis;
  columnAxis: MatrixAxis;
  metric: MatrixMetric;
  rows: string[];
  columns: string[];
  cells: MatrixCell[];
}

export interface Regression {
  row: string;
  column: string;
  metric: MatrixMetric;
  baseline: number;
  current: number;
  delta: number;
  confidence: 'low' | 'medium' | 'high';
}

const STATUS_LABELS: Record<MatrixCell['status'], string> = {
  pass: 'PASS',
  warn: 'WARN',
  fail: 'FAIL',
  'no-data': 'NO DATA',
};

/** Build a deterministic matrix by two axes. */
export function buildMatrix(
  runs: RunOutcome[],
  rowAxis: MatrixAxis,
  columnAxis: MatrixAxis,
  metric: MatrixMetric,
): Matrix {
  const rows = [...new Set(runs.map((run) => run.axes[rowAxis]))].sort();
  const columns = [...new Set(runs.map((run) => run.axes[columnAxis]))].sort();
  const cells: MatrixCell[] = [];

  for (const row of rows) {
    for (const column of columns) {
      const cellRuns = runs.filter(
        (run) => run.axes[rowAxis] === row && run.axes[columnAxis] === column,
      );
      const signatures = new Map<string, number>();
      for (const run of cellRuns) {
        for (const signature of run.signatureIds) {
          signatures.set(signature, (signatures.get(signature) ?? 0) + 1);
        }
      }
      const crashRate = cellRuns.length ? cellRuns.reduce((s, r) => s + r.crashRate, 0) / cellRuns.length : 0;
      const passRate = cellRuns.length ? cellRuns.filter((r) => r.status === 'pass').length / cellRuns.length : 0;
      const status: MatrixCell['status'] = cellRuns.length === 0
        ? 'no-data'
        : crashRate > 0.25 || passRate < 0.5 ? 'fail'
          : crashRate > 0 || passRate < 1 ? 'warn' : 'pass';

      cells.push({
        row,
        column,
        runs: cellRuns.length,
        passed: cellRuns.filter((r) => r.status === 'pass').length,
        failed: cellRuns.filter((r) => r.status === 'fail').length,
        crashed: cellRuns.filter((r) => r.status === 'crash').length,
        crashRate: Math.round(crashRate * 1000) / 1000,
        topSignatures: [...signatures.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 3)
          .map(([signature]) => signature),
        status,
        statusLabel: STATUS_LABELS[status],
        flakyRuns: cellRuns.filter((r) => r.flaky).length,
      });
    }
  }
  return { rowAxis, columnAxis, metric, rows, columns, cells };
}

/** Cell value for the selected metric (status uses pass rate). */
export function cellMetric(cell: MatrixCell, metric: MatrixMetric): number {
  if (cell.runs === 0) return 0;
  switch (metric) {
    case 'crashRate': return cell.crashRate;
    case 'signatureCount': return cell.topSignatures.length;
    case 'durationMs': return 0; // raw durations are aggregated in `runs`, not retained per cell
    case 'status': return cell.passed / cell.runs;
  }
}

/** Compare cells against a baseline matrix and rank by absolute delta. */
export function detectRegressions(current: Matrix, baseline: Matrix): Regression[] {
  const baselineCells = new Map(baseline.cells.map((cell) => [`${cell.row}::${cell.column}`, cell]));
  const regressions: Regression[] = [];
  for (const cell of current.cells) {
    const old = baselineCells.get(`${cell.row}::${cell.column}`);
    if (!old) continue;
    const before = cellMetric(old, current.metric);
    const after = cellMetric(cell, current.metric);
    const delta = Math.round((after - before) * 1000) / 1000;
    const improving = current.metric === 'status' ? delta > 0 : delta < 0;
    if (improving) continue;
    regressions.push({
      row: cell.row,
      column: cell.column,
      metric: current.metric,
      baseline: before,
      current: after,
      delta,
      confidence: cell.runs >= 20 ? 'high' : cell.runs >= 5 ? 'medium' : 'low',
    });
  }
  return regressions.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.row.localeCompare(b.row));
}

/** Human-readable hints about which dimension correlates with failures. */
export function isolateDimensions(runs: RunOutcome[], axes: MatrixAxis[]): string[] {
  const insights: string[] = [];
  for (const axis of axes) {
    const groups = new Map<string, RunOutcome[]>();
    for (const run of runs) {
      const value = run.axes[axis];
      groups.set(value, [...(groups.get(value) ?? []), run]);
    }
    for (const [value, grouped] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const failed = grouped.filter((run) => run.status !== 'pass').length;
      if (grouped.length >= 3 && failed === grouped.length) {
        insights.push(`${axis}=${value} fails in all ${grouped.length} runs`);
      }
    }
  }
  return insights;
}

/** Deterministic CSV export with a non-colour status column. */
export function exportMatrixCsv(matrix: Matrix): string {
  const header = ['row', 'column', 'runs', 'passed', 'failed', 'crashed', 'crashRate', 'status', 'topSignatures', 'flakyRuns'];
  const lines = matrix.cells.map((cell) => [
    cell.row,
    cell.column,
    String(cell.runs),
    String(cell.passed),
    String(cell.failed),
    String(cell.crashed),
    cell.crashRate.toFixed(3),
    cell.statusLabel,
    cell.topSignatures.join('|'),
    String(cell.flakyRuns),
  ].join(','));
  return [header.join(','), ...lines].join('\n');
}
