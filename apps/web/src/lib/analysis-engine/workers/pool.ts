/**
 * Bounded Worker Pool for the Client-Side WASM Analysis Engine (#2318).
 *
 * Orchestrates concurrent tasks across a pool of workers with priority queuing,
 * chunked streaming callbacks, cancellation propagation, and non-blocking yielded
 * fallback when dedicated Web Workers are unavailable.
 */

import {
  emitAnalysisTelemetry,
  getAnalysisLoaderFlags,
  type LoaderFeatureFlags,
} from '../wasm/loader';
import {
  type AnalysisRequestPayload,
  type AnalysisStreamChunk,
  type TaskPriority,
} from '../wasm/types';
import {
  executeAnalysisTaskChunked,
  type ChunkedExecutionOutput,
} from './analysis.worker';
import { AnalysisTaskScheduler } from './scheduler';

export interface AnalysisWorkerPoolOptions {
  /** Maximum concurrent tasks executing in parallel. Defaults to 4. */
  concurrency?: number;
  /** Maximum queued tasks before backpressure rejection. Defaults to 256. */
  maxQueueDepth?: number;
  /** Items per progressive stream chunk. Defaults to 64. */
  defaultChunkSize?: number;
  /** Whether to yield between chunks to preserve 60fps UI responsiveness. */
  yieldBetweenChunks?: boolean;
  /** Optional feature flags override. */
  flags?: LoaderFeatureFlags;
}

export interface PoolSubmitOptions {
  taskId?: string;
  priority?: TaskPriority;
  chunkSize?: number;
  signal?: AbortSignal;
  onProgress?: (chunk: AnalysisStreamChunk) => void;
  flags?: LoaderFeatureFlags;
}

export interface PoolMetricsSnapshot {
  concurrency: number;
  activeWorkers: number;
  queuedTasks: number;
  completedTasks: number;
  cancelledTasks: number;
  failedTasks: number;
}

export class AnalysisWorkerPool {
  private readonly concurrency: number;
  private readonly defaultChunkSize: number;
  private readonly yieldBetweenChunks: boolean;
  private readonly scheduler: AnalysisTaskScheduler;
  private readonly activeAbortControllers = new Map<string, AbortController>();
  private readonly flags?: LoaderFeatureFlags;

  private activeWorkers = 0;
  private completedTasks = 0;
  private cancelledTasks = 0;
  private failedTasks = 0;
  private taskSeq = 0;

  constructor(options: AnalysisWorkerPoolOptions = {}) {
    const hardwareThreads =
      typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
        ? Math.max(1, Math.min(8, navigator.hardwareConcurrency - 1))
        : 4;
    this.concurrency = Math.max(1, options.concurrency ?? hardwareThreads);
    this.defaultChunkSize = Math.max(1, options.defaultChunkSize ?? 64);
    this.yieldBetweenChunks = options.yieldBetweenChunks ?? true;
    this.scheduler = new AnalysisTaskScheduler({
      maxQueueDepth: options.maxQueueDepth ?? 256,
    });
    this.flags = options.flags;
  }

  /** Submits an analysis request to the priority worker pool. */
  public submit<TReq extends AnalysisRequestPayload>(
    request: TReq,
    options: PoolSubmitOptions = {},
  ): {
    taskId: string;
    promise: Promise<ChunkedExecutionOutput<TReq['operation']>>;
    cancel: () => void;
  } {
    this.taskSeq += 1;
    const taskId = options.taskId ?? `wasm-task-${this.taskSeq}`;
    const priority = options.priority ?? 'normal';

    const internalController = new AbortController();
    this.activeAbortControllers.set(taskId, internalController);

    if (options.signal) {
      if (options.signal.aborted) {
        internalController.abort();
      } else {
        options.signal.addEventListener(
          'abort',
          () => {
            this.cancel(taskId);
          },
          { once: true },
        );
      }
    }

    const promise = new Promise<ChunkedExecutionOutput<TReq['operation']>>(
      (resolve, reject) => {
        this.scheduler.enqueue<
          { request: TReq; options: PoolSubmitOptions; controller: AbortController },
          ChunkedExecutionOutput<TReq['operation']>
        >({
          id: taskId,
          operation: request.operation,
          priority,
          payload: { request, options, controller: internalController },
          signal: internalController.signal,
          onProgress: options.onProgress,
          resolve,
          reject,
        });
        this.pumpQueue();
      },
    );

    return {
      taskId,
      promise,
      cancel: () => {
        this.cancel(taskId);
      },
    };
  }

