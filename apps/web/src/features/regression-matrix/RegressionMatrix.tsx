'use client';

/*
 * Regression & Compatibility Matrix UI (#2329).
 *
 * Matrix builder + accessible table with text status encodings, baseline
 * regression highlights, flake overlays, dimension insights and CSV export.
 */
import { useMemo, useState } from 'react';
import {
  buildMatrix,
  detectRegressions,
  exportMatrixCsv,
  isolateDimensions,
  type MatrixAxis,
  type MatrixMetric,
  type RunOutcome,
} from './model';

interface RegressionMatrixProps {
  runs: RunOutcome[];
  baselines?: RunOutcome[];
}

const AXES: MatrixAxis[] = ['version', 'environment', 'target', 'runner', 'seedSet'];
const METRICS: MatrixMetric[] = ['status', 'crashRate', 'signatureCount'];

export function RegressionMatrix({ runs, baselines = [] }: RegressionMatrixProps) {
  const [rowAxis, setRowAxis] = useState<MatrixAxis>('version');
  const [columnAxis, setColumnAxis] = useState<MatrixAxis>('environment');
  const [metric, setMetric] = useState<MatrixMetric>('crashRate');

  const matrix = useMemo(
    () => buildMatrix(runs, rowAxis, columnAxis, metric),
    [runs, rowAxis, columnAxis, metric],
  );
  const baselineMatrix = useMemo(
    () => (baselines.length ? buildMatrix(baselines, rowAxis, columnAxis, metric) : null),
    [baselines, rowAxis, columnAxis, metric],
  );
  const regressions = useMemo(
    () => (baselineMatrix ? detectRegressions(matrix, baselineMatrix) : []),
    [matrix, baselineMatrix],
  );
  const insights = useMemo(() => isolateDimensions(runs, AXES), [runs]);
  const regressionKeys = useMemo(
    () => new Set(regressions.map((item) => `${item.row}::${item.column}`)),
    [regressions],
  );

  const exportCsv = () => {
    const blob = new Blob([exportMatrixCsv(matrix)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'regression-matrix.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-labelledby="regression-matrix-heading" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="matrix-row-axis">Rows</label>
        <select id="matrix-row-axis" value={rowAxis}
          onChange={(event) => setRowAxis(event.target.value as MatrixAxis)}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1">
          {AXES.map((axis) => <option key={axis} value={axis}>{axis}</option>)}
        </select>
        <label htmlFor="matrix-column-axis">Columns</label>
        <select id="matrix-column-axis" value={columnAxis}
          onChange={(event) => setColumnAxis(event.target.value as MatrixAxis)}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1">
          {AXES.map((axis) => <option key={axis} value={axis}>{axis}</option>)}
        </select>
        <label htmlFor="matrix-metric">Metric</label>
        <select id="matrix-metric" value={metric}
          onChange={(event) => setMetric(event.target.value as MatrixMetric)}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1">
          {METRICS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" onClick={exportCsv} className="rounded border border-slate-700 px-3 py-1">
          Export CSV
        </button>
      </div>

      <table className="w-full text-left text-sm">
        <caption className="sr-only">
          Compatibility matrix: {rowAxis} by {columnAxis}, metric {metric}. Status is written as text.
        </caption>
        <thead>
          <tr>
            <th scope="col">{rowAxis} \ {columnAxis}</th>
            {matrix.columns.map((column) => <th key={column} scope="col">{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row}>
              <th scope="row">{row}</th>
              {matrix.columns.map((column) => {
                const cell = matrix.cells.find((item) => item.row === row && item.column === column);
                if (!cell) return <td key={column}>—</td>;
                const regressed = regressionKeys.has(`${row}::${column}`);
                return (
                  <td key={column} className="border border-slate-800 px-2 py-1">
                    <span className="font-semibold">{cell.statusLabel}</span>
                    {regressed && <span className="ml-1 text-rose-300" title="Regression vs baseline">↓ regression</span>}
                    {cell.flakyRuns > 0 && <span className="ml-1 text-amber-300">{cell.flakyRuns} flaky</span>}
                    <div className="text-xs text-slate-400">
                      {cell.runs} runs · {cell.crashRate.toFixed(2)} crash rate
                    </div>
                    {cell.topSignatures.length > 0 && (
                      <div className="font-mono text-xs">{cell.topSignatures.join(', ')}</div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div>
        <h2 className="heading-section">Dimension isolation</h2>
        <ul className="space-y-1 text-sm">
          {insights.map((insight) => <li key={insight}>{insight}</li>)}
          {insights.length === 0 && <li className="text-meta">No single dimension explains all failures.</li>}
        </ul>
      </div>

      {regressions.length > 0 && (
        <div>
          <h2 className="heading-section">Regressions vs baseline</h2>
          <ul className="space-y-1 text-sm">
            {regressions.map((item) => (
              <li key={`${item.row}-${item.column}`}>
                {item.row}/{item.column}: {item.baseline} → {item.current} ({item.delta}), confidence {item.confidence}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
