import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  computeResourceMetrics,
  ResourceFeeInsightPanel,
} from './implement-resource-fee-insight-panel-component';
import type { FuzzingRun } from '../../app/types';

function makeRun(overrides: Partial<FuzzingRun> = {}): FuzzingRun {
  return {
    id: 'test-id',
    status: 'completed',
    area: 'auth',
    severity: 'low',
    duration: 1_000,
    seedCount: 10,
    crashDetail: null,
    cpuInstructions: 100,
    memoryBytes: 1_024,
    minResourceFee: 100,
    ...overrides,
  };
}

describe('computeResourceMetrics', () => {
  it('returns zero metrics for an empty run list', () => {
    const result = computeResourceMetrics([]);
    expect(result).toMatchObject({
      avgCpu: 0,
      maxCpu: 0,
      avgMemory: 0,
      maxMemory: 0,
      avgFee: 0,
      maxFee: 0,
      expensiveRuns: [],
      totalRuns: 0,
    });
  });

  it('calculates averages and maxima', () => {
    const result = computeResourceMetrics([
      makeRun({ cpuInstructions: 100, memoryBytes: 1_024, minResourceFee: 50 }),
      makeRun({ cpuInstructions: 200, memoryBytes: 2_048, minResourceFee: 100 }),
      makeRun({ cpuInstructions: 300, memoryBytes: 3_072, minResourceFee: 150 }),
    ]);

    expect(result.avgCpu).toBe(200);
    expect(result.maxCpu).toBe(300);
    expect(result.avgMemory).toBe(2_048);
    expect(result.maxMemory).toBe(3_072);
    expect(result.avgFee).toBe(100);
    expect(result.maxFee).toBe(150);
    expect(result.totalRuns).toBe(3);
  });

  it('flags runs above the critical thresholds', () => {
    const result = computeResourceMetrics([
      makeRun({ id: 'normal' }),
      makeRun({ id: 'expensive-cpu', cpuInstructions: 6_000_000 }),
      makeRun({ id: 'expensive-memory', memoryBytes: 15_000_000 }),
      makeRun({ id: 'expensive-fee', minResourceFee: 6_000 }),
    ]);

    expect(result.expensiveRuns.map((run) => run.id)).toEqual([
      'expensive-cpu',
      'expensive-memory',
      'expensive-fee',
    ]);
  });
});

describe('ResourceFeeInsightPanel', () => {
  it('renders the loading skeleton', () => {
    const html = renderToStaticMarkup(
      <ResourceFeeInsightPanel runs={[]} dataState="loading" />,
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Resource Fee Insight loading');
  });

  it('renders the error state with a retry action', () => {
    const html = renderToStaticMarkup(
      <ResourceFeeInsightPanel runs={[]} dataState="error" errorMessage="Test error" onRetry={() => {}} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Test error');
    expect(html).toContain('Retry resource insight');
  });

  it('renders metrics and threshold information', () => {
    const html = renderToStaticMarkup(
      <ResourceFeeInsightPanel
        runs={[makeRun({ cpuInstructions: 500_000, memoryBytes: 1_048_576, minResourceFee: 500 })]}
      />,
    );
    expect(html).toContain('Resource Fee Insight');
    expect(html).toContain('CPU Instructions');
    expect(html).toContain('Threshold Levels');
  });
});
