/**
 * In-memory correlation store used by the API routes (#2304). Seeded with a
 * small realistic investigation; swap for the backend service when available.
 */

import type { AuditEntry, CorrelationArtifact, CorrelationLink, InvestigationSet } from './model';
import type { AccessContext } from './engine';

const T = Date.parse('2026-01-15T10:00:00Z');

const SEED_ARTIFACTS: CorrelationArtifact[] = [
  { id: 'run-1042', type: 'run', title: 'Fuzz run 1042 (auth)', timestamp: T, workspace: 'default', signature: 'panic:index-oob', commit: 'a1b2c3d4e5', env: 'ci-testnet' },
  { id: 'trace-7781', type: 'trace', title: 'Trace for run 1042', timestamp: T + 4_000, workspace: 'default', runId: 'run-1042', traceId: 'trace-7781' },
  { id: 'log-5521', type: 'log', title: 'runner.log lines 880-940', timestamp: T + 2_000, workspace: 'default', runId: 'run-1042', signature: 'panic:index-oob' },
  { id: 'diff-310', type: 'state_diff', title: 'Ledger state mutation (balance map)', timestamp: T + 3_000, workspace: 'default', runId: 'run-1042', restricted: true },
  { id: 'repro-88', type: 'reproducer', title: 'Minimized reproducer', timestamp: T + 60_000, workspace: 'default', contentHash: '9f86d081884c7d659a2feaa0c55ad015', signature: 'panic:index-oob' },
  { id: 'art-bundle-3', type: 'artifact', title: 'Replay bundle', timestamp: T + 90_000, workspace: 'default', contentHash: '9f86d081884c7d659a2feaa0c55ad015' },
  { id: 'run-1043', type: 'run', title: 'Fuzz run 1043 (same commit)', timestamp: T + 600_000, workspace: 'default', commit: 'a1b2c3d4e5', env: 'ci-testnet' },
  { id: 'issue-512', type: 'issue', title: 'Index out of bounds in balance map', timestamp: T + 3_600_000, workspace: 'default', signature: 'panic:index-oob' },
  { id: 'inc-14', type: 'incident', title: 'Crash spike on testnet', timestamp: T + 10_000, workspace: 'default', runId: 'run-1042' },
];

export const correlationStore = {
  artifacts: SEED_ARTIFACTS,
  links: new Map<string, CorrelationLink>(),
  sets: new Map<string, InvestigationSet>(),
  audit: [] as AuditEntry[],
};

export function accessFromHeaders(headers: Headers): AccessContext & { actor: string; canWrite: boolean } {
  const role = headers.get('x-crashlab-role');
  return {
    actor: headers.get('x-crashlab-user') ?? 'anonymous',
    workspaces: ['default'],
    canSeeRestricted: role === 'maintainer',
    canWrite: role === 'maintainer' || role === 'responder',
  };
}
