/**
 * lib/triage/seed — deterministic starting queue (#1878).
 *
 * The queue is derived from the same fixture runs the dashboard uses, so the
 * feature is demonstrable without a backend. Ids are stable (`triage:<run id>`)
 * and seeding is idempotent, so a page reload never duplicates or resets work.
 *
 * When a real signature warehouse lands, only this function changes: the
 * persisted shape and the state machine stay the same.
 */

import type { FuzzingRun, RunSeverity } from '@/app/types';
import { buildMockRuns } from '@/app/mockRuns';
import type { TriageItemState, TriagePriority, TriageSeverity } from './types';

const SEVERITY_TO_PRIORITY: Record<RunSeverity, TriagePriority> = {
  critical: 'p0',
  high: 'p1',
  medium: 'p2',
  low: 'p3',
};

const FALLBACK_TIMESTAMP = '1970-01-01T00:00:00.000Z';

function toItem(run: FuzzingRun, orgId: string): TriageItemState | null {
  const detail = run.crashDetail;
  if (!detail) return null;
  const signature = (detail.signature || detail.failureCategory || '').trim();
  if (!signature) return null;

  return {
    id: `triage:${run.id}`,
    orgId,
    runId: run.id,
    signature,
    failureClass: detail.failureCategory || 'unknown',
    severity: run.severity as TriageSeverity,
    occurrences: Math.max(1, Number.isFinite(run.seedCount) ? Math.trunc(run.seedCount) : 1),
    status: 'new',
    priority: SEVERITY_TO_PRIORITY[run.severity] ?? 'p2',
    version: 1,
    updatedAt: run.finishedAt ?? run.startedAt ?? FALLBACK_TIMESTAMP,
    updatedBy: 'seed',
  };
}

/** Builds the seed queue for one organisation. */
export function buildTriageSeed(orgId = 'default'): TriageItemState[] {
  return buildMockRuns()
    .map((run) => toItem(run, orgId))
    .filter((item): item is TriageItemState => item !== null);
}
