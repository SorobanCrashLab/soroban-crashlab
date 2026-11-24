/*
 * compare.ts — #2297
 * Comparative profiling A/B: absolute/relative deltas with regression flags
 * (#019/#067).
 */

export interface ProfileDelta {
  spanId: string;
  before: number;
  after: number;
  delta: number;
  regression: boolean;
}

export function compareProfiles(before: number[], after: number[]): ProfileDelta[] {
  const byIndex = new Map(before.map((b, i) => [i, b]));
  return after.map((a, i) => {
    const b = byIndex.get(i) ?? 0;
    const delta = a - b;
    return { spanId: String(i), before: b, after: a, delta, regression: a > b * 1.1 };
  });
}
