import { describe, expect, it, vi } from 'vitest';
import {
  BoundedStreamQueue,
  RunEventLog,
  createRegistry,
  encodeFrame,
  encodeHeartbeat,
} from './sse-stream';

describe('RunEventLog', () => {
  it('assigns monotonically increasing sequence ids', () => {
    const log = new RunEventLog(10);
    const a = log.append({ runId: 'r', event: { type: 'HEARTBEAT', at: '1' } });
    const b = log.append({ runId: 'r', event: { type: 'HEARTBEAT', at: '2' } });
    expect(a.seq).toBe(1);
    expect(b.seq).toBe(2);
    expect(log.lastId).toBe(2);
  });

  it('replays events after the given id', () => {
    const log = new RunEventLog(10);
    for (let i = 0; i < 5; i += 1) {
      log.append({ runId: 'r', event: { type: 'HEARTBEAT', at: String(i) } });
    }
    const replay = log.replayAfter(2);
    expect(replay.events.map((e) => e.seq)).toEqual([3, 4, 5]);
    expect(replay.dropped).toBe(0);
  });

  it('signals dropped count when the client fell off the ring buffer', () => {
    const log = new RunEventLog(3);
    for (let i = 0; i < 6; i += 1) {
      log.append({ runId: 'r', event: { type: 'HEARTBEAT', at: String(i) } });
    }
    // Only seqs 4, 5, 6 remain; replaying after 1 should report 2
    // dropped events (2 and 3).
    const replay = log.replayAfter(1);
    expect(replay.events.map((e) => e.seq)).toEqual([4, 5, 6]);
    expect(replay.dropped).toBe(2);
  });

  it('bounds memory to its capacity', () => {
    const log = new RunEventLog(4);
    for (let i = 0; i < 100; i += 1) {
      log.append({ runId: 'r', event: { type: 'HEARTBEAT', at: String(i) } });
    }
    const replay = log.replayAfter(0);
    expect(replay.events).toHaveLength(4);
    expect(replay.events.map((e) => e.seq)).toEqual([97, 98, 99, 100]);
  });
});

describe('BoundedStreamQueue', () => {
  it('drops oldest items when full', () => {
    const q = new BoundedStreamQueue<number>(3,);
    expect(q.enqueue(1)).toBe(0);
    expect(q.enqueue(2)).toBe(0);
    expect(q.enqueue(3)).toBe(0);
    expect(q.enqueue(4)).toBe(1);
    expect(q.deQueue()).toBe(2);
    expect(q.deQueue()).toBe(3);
    expect(q.deQueue()).toBe(4);
    expect(q.deQueue()).toBeUndefined();
  });

  it('never exceeds maxSize', () => {
    const q = new BoundedStreamQueue<number>(2);
    for (let i = 0; i < 100; i += 1) q.enqueue(i);
    expect(q.size).toBe(2);
    expect(q.droppedCount).toBe(98);
  });
});

describe('createRegistry', () => {
  it('limits concurrent connections per run', () => {
    const reg = createRegistry({ maxConnectionsPerRun: 2 });
    expect(reg.acquire('r')).toBe(true);
    expect(reg.acquire('r')).toBe(true);
    expect(reg.acquire('r')).toBe(false);
    reg.release('r');
    expect(reg.acquire('r')).toBe(true);
  });

  it('drops the event log once the last consumer releases', () => {
    const reg = createRegistry();
    reg.acquire('r');
    const log = reg.getLog('r');
    log.append({ runId: 'r', event: { type: 'HEARTBEAT', at: '1' } });
    reg.release('r');
    // A fresh log is created after release, proving the old one was
    // discarded.
    const fresh = reg.getLog('r');
    expect(fresh).not.toBe(log);
    expect(fresh.lastId).toBe(0);
  });
});

describe('encoders', () => {
  it('encodes id: and data: lines', () => {
    const frame = encodeFrame({
      seq: 7,
      runId: 'r',
      event: { type: 'HEARTBEAT', at: 'now' },
    });
    expect(frame.startsWith('id: 7\n')).toBe(true);
    expect(frame.endsWith('\n\n')).toBe(true);
  });

  it('encodes heartbeats as comment frames', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123);
    const frame = encodeHeartbeat();
    expect(frame).toBe(': ping 123\n\n');
    vi.restoreAllMocks();
  });
});
