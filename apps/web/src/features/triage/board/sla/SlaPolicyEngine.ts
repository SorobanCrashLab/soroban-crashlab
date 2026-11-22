// WIP scaffold for issue #2282. TODO: load policies from config/API instead of defaults below.

import { isBreached, type SlaTimer } from "./timers";

export type Severity = "critical" | "high" | "medium" | "low";

export interface SlaPolicy {
  severity: Severity;
  responseHours: number;
}

const DEFAULT_POLICIES: Record<Severity, SlaPolicy> = {
  critical: { severity: "critical", responseHours: 4 },
  high: { severity: "high", responseHours: 24 },
  medium: { severity: "medium", responseHours: 72 },
  low: { severity: "low", responseHours: 168 },
};

export function startTimerForSeverity(severity: Severity, startedAt: Date = new Date()): SlaTimer {
  const policy = DEFAULT_POLICIES[severity];
  const dueAt = new Date(startedAt.getTime() + policy.responseHours * 60 * 60 * 1000);
  return { startedAt: startedAt.toISOString(), dueAt: dueAt.toISOString() };
}

export function evaluateBreach(timer: SlaTimer, now: Date = new Date()): boolean {
  return isBreached(timer, now);
}
