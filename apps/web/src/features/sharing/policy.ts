// WIP scaffold for issue #2274. Scope policy only covers entity/time-range; allowed
// filters/interactions and password/SSO gating are not implemented yet.

export interface SharePolicy {
  entityType: "run" | "campaign" | "dashboard" | "chart" | "report";
  entityId: string;
  expiresAt: string | null;
  allowedTimeRange?: { from: string; to: string };
}

export function isPolicyExpired(policy: SharePolicy, now: Date = new Date()): boolean {
  if (!policy.expiresAt) return false;
  return now.getTime() > new Date(policy.expiresAt).getTime();
}
