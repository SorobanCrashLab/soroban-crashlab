// WIP scaffold for issue #2283. State-mapping/conflict-resolution logic only; no real
// provider calls, webhooks, or retry/backoff queueing yet.

export type CrashLabState = "new" | "investigating" | "reproduced" | "fixing" | "verified" | "closed";

export interface StatusMapping {
  crashLabState: CrashLabState;
  providerStatus: string;
}

export function mapCrashLabStateToProvider(
  state: CrashLabState,
  mappings: StatusMapping[],
): string | null {
  return mappings.find((mapping) => mapping.crashLabState === state)?.providerStatus ?? null;
}

export function mapProviderStatusToCrashLabState(
  providerStatus: string,
  mappings: StatusMapping[],
): CrashLabState | null {
  return mappings.find((mapping) => mapping.providerStatus === providerStatus)?.crashLabState ?? null;
}

export interface SyncConflict {
  entityId: string;
  localState: CrashLabState;
  remoteStatus: string;
}

export function detectSyncConflict(
  localState: CrashLabState,
  remoteStatus: string,
  mappings: StatusMapping[],
): SyncConflict | null {
  const remoteAsLocal = mapProviderStatusToCrashLabState(remoteStatus, mappings);
  if (remoteAsLocal && remoteAsLocal !== localState) {
    return { entityId: "", localState, remoteStatus };
  }
  return null;
}
