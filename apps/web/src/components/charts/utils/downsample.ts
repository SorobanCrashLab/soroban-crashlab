import type { ChartPoint } from '../types';

/**
 * Min/max bucket decimation. It preserves local peaks and troughs while
 * bounding SVG/Canvas work to roughly twice the horizontal pixel resolution.
 */
export function downsampleMinMax<TPoint extends ChartPoint>(
  points: readonly TPoint[],
  targetBuckets: number,
): readonly TPoint[] {
  if (!Number.isInteger(targetBuckets) || targetBuckets < 1) {
    throw new RangeError('targetBuckets must be a positive integer');
  }
  if (points.length <= targetBuckets * 2 + 2) return points;

  const bucketSize = (points.length - 2) / targetBuckets;
  const result: TPoint[] = [points[0]];

  for (let bucket = 0; bucket < targetBuckets; bucket += 1) {
    const start = Math.floor(1 + bucket * bucketSize);
    const end = Math.min(points.length - 1, Math.floor(1 + (bucket + 1) * bucketSize));
    let minIndex = start;
    let maxIndex = start;

    for (let index = start + 1; index < end; index += 1) {
      if (points[index].y < points[minIndex].y) minIndex = index;
      if (points[index].y > points[maxIndex].y) maxIndex = index;
    }

    if (minIndex === maxIndex) {
      result.push(points[minIndex]);
    } else if (minIndex < maxIndex) {
      result.push(points[minIndex], points[maxIndex]);
    } else {
      result.push(points[maxIndex], points[minIndex]);
    }
  }

  result.push(points[points.length - 1]);
  return result;
}
