/**
 * Issue #857 – Run replay history with timestamps
 *
 * Pure utilities for recording, sorting, filtering, and formatting replay history.
 */

export type ReplayHistoryStatus = 'completed' | 'failed';

export interface RunReplayHistoryEntry {
  id: string;
  sourceRunId: string;
  replayRunId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: ReplayHistoryStatus;
  seedsReplayed?: number;
  seedsFailed?: number;
}

export const RUN_REPLAY_HISTORY_STORAGE_KEY = 'crashlab:run-replay-history:v1';
export const MAX_REPLAY_HISTORY_ENTRIES = 50;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isIsoDateString(value: string): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

export function parseReplayHistoryEntry(raw: unknown): RunReplayHistoryEntry | null {
  if (!isObject(raw)) return null;

  const {
    id,
    sourceRunId,
    replayRunId,
    startedAt,
    completedAt,
    durationMs,
    status,
    seedsReplayed,
    seedsFailed,
  } = raw;

  if (
    typeof id !== 'string' ||
    typeof sourceRunId !== 'string' ||
    typeof replayRunId !== 'string' ||
    typeof startedAt !== 'string' ||
    typeof completedAt !== 'string' ||
    typeof durationMs !== 'number' ||
    (status !== 'completed' && status !== 'failed') ||
    !isIsoDateString(startedAt) ||
    !isIsoDateString(completedAt)
  ) {
    return null;
  }

  const entry: RunReplayHistoryEntry = {
    id,
    sourceRunId,
    replayRunId,
    startedAt,
    completedAt,
    durationMs,
    status,
  };

  if (typeof seedsReplayed === 'number') {
    entry.seedsReplayed = seedsReplayed;
  }
  if (typeof seedsFailed === 'number') {
    entry.seedsFailed = seedsFailed;
  }

  return entry;
}

export function readReplayHistory(serialized: string | null): RunReplayHistoryEntry[] {
  if (serialized === null || serialized.trim() === '') {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map(parseReplayHistoryEntry)
    .filter((entry): entry is RunReplayHistoryEntry => entry !== null);
}

export function serializeReplayHistory(entries: RunReplayHistoryEntry[]): string {
  return JSON.stringify(entries);
}

export function createReplayHistoryEntry(input: {
  id: string;
  sourceRunId: string;
  replayRunId: string;
  startedAt: string;
  completedAt: string;
  status: ReplayHistoryStatus;
  seedsReplayed?: number;
  seedsFailed?: number;
}): RunReplayHistoryEntry {
  const startedMs = Date.parse(input.startedAt);
  const completedMs = Date.parse(input.completedAt);
  const durationMs = Number.isFinite(startedMs) && Number.isFinite(completedMs)
    ? Math.max(0, completedMs - startedMs)
    : 0;

  const entry: RunReplayHistoryEntry = {
    id: input.id,
    sourceRunId: input.sourceRunId,
    replayRunId: input.replayRunId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs,
    status: input.status,
  };

  if (typeof input.seedsReplayed === 'number') {
    entry.seedsReplayed = input.seedsReplayed;
  }
  if (typeof input.seedsFailed === 'number') {
    entry.seedsFailed = input.seedsFailed;
  }

  return entry;
}

export function appendReplayHistoryEntry(
  existing: RunReplayHistoryEntry[],
  entry: RunReplayHistoryEntry,
  maxEntries = MAX_REPLAY_HISTORY_ENTRIES,
): RunReplayHistoryEntry[] {
  const withoutDuplicate = existing.filter((item) => item.id !== entry.id);
  return sortReplayHistoryByTimestamp([entry, ...withoutDuplicate], 'desc').slice(0, maxEntries);
}

export function sortReplayHistoryByTimestamp(
  entries: RunReplayHistoryEntry[],
  order: 'asc' | 'desc' = 'desc',
): RunReplayHistoryEntry[] {
  return [...entries].sort((left, right) => {
    const leftTime = Date.parse(left.completedAt);
    const rightTime = Date.parse(right.completedAt);
    if (leftTime === rightTime) return 0;
    if (order === 'asc') {
      return leftTime < rightTime ? -1 : 1;
    }
    return leftTime > rightTime ? -1 : 1;
  });
}

export function filterReplayHistoryBySourceRun(
  entries: RunReplayHistoryEntry[],
  sourceRunId: string,
): RunReplayHistoryEntry[] {
  if (!sourceRunId.trim()) {
    return entries;
  }
  return entries.filter((entry) => entry.sourceRunId === sourceRunId);
}

/** Formats an ISO timestamp for display. Returns the original string if invalid. */
export function formatReplayHistoryTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

/** Relative label such as "Just now", "5m ago", or an absolute timestamp for older entries. */
export function formatReplayHistoryRelativeTimestamp(iso: string, now: Date): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) {
    return iso;
  }

  const diffMs = now.getTime() - timestamp;
  if (diffMs < 60_000) return 'Just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  if (diffMs < 604_800_000) return `${Math.floor(diffMs / 86_400_000)}d ago`;
  return formatReplayHistoryTimestamp(iso);
}

export function formatReplayDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}
