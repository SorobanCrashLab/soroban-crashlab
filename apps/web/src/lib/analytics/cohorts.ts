/*
 * cohorts.ts — #2299
 * Cohort segmentation by workspace/role/environment/device with exposure
 * metrics per cohort.
 */

export interface CohortUser {
  workspace?: string;
  role?: string;
  environment?: string;
  device?: string;
  exposure?: boolean;
}

export interface Cohort {
  key: string;
  size: number;
  exposureRate: number;
}

export function segmentCohorts(users: CohortUser[]): Cohort[] {
  const buckets = new Map<string, { size: number; exposure: number }>();
  for (const u of users) {
    const key = [u.workspace, u.role, u.environment, u.device].filter(Boolean).join('/');
    const b = buckets.get(key) ?? { size: 0, exposure: 0 };
    b.size += 1;
    b.exposure += u.exposure ? 1 : 0;
    buckets.set(key, b);
  }
  return [...buckets.entries()].map(([key, b]) => ({
    key,
    size: b.size,
    exposureRate: b.size > 0 ? b.exposure / b.size : 0,
  }));
}
