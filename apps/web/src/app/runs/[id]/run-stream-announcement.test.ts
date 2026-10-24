import { describe, expect, it } from 'vitest';
import {
  runStreamAnnouncement,
  streamConnectionAnnouncement,
} from './run-stream-announcement';

describe('run stream announcements', () => {
  it('announces a status change once', () => {
    const event = { type: 'RUN_STATUS', status: 'failed' } as const;
    expect(runStreamAnnouncement(event, 'running')).toBe('Run status changed to failed.');
    expect(runStreamAnnouncement(event, 'failed')).toBeNull();
  });

  it('announces terminal STATIC snapshots but ignores heartbeats and logs', () => {
    expect(
      runStreamAnnouncement(
        { type: 'STATIC', status: 'completed', metrics: { seedCount: 1, duration: 2 }, reason: 'terminal' },
        'running',
      ),
    ).toBe('Run status changed to completed.');
    expect(
      runStreamAnnouncement({ type: 'HEARTBEAT', at: new Date().toISOString() }),
    ).toBeNull();
    expect(runStreamAnnouncement({ type: 'LOG_APPEND', entries: [] })).toBeNull();
    expect(
      runStreamAnnouncement({ type: 'ARTIFACT_ADDED', artifact: { id: 'a' } as never }),
    ).toBeNull();
  });

  it('surfaces dropped stream frames', () => {
    expect(runStreamAnnouncement({ type: 'LAGGING', dropped: 1 })).toBe(
      'Live updates skipped 1 event; the view may be behind.',
    );
    expect(runStreamAnnouncement({ type: 'LAGGING', dropped: 12 })).toBe(
      'Live updates skipped 12 events; the view may be behind.',
    );
  });

  it('announces connection transitions only', () => {
    expect(streamConnectionAnnouncement(false, true)).toBe('Live updates connected.');
    expect(streamConnectionAnnouncement(true, false)).toBe(
      'Live updates disconnected; reconnecting.',
    );
    expect(streamConnectionAnnouncement(true, true)).toBeNull();
    expect(streamConnectionAnnouncement(false, false)).toBeNull();
  });
});
