import { describe, it, expect } from 'vitest';
import { CorpusStatPoint } from '../types';
import { downsampleCorpusStats } from '../../lib/utils/downsampler';
import fixtureData from '../../fixtures/rich-corpus-run.json';

describe('CorpusStatsPanel logic and degradation paths', () => {
  it('tolerates absent or undefined corpusStats gracefully', () => {
    const undefinedSeries: CorpusStatPoint[] | undefined = undefined;
    const emptySeries: CorpusStatPoint[] = [];

    expect(downsampleCorpusStats(undefinedSeries as unknown as CorpusStatPoint[])).toEqual([]);
    expect(downsampleCorpusStats(emptySeries)).toEqual([]);
  });

  it('correctly processes rich fixture series dataset', () => {
    expect(fixtureData.corpusStats).toBeDefined();
    expect(Array.isArray(fixtureData.corpusStats)).toBe(true);

    const series: CorpusStatPoint[] = fixtureData.corpusStats as CorpusStatPoint[];
    const downsampled = downsampleCorpusStats(series, 10);

    expect(downsampled.length).toBeGreaterThan(0);
    expect(downsampled.length).toBeLessThanOrEqual(series.length);

    // Latest data point matches expected fixture values
    const latest = series[series.length - 1];
    expect(latest.corpusSize).toBe(2150);
    expect(latest.execsPerSec).toBe(4750);
    expect(latest.coveragePct).toBe(88.9);
  });

  it('preserves energy metadata fields when present in corpus stats', () => {
    const series: CorpusStatPoint[] = fixtureData.corpusStats as CorpusStatPoint[];
    const downsampled = downsampleCorpusStats(series, 10);

    // Downsampling must not introduce undefined or non-numeric energy scores.
    for (const point of downsampled) {
      if (point.energyScore !== undefined) {
        expect(typeof point.energyScore).toBe('number');
        expect(Number.isFinite(point.energyScore as number)).toBe(true);
      }
    }
  });
});
