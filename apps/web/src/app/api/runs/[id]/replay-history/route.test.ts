import { describe, it, expect } from 'vitest';
import { MOCK_REPLAY_HISTORY, getMockReplayHistoryForRun } from '@/fixtures/replay-history';
import { sortReplayHistoryByTimestamp, parseReplayHistoryEntry } from '@/app/run-replay-history-utils';

describe('MOCK_REPLAY_HISTORY fixture', () => {
  it('contains at least one entry', () => {
    expect(MOCK_REPLAY_HISTORY.length).toBeGreaterThan(0);
  });

  it('every entry satisfies RunReplayHistoryEntry shape', () => {
    for (const entry of MOCK_REPLAY_HISTORY) {
      expect(typeof entry.id).toBe('string');
      expect(typeof entry.sourceRunId).toBe('string');
      expect(typeof entry.replayRunId).toBe('string');
      expect(typeof entry.startedAt).toBe('string');
      expect(typeof entry.completedAt).toBe('string');
      expect(typeof entry.durationMs).toBe('number');
      expect(['completed', 'failed']).toContain(entry.status);
    }
  });

  it('every entry parses successfully via parseReplayHistoryEntry', () => {
    for (const entry of MOCK_REPLAY_HISTORY) {
      expect(parseReplayHistoryEntry(entry)).not.toBeNull();
    }
  });

  it('durationMs matches the diff between startedAt and completedAt', () => {
    for (const entry of MOCK_REPLAY_HISTORY) {
      const expected = Date.parse(entry.completedAt) - Date.parse(entry.startedAt);
      expect(entry.durationMs).toBe(expected);
    }
  });
});

describe('getMockReplayHistoryForRun', () => {
  it('returns all entries when no sourceRunId is given', () => {
    expect(getMockReplayHistoryForRun()).toHaveLength(MOCK_REPLAY_HISTORY.length);
  });

  it('filters by sourceRunId', () => {
    const entries = getMockReplayHistoryForRun('run-1024');
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.sourceRunId).toBe('run-1024');
    }
  });

  it('returns empty array for unknown sourceRunId', () => {
    expect(getMockReplayHistoryForRun('run-9999')).toHaveLength(0);
  });
});

describe('sortReplayHistoryByTimestamp on fixture data', () => {
  it('desc order puts newest completedAt first', () => {
    const sorted = sortReplayHistoryByTimestamp(MOCK_REPLAY_HISTORY, 'desc');
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(Date.parse(sorted[i]!.completedAt)).toBeGreaterThanOrEqual(
        Date.parse(sorted[i + 1]!.completedAt),
      );
    }
  });

  it('asc order puts oldest completedAt first', () => {
    const sorted = sortReplayHistoryByTimestamp(MOCK_REPLAY_HISTORY, 'asc');
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(Date.parse(sorted[i]!.completedAt)).toBeLessThanOrEqual(
        Date.parse(sorted[i + 1]!.completedAt),
      );
    }
  });

  it('does not mutate the original array', () => {
    const original = [...MOCK_REPLAY_HISTORY];
    sortReplayHistoryByTimestamp(MOCK_REPLAY_HISTORY, 'asc');
    expect(MOCK_REPLAY_HISTORY).toEqual(original);
  });
});
