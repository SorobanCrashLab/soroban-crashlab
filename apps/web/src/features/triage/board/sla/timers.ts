// WIP scaffold for issue #2282.

export interface SlaTimer {
  startedAt: string;
  dueAt: string;
}

export function isBreached(timer: SlaTimer, now: Date = new Date()): boolean {
  return now.getTime() > new Date(timer.dueAt).getTime();
}

export function msRemaining(timer: SlaTimer, now: Date = new Date()): number {
  return new Date(timer.dueAt).getTime() - now.getTime();
}
