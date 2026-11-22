// WIP scaffold for issue #2276. Conflict detection via updatedAt comparison only — no
// merge/resolution UI yet.

export interface ConflictCheckResult {
  hasConflict: boolean;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
}

export function detectConflict(localUpdatedAt: string, remoteUpdatedAt: string): ConflictCheckResult {
  return {
    hasConflict: new Date(remoteUpdatedAt).getTime() > new Date(localUpdatedAt).getTime(),
    localUpdatedAt,
    remoteUpdatedAt,
  };
}
