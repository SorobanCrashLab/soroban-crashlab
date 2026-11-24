/**
 * CI adapter (#2339 → #2314 CI provider).
 *
 * Reads through the CI dashboard's provider selection, so the explorer sees
 * the deterministic mock snapshot by default and GitHub Actions when the
 * server is configured for it. Tokens stay inside the provider.
 */

import { DEFAULT_CI_QUERY, type CiRun } from '@/features/ci/lib/model';
import { getCiProvider } from '@/features/ci/lib/server';
import type { SourceRow } from '../lib/engine';
import type { DatasetAdapter } from './types';

export function ciRunToRow(run: CiRun): SourceRow {
  const created = Date.parse(run.createdAt);
  return {
    id: run.id,
    workflow: run.workflowName,
    branch: run.branch,
    event: run.event,
    status: run.status,
    conclusion: run.conclusion,
    attempt: run.attempt,
    pr_number: run.prNumber ?? null,
    commit_sha: run.commitSha,
    author: run.author,
    duration_ms: run.durationMs,
    created_at: Number.isFinite(created) ? created : null,
  };
}

export const ciAdapter: DatasetAdapter = {
  entity: 'ci',
  sourceLabel: 'CI provider snapshot',
  load: async () => {
    const snapshot = await getCiProvider().getSnapshot({ ...DEFAULT_CI_QUERY, limit: 200 });
    return snapshot.runs.map(ciRunToRow);
  },
};
