// WIP scaffold for issue #2272. Conflict/eligibility checks and impact estimation are
// not implemented yet.
import { checkActionPermission } from "./permissionChecks";

export interface PreflightResult {
  eligibleIds: string[];
  ineligibleIds: string[];
  estimatedCount: number;
}

export function runPreflight(actionId: string, candidateIds: string[]): PreflightResult {
  const eligibleIds: string[] = [];
  const ineligibleIds: string[] = [];

  for (const id of candidateIds) {
    if (checkActionPermission(actionId, id).allowed) {
      eligibleIds.push(id);
    } else {
      ineligibleIds.push(id);
    }
  }

  return { eligibleIds, ineligibleIds, estimatedCount: eligibleIds.length };
}
