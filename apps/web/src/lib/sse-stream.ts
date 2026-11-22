import type { FuzzingRun } from '@/app/types';

export type RunStreamEvent = {
  type: 'RUN_STATUS';
  status: FuzzingRun ['status'];
  metrics: { seedCount: number; duration: number };
} | {
  type: 'STATIC';
  status: FuzzingRun ['status'];
  metrics: { seedCount: number; duration: number };
  reason: 'terminal';
} | {
  type: 'HEARTBEAT';
  at: string;
} | {
  type: 'LAGGING';
  dropped: number;
};

export type RunStreamEnvelope = {
  seq: number;
  runId: string;
  event: RunStreamEvent;
};

export const DEFAULT_EVENT_LOG_CAPACITY = 256;
export const DEFAULT_MAX_CONNECTIONS_PER_RUN = 50;
export const DEFAULT_MAX_QUEUE_SIZE = 32;
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * Bounded, monotonically-increasing event log for a single run.
 * Retains the most recent `Capacity` events in a ring buffer so a
 * reconnecting client can replay via `Last-Event-ID``.
 */
export class RunEventLog {
  private readonly buffer: Array<RunStreamEnvelope | undefined>;
  private start = 0;
  private count = 0;
  private lastSeq = 0;

  constructor(public readonly capacity: number = DEFAULT_EVENT_LOG_CAPACITY) {
    if (capacity <= 0) throw new Error('RunEventLog capacity must be positive');
    this.buffer = new Array(capacity);
  }

  get lastId(): number {
    return this.lastSeq;
  }

  append(envelope: Omit<RunStreamEnvelope, 'seq'>): RunStreamEnvelope {
    const seq = this.lastSeq + 1;
    const record: RunStreamEnvelope = { ...envelope, seq };
    const index = (this.start + this.count) % this.capacity;
    this.buffer[index] = record;
    if (this.count < this.capacity) {
      this.count += 1;
    } else {
      // Overwrite oldest entry.
      this.start = (this.start + 1) % this.capacity;
    }
    this.lastSeq = seq;
    return record;
  }

  /**
   * Returns all retained events with `seq > after`. If `after` is older
   * than the oldest retained event, the replay is incomplete and the
   * client is told via `dropped` how many events it missed.
   */
  replayAfter(after: number): { events: RunStreamEnvelope[]; dropped: number } {
    const result: RunStreamEnvelope[] = [];
    for (let i = 0; i < this.count; i += 1) {
      const record = this.buffer[(this.start + i) % this.capacity];
      if (record && record.seq > after) result.push(record);
    }
    const oldest = this.count > 0 ? this.buffer[this.start] : undefined;
    const dropped = oldest && oldest.seq > after + 1 ? oldest.seq - after - 1 : 0;
    return { events: result, dropped };
  }

  clear(): void {
    this.buffer.fill(undefined);
    this.start = 0;
    this.count = 0;
    this.lastSeq = 0;
  }
}

/**
 * Process-wide registry of per-run event logs and connection counts.
 * Keyed by run id; entries are removed when the last consumer disconnects
 * and the log has been consumed.
 */
export interface RunStreamRegistry {
  getLog(runId: string): RunEventLog;
  acquire(runId: string): boolean;
  release(runId: string): void;
}

export function createRegistry(options: {
  maxConnectionsPerRun?: number;
  capacity?: number;
} = {}): RunStreamRegistry {
  const maxConnections = options.maxConnectionsPerRun ?? DEFAULT_MAX_CONNECTIONS_PER_RUN;
  const capacity = options.capacity ?? DEFAULT_EVENT_LOG_CAPACITY;
  const logs = new Map<string, RunEventLog>();
  const conns = new Map<string, number>();

  return {
    getLog(runId: string): RunEventLog {
      let log = logs.get(runId);
      if (!log) {
        log = new RunEventLog(capacity);
        logs.set(runId, log);
      }
      return log;
    },
    acquire(runId: string): boolean {
      const current = conns.get(runId) ?? 0;
      if (current >= maxConnections) return false;
      conns.set(runId, current + 1);
      return true;
    },
    release(runId: string): void {
      const current = conns.get(runId) ?? 0;
      if (current <= 1) {
        conns.delete(runId);
        // No active consumers: drop the log so memory is released.
        logs.delete(runId);
      } else {
        conns.set(runId, current - 1);
      }
    },
  };
}

export const globalRunStreamRegistry: RunStreamRegistry = createRegistry();

export function encodeFrame(envelope: RunStreamEnvelope): string {
  return `id: ${envelope.seq}\ndata: ${JSON.stringify(envelope)}\n\n`;
}

export function encodeHeartbeat(): string {
  return `: ping ${Date.now()}\n\n`;
}

/**
 * Bounded queue for a single connection. When the consumer is slow
 * (the Web Streams desiredSize stays positive), we drop the oldest
 * pending frames and emit a single `LAGGING` event describing how many
 * were dropped. Memory is bounded by `maxSize`.
 */
export class BoundedStreamQueue<T> {
  private queue: T[] = [];
  private dropped = 0;

  constructor(public readonly maxSize: number = DEFAULT_MAX_QUEUE_SIZE) {
    if (maxSize <= 0) throw new Error('BoundedStreamQueue maxSize must be positive');
  }

  get size(): number {
    return this.queue.length;
  }

  get droppedCount(): number {
    return this.dropped;
  }

  /**
   * Enqueue an item. Returns the number of items dropped to make room
   * (zero when there was space). Drop-oldest policy.
   */
  enqueue(item: T): number {
    if (this.queue.length >= this.maxSize) {
      const overflow = this.queue.length - this.maxSize + 1;
      this.queue.splice(0, overflow);
      this.dropped += overflow;
      this.queue.push(item);
      return overflow;
    }
    this.queue.push(item);
    return 0;
  }

  deQueue(): T | undefined {
    return this.queue.shift();
  }

  drain(): T[] {
    const items = this.queue;
    this.queue = [];
    return items;
  }

  clear(): void {
    this.queue = [];
    this.dropped = 0;
  }
}
