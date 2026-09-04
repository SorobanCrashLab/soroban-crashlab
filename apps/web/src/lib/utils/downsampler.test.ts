import { describe, it, expect } from 'vitest';
import { downsampleCorpusStats } from './downsampler';
import { CorpusStatPoint } from '../../app/types';

describe('downsampleCorpusStats', () => {
  it('returns original series when length is below targetPoints', () => {
    const smallSeries: CorpusStatPoint[] = [
      { ts: 100, corpusSize: 10, execsPerSec: 50, coveragePct: 12.5 },
      { ts: 200, corpusSize: 15, execsPerSec: 55, coveragePct: 15.0 },
    ];
    const result = downsampleCorpusStats(smallSeries, 500);
    expect(result).toEqual(smallSeries);
  });

  it('guarantees monotonic timestamp ordering', () => {
    const points: CorpusStatPoint[] = Array.from({ length: 1000 }, (_, i) => ({
      ts: 1000 + i * 10,
      corpusSize: 100 + (i % 50),
      execsPerSec: 200 + Math.sin(i) * 50,
      coveragePct: Math.min(100, (i / 1000) * 80 + (i % 5)),
    }));

    const result = downsampleCorpusStats(points, 200);

    for (let i = 1; i < result.length; i++) {
      expect(result[i].ts).toBeGreaterThan(result[i - 1].ts);
    }
  });

  it('preserves visual extremes (peaks and troughs)', () => {
    const points: CorpusStatPoint[] = Array.from({ length: 1000 }, (_, i) => ({
      ts: 1000 + i * 10,
      corpusSize: 100,
      execsPerSec: 200,
      coveragePct: 50,
    }));

    // Inject sharp spike and trough
    points[250] = { ts: 3500, corpusSize: 100, execsPerSec: 200, coveragePct: 99.9 }; // Peak
    points[750] = { ts: 8500, corpusSize: 100, execsPerSec: 200, coveragePct: 0.1 };  // Trough

    const result = downsampleCorpusStats(points, 100);

    const hasPeak = result.some((p) => p.coveragePct === 99.9);
    const hasTrough = result.some((p) => p.coveragePct === 0.1);

    expect(hasPeak).toBe(true);
    expect(hasTrough).toBe(true);
  });

  it('processes 5,000-point series in under 100ms (performance requirement)', () => {
    const largeSeries: CorpusStatPoint[] = Array.from({ length: 5000 }, (_, i) => ({
      ts: 1600000000 + i * 5,
      corpusSize: 50 + Math.floor(i / 10),
      execsPerSec: 1000 + (i % 200),
      coveragePct: Math.min(100, 10 + (i / 5000) * 75 + (i % 3)),
    }));

    const start = performance.now();
    const result = downsampleCorpusStats(largeSeries, 500);
    const elapsed = performance.now() - start;

    expect(result.length).toBeLessThanOrEqual(500);
    expect(elapsed).toBeLessThan(100);
  });
});
