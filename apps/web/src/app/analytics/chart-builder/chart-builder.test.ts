import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateChartConfig,
  saveCustomChart,
  loadCustomCharts,
  deleteCustomChart,
  type ChartConfig,
} from './chart-builder-dsl';
import {
  compileChartConfig,
  applyFilters,
} from './chart-transform-compiler';
import type { FuzzingRun } from '../../types';

const mockRuns: FuzzingRun[] = [
  {
    id: 'run-1', status: 'completed', area: 'auth', severity: 'low',
    duration: 1000, seedCount: 10, crashDetail: null,
    cpuInstructions: 50000, memoryBytes: 1024 * 1024, minResourceFee: 100,
    queuedAt: '2025-01-15T10:00:00Z',
  },
  {
    id: 'run-2', status: 'failed', area: 'state', severity: 'high',
    duration: 2000, seedCount: 20, crashDetail: null,
    cpuInstructions: 80000, memoryBytes: 2 * 1024 * 1024, minResourceFee: 200,
    queuedAt: '2025-01-16T10:00:00Z',
  },
  {
    id: 'run-3', status: 'completed', area: 'auth', severity: 'medium',
    duration: 1500, seedCount: 15, crashDetail: null,
    cpuInstructions: 60000, memoryBytes: 1.5 * 1024 * 1024, minResourceFee: 150,
    queuedAt: '2025-01-17T10:00:00Z',
  },
];

describe('Chart config validation', () => {
  it('accepts valid bar config', () => {
    const result = validateChartConfig({
      dataset: 'runs',
      metrics: ['duration'],
      type: 'bar',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects empty metrics', () => {
    const result = validateChartConfig({
      dataset: 'runs',
      metrics: [],
      type: 'bar',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects pie with multiple metrics', () => {
    const result = validateChartConfig({
      dataset: 'runs',
      metrics: ['duration', 'cpuInstructions'],
      type: 'pie',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].message).toContain('Pie charts support exactly 1 metric');
    }
  });

  it('rejects pie with dimension', () => {
    const result = validateChartConfig({
      dataset: 'runs',
      metrics: ['duration'],
      type: 'pie',
      dimension: 'status',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].message).toContain('cannot use dimension');
    }
  });

  it('accepts scatter with 2 metrics', () => {
    const result = validateChartConfig({
      dataset: 'runs',
      metrics: ['duration', 'cpuInstructions'],
      type: 'scatter',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects invalid chart type', () => {
    const result = validateChartConfig({
      dataset: 'runs',
      metrics: ['duration'],
      type: 'invalid',
    });
    expect(result.ok).toBe(false);
  });
});

describe('Chart transform compiler', () => {
  it('compiles bar chart with aggregation', () => {
    const config: ChartConfig = {
      dataset: 'runs',
      metrics: ['duration'],
      type: 'bar',
    };
    const { data, metricLabels } = compileChartConfig(config, mockRuns);
    expect(data).toHaveLength(1);
    expect(data[0].label).toBe('All Runs');
    expect(data[0]['duration']).toBe(1500);
    expect(metricLabels['duration']).toBe('Duration (ms)');
  });

  it('compiles bar chart with dimension', () => {
    const config: ChartConfig = {
      dataset: 'runs',
      metrics: ['duration'],
      type: 'bar',
      dimension: 'area',
    };
    const { data } = compileChartConfig(config, mockRuns);
    expect(data.length).toBe(2);
    const authEntry = data.find((d) => d.label === 'auth');
    expect(authEntry).toBeDefined();
    expect(authEntry!['duration']).toBe(1250);
  });

  it('compiles scatter chart', () => {
    const config: ChartConfig = {
      dataset: 'runs',
      metrics: ['duration', 'cpuInstructions'],
      type: 'scatter',
    };
    const { data } = compileChartConfig(config, mockRuns);
    expect(data).toHaveLength(3);
    expect(data[0]).toHaveProperty('x');
    expect(data[0]).toHaveProperty('y');
  });

  it('applies filters', () => {
    const config: ChartConfig = {
      dataset: 'runs',
      metrics: ['duration'],
      type: 'bar',
      filters: [{ field: 'status', op: 'eq', value: 'completed' }],
    };
    const { data } = compileChartConfig(config, mockRuns);
    expect(data[0]['duration']).toBe(1250);
  });
});

describe('Filter application', () => {
  it('filters by eq', () => {
    const result = applyFilters(mockRuns, [{ field: 'status', op: 'eq', value: 'failed' }]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('run-2');
  });

  it('filters by gt', () => {
    const result = applyFilters(mockRuns, [{ field: 'duration', op: 'gt', value: 1200 }]);
    expect(result).toHaveLength(2);
  });

  it('returns all when no filters', () => {
    const result = applyFilters(mockRuns, undefined);
    expect(result).toHaveLength(3);
  });
});

describe('Chart persistence', () => {
  const mockStorage = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; },
    };
  })();

  beforeEach(() => {
    mockStorage.clear();
  });

  it('saves and loads a chart', () => {
    const config: ChartConfig = { dataset: 'runs', metrics: ['duration'], type: 'bar' };
    const saved = saveCustomChart(config, mockStorage);
    expect(saved.id).toBeTruthy();
    expect(saved.createdAt).toBeTruthy();

    const charts = loadCustomCharts(mockStorage);
    expect(charts).toHaveLength(1);
    expect(charts[0].id).toBe(saved.id);
  });

  it('deletes a chart', () => {
    const config: ChartConfig = { dataset: 'runs', metrics: ['duration'], type: 'bar' };
    const saved = saveCustomChart(config, mockStorage);
    deleteCustomChart(saved.id, mockStorage);
    expect(loadCustomCharts(mockStorage)).toHaveLength(0);
  });
});
