/**
 * Offline mutation queue for the CrashLab PWA (#2260).
 *
 * Mutating requests are persisted with an idempotency key and replayed once
 * connectivity returns. Replay is FIFO and deduplicates by key so a retry
 * after an ambiguous network failure cannot create two campaigns/runs.
 */

export interface QueuedMutation {
  id: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  idempotencyKey: string;
  body?: string;
  createdAt: number;
  attempts: number;
}

export interface EnqueueInput {
  id: string;
  method: QueuedMutation['method'];
  url: string;
  idempotencyKey: string;
  body?: string;
  now?: number;
}

const MAX_QUEUE_SIZE = 100;
const MAX_ATTEMPTS = 5;

export function enqueue(queue: readonly QueuedMutation[], input: EnqueueInput): QueuedMutation[] {
  if (queue.some((entry) => entry.idempotencyKey === input.idempotencyKey)) return [...queue];
  const entry: QueuedMutation = {
    id: input.id,
    method: input.method,
    url: input.url,
    idempotencyKey: input.idempotencyKey,
    body: input.body,
    createdAt: input.now ?? Date.now(),
    attempts: 0,
  };
  return [...queue, entry].slice(-MAX_QUEUE_SIZE);
}

export function acknowledge(queue: readonly QueuedMutation[], id: string): QueuedMutation[] {
  return queue.filter((entry) => entry.id !== id);
}

export function recordAttempt(queue: readonly QueuedMutation[], id: string): QueuedMutation[] {
  return queue.map((entry) => entry.id === id ? { ...entry, attempts: entry.attempts + 1 } : entry);
}

export function replayableMutations(queue: readonly QueuedMutation[]): QueuedMutation[] {
  return queue.filter((entry) => entry.attempts < MAX_ATTEMPTS);
}

export function serializeQueue(queue: readonly QueuedMutation[]): string {
  return JSON.stringify(queue);
}

export function parseQueue(json: string | null): QueuedMutation[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is QueuedMutation => {
      if (!entry || typeof entry !== 'object') return false;
      const candidate = entry as Partial<QueuedMutation>;
      return typeof candidate.id === 'string'
        && typeof candidate.url === 'string'
        && typeof candidate.idempotencyKey === 'string'
        && typeof candidate.attempts === 'number';
    }).slice(-MAX_QUEUE_SIZE);
  } catch {
    return [];
  }
}