  /** Cancels a queued or currently executing task by ID. */
  public cancel(taskId: string): boolean {
    const controller = this.activeAbortControllers.get(taskId);
    if (controller && !controller.signal.aborted) {
      controller.abort();
    }
    const removedFromQueue = this.scheduler.cancel(taskId);
    if (removedFromQueue) {
      this.cancelledTasks += 1;
      this.activeAbortControllers.delete(taskId);
      emitAnalysisTelemetry({
        type: 'task_cancelled',
        reason: `Cancelled queued task ${taskId}`,
      });
    }
    return removedFromQueue || Boolean(controller);
  }

  /** Returns live pool utilization and queue metrics. */
  public getMetrics(): PoolMetricsSnapshot {
    return {
      concurrency: this.concurrency,
      activeWorkers: this.activeWorkers,
      queuedTasks: this.scheduler.size,
      completedTasks: this.completedTasks,
      cancelledTasks: this.cancelledTasks,
      failedTasks: this.failedTasks,
    };
  }

  /** Terminates all active and queued tasks. */
  public shutdown(): void {
    for (const controller of this.activeAbortControllers.values()) {
      controller.abort();
    }
    this.activeAbortControllers.clear();
    this.scheduler.clearAll('Worker pool shut down');
  }

  private pumpQueue(): void {
    while (this.activeWorkers < this.concurrency && this.scheduler.size > 0) {
      const next = this.scheduler.dequeue();
      if (!next) break;

      this.activeWorkers += 1;
      void this.runScheduledTask(next);
    }
  }

  private async runScheduledTask(
    descriptor: NonNullable<ReturnType<AnalysisTaskScheduler['dequeue']>>,
  ): Promise<void> {
    const startedAt = Date.now();
    const { request, options, controller } = descriptor.payload as {
      request: AnalysisRequestPayload;
      options: PoolSubmitOptions;
      controller: AbortController;
    };

    try {
      const output = await executeAnalysisTaskChunked(request, {
        taskId: descriptor.id,
        chunkSize: options.chunkSize ?? this.defaultChunkSize,
        signal: controller.signal,
        isCancelled: (id) => this.scheduler.isCancelled(id) || controller.signal.aborted,
        onProgress: descriptor.onProgress,
        flags: options.flags ?? this.flags ?? getAnalysisLoaderFlags(),
        yieldBetweenChunks: this.yieldBetweenChunks,
      });

      this.completedTasks += 1;
      emitAnalysisTelemetry({
        type: 'task_completed',
        operation: descriptor.operation,
        backend: output.backend,
        contentHash: output.contentHash,
        durationMs: Math.max(0, Date.now() - startedAt),
      });
      descriptor.resolve(output);
    } catch (error) {
      const isCancelled =
        controller.signal.aborted ||
        this.scheduler.isCancelled(descriptor.id) ||
        (error instanceof Error &&
          'code' in error &&
          (error as { code?: string }).code === 'TASK_CANCELLED');

      if (isCancelled) {
        this.cancelledTasks += 1;
        emitAnalysisTelemetry({
          type: 'task_cancelled',
          operation: descriptor.operation,
          reason: error instanceof Error ? error.message : 'Task cancelled',
        });
      } else {
        this.failedTasks += 1;
        emitAnalysisTelemetry({
          type: 'task_failed',
          operation: descriptor.operation,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
      descriptor.reject(error);
    } finally {
      this.activeAbortControllers.delete(descriptor.id);
      this.activeWorkers = Math.max(0, this.activeWorkers - 1);
      this.pumpQueue();
    }
  }
}

let sharedPool: AnalysisWorkerPool | null = null;

/** Accessor for the shared singleton analysis worker pool. */
export function getSharedAnalysisWorkerPool(
  options?: AnalysisWorkerPoolOptions,
): AnalysisWorkerPool {
  if (!sharedPool) {
    sharedPool = new AnalysisWorkerPool(options);
  }
  return sharedPool;
}

/** Resets the shared singleton worker pool (primarily for unit tests). */
export function resetSharedAnalysisWorkerPool(): void {
  if (sharedPool) {
    sharedPool.shutdown();
    sharedPool = null;
  }
}
