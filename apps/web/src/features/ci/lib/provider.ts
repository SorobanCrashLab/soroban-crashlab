/** Provider abstraction: all UI code consumes a normalized `CiSnapshot`. */

import type { CiQuery, CiSnapshot } from './model';

export interface CiProvider {
  readonly id: 'mock' | 'github';
  /** Returns a complete snapshot; filtering is a separate pure step. */
  getSnapshot(query: CiQuery): Promise<CiSnapshot>;
}

/**
 * Hook for a real provider: `createGitHubActionsAdapter(client)` in
 * `github-adapter.ts` implements this interface. The API route selects the
 * deterministic mock unless a server-side GitHub client is explicitly wired.
 */
export function snapshotIsDeterministic(snapshot: CiSnapshot): boolean {
  return snapshot.source === 'mock';
}
