import { describe, expect, it } from 'vitest';
import {
  buildMatrix,
  cellMetric,
  detectRegressions,
  exportMatrixCsv,
  isolateDimensions,
  type RunOutcome,
} from './model';

function run(overrides: Partial<RunOutcome> = {}): RunOutcome {
  return {
    id: 'r1',
    axes: { version: 'v1', environment: 'testnet', target: 'wasm', runner: 'local', seedSet: 's1' },
    status: 'pass',
    crashRate: 0,
    signatureIds: [],
    durationMs: 100,
    ...overrides,
  };
}

describe('buildMatrix', () => {
  it('aggregates runs by two axes with sorted rows and columns', () => {
    const matrix = buildMatrix([
      run({ id: 'a', axes: { ...run().axes, version: 'v2' } }),
      run({ id: 'b', axes: { ...run().axes, version: 'v1', environment: 'mainnet' }, status: 'crash', crashRate: 1, signatureIds: ['SIG-1'] }),
    ], 'version', 'environment', 'status');

    expect(matrix.rows).toEqual(['v1', 'v2']);
    expect(matrix.columns).toEqual(['mainnet', 'testnet']);
    const failing = matrix.cells.find((cell) => cell.row === 'v1' && cell.column === 'mainnet');
    expect(failing).toMatchObject({ runs: 1, crashed: 1, status: 'fail', statusLabel: 'FAIL', topSignatures: ['SIG-1'] });
  });

  it('is deterministic for the same inputs', () => {
    const runs = [run(), run({ id: 'b', axes: { ...run().axes, version: 'v2' } })];
    expect(buildMatrix(runs, 'version', 'runner', 'status')).toEqual(
      buildMatrix([...runs].reverse(), 'version', 'runner', 'status'),
    );
  });

  it('uses non-colour status labels including NO DATA', () => {
    const matrix = buildMatrix([
      run(),
      run({ id: 'b', axes: { ...run().axes, version: 'v2', environment: 'mainnet' } }),
    ], 'version', 'environment', 'status');
    expect(matrix.cells).toHaveLength(4);
    expect(matrix.cells.map((cell) => cell.statusLabel)).toEqual(expect.arrayContaining(['PASS', 'NO DATA']));
  });
});

describe('cellMetric', () => {
  it('uses pass rate for status and crash rate for crashRate', () => {
    const matrix = buildMatrix([
      run({ status: 'pass' }),
      run({ id: 'b', status: 'fail' }),
    ], 'version', 'environment', 'status');
    const cell = matrix.cells[0];
    expect(cellMetric(cell, 'status')).toBe(0.5);
    expect(cellMetric(cell, 'crashRate')).toBe(0);
  });
});

describe('detectRegressions', () => {
  it('reports worsening crash rates with confidence from sample size', () => {
    const baseline = buildMatrix([run()], 'version', 'environment', 'crashRate');
    const currentRuns = Array.from({ length: 6 }, (_, i) => run({ id: `r${i}`, crashRate: 0.5 }));
    const current = buildMatrix(currentRuns, 'version', 'environment', 'crashRate');
    const regressions = detectRegressions(current, baseline);
    expect(regressions).toHaveLength(1);
    expect(regressions[0]).toMatchObject({ delta: 0.5, confidence: 'medium' });
  });

  it('ignores improvements', () => {
    const baseline = buildMatrix([run({ crashRate: 0.8 })], 'version', 'environment', 'crashRate');
    const current = buildMatrix([run({ crashRate: 0.1 })], 'version', 'environment', 'crashRate');
    expect(detectRegressions(current, baseline)).toEqual([]);
  });
});

describe('isolateDimensions', () => {
  it('finds a dimension whose every run fails', () => {
    const runs = [
      run({ id: '1', axes: { ...run().axes, target: 'wasm' }, status: 'fail' }),
      run({ id: '2', axes: { ...run().axes, target: 'wasm' }, status: 'crash' }),
      run({ id: '3', axes: { ...run().axes, target: 'wasm' }, status: 'fail' }),
    ];
    expect(isolateDimensions(runs, ['target'])).toEqual(['target=wasm fails in all 3 runs']);
  });
});

describe('exportMatrixCsv', () => {
  it('is deterministic and includes text status encodings', () => {
    const matrix = buildMatrix([run()], 'version', 'environment', 'status');
    const csv = exportMatrixCsv(matrix);
    expect(csv.split('\n')[0]).toContain('status');
    expect(csv).toContain('PASS');
    expect(exportMatrixCsv(matrix)).toBe(csv);
  });
});
