import { CorpusStatPoint } from '../../app/types';

/**
 * Pure downsampler utility for high-density corpus statistics time-series.
 * Uses min-max bucketing to preserve visual extremes (peaks and troughs)
 * while guaranteeing monotonic timestamp ordering and high rendering performance.
 *
 * @param series Raw time-series data points
 * @param targetPoints Target max number of points after downsampling (default 500)
 */
export function downsampleCorpusStats(
  series: CorpusStatPoint[],
  targetPoints = 500,
): CorpusStatPoint[] {
  if (!series || series.length <= targetPoints || targetPoints < 2) {
    return series ? [...series] : [];
  }

  // Ensure series is sorted by timestamp initially
  const sorted = [...series].sort((a, b) => a.ts - b.ts);

  const bucketCount = Math.floor(targetPoints / 2);
  const chunkSize = sorted.length / bucketCount;
  const result: CorpusStatPoint[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const startIdx = Math.floor(i * chunkSize);
    const endIdx = i === bucketCount - 1 ? sorted.length : Math.floor((i + 1) * chunkSize);
    const chunk = sorted.slice(startIdx, endIdx);

    if (chunk.length === 0) continue;

    if (chunk.length === 1) {
      result.push(chunk[0]);
      continue;
    }

    // Find point with min coveragePct (or min execsPerSec)
    let minPoint = chunk[0];
    let maxPoint = chunk[0];

    for (let j = 1; j < chunk.length; j++) {
      const pt = chunk[j];
      if (pt.coveragePct < minPoint.coveragePct) {
        minPoint = pt;
      }
      if (pt.coveragePct > maxPoint.coveragePct) {
        maxPoint = pt;
      }
    }

    // Append in chronological order
    if (minPoint.ts === maxPoint.ts) {
      result.push(minPoint);
    } else if (minPoint.ts < maxPoint.ts) {
      result.push(minPoint, maxPoint);
    } else {
      result.push(maxPoint, minPoint);
    }
  }

  // Deduplicate any identical consecutive timestamp entries
  const deduplicated: CorpusStatPoint[] = [];
  for (const pt of result) {
    if (deduplicated.length === 0 || deduplicated[deduplicated.length - 1].ts !== pt.ts) {
      deduplicated.push(pt);
    }
  }

  return deduplicated;
}
