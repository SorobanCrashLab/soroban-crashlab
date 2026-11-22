import type { RunReplayHistoryEntry } from '../app/run-replay-history-utils';

/**
 * Deterministic mock replay history entries for dashboard development and tests.
 * Entries are ordered newest-first (descending completedAt).
 */
export const MOCK_REPLAY_HISTORY: RunReplayHistoryEntry[] = [
  {
    id: 'rh-001',
    sourceRunId: 'run-1024',
    replayRunId: 'replay-run-1024-a1b2c3d4',
    startedAt: '2026-06-24T10:00:00.000Z',
    completedAt: '2026-06-24T10:00:05.500Z',
    durationMs: 5500,
    status: 'completed',
    seedsReplayed: 42,
    seedsFailed: 0,
  },
  {
    id: 'rh-002',
    sourceRunId: 'run-1020',
    replayRunId: 'replay-run-1020-e5f6a7b8',
    startedAt: '2026-06-24T09:30:00.000Z',
    completedAt: '2026-06-24T09:30:12.300Z',
    durationMs: 12300,
    status: 'failed',
    seedsReplayed: 18,
    seedsFailed: 3,
  },
  {
    id: 'rh-003',
    sourceRunId: 'run-1024',
    replayRunId: 'replay-run-1024-c9d0e1f2',
    startedAt: '2026-06-24T08:15:00.000Z',
    completedAt: '2026-06-24T08:15:07.800Z',
    durationMs: 7800,
    status: 'completed',
    seedsReplayed: 42,
    seedsFailed: 1,
  },
  {
    id: 'rh-004',
    sourceRunId: 'run-1016',
    replayRunId: 'replay-run-1016-g3h4i5j6',
    startedAt: '2026-06-23T14:00:00.000Z',
    completedAt: '2026-06-23T14:00:03.200Z',
    durationMs: 3200,
    status: 'completed',
    seedsReplayed: 10,
    seedsFailed: 0,
  },
  {
    id: 'rh-005',
    sourceRunId: 'run-1012',
    replayRunId: 'replay-run-1012-k7l8m9n0',
    startedAt: '2026-06-23T11:45:00.000Z',
    completedAt: '2026-06-23T11:45:22.100Z',
    durationMs: 22100,
    status: 'failed',
    seedsReplayed: 30,
    seedsFailed: 7,
  },
];

/**
 * Returns mock replay history entries for a given sourceRunId.
 * Returns all entries when sourceRunId is undefined.
 */
export function getMockReplayHistoryForRun(sourceRunId?: string): RunReplayHistoryEntry[] {
  if (!sourceRunId) return MOCK_REPLAY_HISTORY;
  return MOCK_REPLAY_HISTORY.filter((e) => e.sourceRunId === sourceRunId);
}
