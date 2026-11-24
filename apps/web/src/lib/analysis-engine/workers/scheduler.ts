/**
 * Priority task scheduler with cancellation, backpressure, and deterministic
 * FIFO tie-breaking for the Client-Side WASM Analysis Engine (#2318).
 */

import {
  AnalysisEngineError,
  type AnalysisOperation,
  type AnalysisStreamChunk,
  type TaskPriority,
} from '../wasm/types';

const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export interface ScheduledTaskDescriptor<TInput = unknown, TOutput = unknown> {
  id: string;
  operation: AnalysisOperation;
  priority: TaskPriority;
  enqueuedAt: number;
  sequence: number;
  payload: TInput;
  signal?: AbortSignal;
  onProgress?: (chunk: AnalysisStreamChunk) => void;
  resolve: (value: TOutput) => void;
  reject: (reason: unknown) => void;
}

export interface SchedulerOptions {
  /** Maximum number of tasks queued before applying backpressure rejection. */
  maxQueueDepth?: number;
}

export class AnalysisTaskScheduler {
  private readonly queue: ScheduledTaskDescriptor[] = [];
  private readonly cancelledIds = new Set<string>();
  private readonly maxQueueDepth: number;
  private sequenceCounter = 0;

  constructor(options: SchedulerOptions = {}) {
    this.maxQueueDepth = options.maxQueueDepth ?? 256;
  }

  /** Number of tasks currently waiting in the priority queue. */
  public get size(): number {
    return this.queue.length;
  }

  /** Whether a given task ID has been marked cancelled. */
  public isCancelled(taskId: string): boolean {
    return this.cancelledIds.has(taskId);
  }

  /** Enqueues a task in priority + sequence order, enforcing backpressure limits. */
  public enqueue<TInput, TOutput>(
    task: Omit<ScheduledTaskDescriptor<TInput, TOutput>, 'enqueuedAt' | 'sequence'>,
  ): void {
    if (task.signal?.aborted || this.cancelledIds.has(task.id)) {
      this.cancelledIds.add(task.id);
      task.reject(
        new AnalysisEngineError('TASK_CANCELLED', `Analysis task "${task.id}" was cancelled before scheduling.`),
      );
      return;
    }

    if (this.queue.length >= this.maxQueueDepth) {
      task.reject(
        new AnalysisEngineError(
          'OOM_LIMIT_EXCEEDED',
          `Scheduler backpressure limit reached (${this.maxQueueDepth} pending tasks).`,
          { queueDepth: this.queue.length, maxQueueDepth: this.maxQueueDepth },
        ),
      );
      return;
    }

    const entry: ScheduledTaskDescriptor = {
      ...(task as ScheduledTaskDescriptor),
      enqueuedAt: Date.now(),
      sequence: this.sequenceCounter,
    };
    this.sequenceCounter += 1;

    if (task.signal) {
      const onAbort = () => {
        this.cancel(task.id);
      };
      task.signal.addEventListener('abort', onAbort, { once: true });
    }

    // Binary/linear insertion keeping higher priority (lower weight) and lower sequence at the front.
    const weight = PRIORITY_WEIGHTS[entry.priority];
    let insertIdx = this.queue.length;
    for (let i = 0; i < this.queue.length; i += 1) {
      const existingWeight = PRIORITY_WEIGHTS[this.queue[i].priority];
      if (
        weight < existingWeight ||
        (weight === existingWeight && entry.sequence < this.queue[i].sequence)
      ) {
        insertIdx = i;
        break;
      }
    }

    this.queue.splice(insertIdx, 0, entry);
  }

  /** Dequeues the highest-priority non-cancelled task, or null if empty. */
  public dequeue(): ScheduledTaskDescriptor | null {
    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
      if (next.signal?.aborted || this.cancelledIds.has(next.id)) {
        this.cancelledIds.add(next.id);
        next.reject(
          new AnalysisEngineError('TASK_CANCELLED', `Analysis task "${next.id}" was cancelled.`),
        );
        continue;
      }
      return next;
    }
    return null;
  }

  /** Cancels a queued or active task by ID. Returns true if removed from queue. */
  public cancel(taskId: string): boolean {
    this.cancelledIds.add(taskId);
    const idx = this.queue.findIndex((item) => item.id === taskId);
    if (idx >= 0) {
      const [removed] = this.queue.splice(idx, 1);
      removed.reject(
        new AnalysisEngineError('TASK_CANCELLED', `Analysis task "${taskId}" cancelled by caller.`),
      );
      return true;
    }
    return false;
  }

  /** Cancels all pending tasks and resets queue state. */
  public clearAll(reason = 'Scheduler reset'): void {
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.cancelledIds.add(item.id);
      item.reject(new AnalysisEngineError('TASK_CANCELLED', reason));
    }
  }
}
