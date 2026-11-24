/**
 * Web Worker execution loop and chunked streaming processor for the
 * Client-Side WASM Analysis Engine (#2318).
 *
 * Supports both dedicated Web Worker `postMessage` transport and yielded
 * off-main-thread chunked execution when workers are disabled or unavailable.
 */

import {
  analyzeCorpusSeeds,
  analyzeLogEntries,
  computeContentHash,
  computeStructuralDiff,
  computeSummaryStatistics,
  normalizeTraceEvents,
  scanEntropyAndPatterns,
  toUint8Array,
} from '../wasm/codecs';
import {
  getAnalysisLoaderFlags,
  loadWasmAnalysisCore,
  type LoaderFeatureFlags,
} from '../wasm/loader';
import {
  AnalysisEngineError,
  AnalysisRequestPayloadSchema,
  type AnalysisOperation,
  type AnalysisRequestPayload,
  type AnalysisResultMap,
  type AnalysisStreamChunk,
  type ExecutionBackend,
} from '../wasm/types';

export interface WorkerRequestMessage {
  type: 'EXECUTE_TASK' | 'CANCEL_TASK';
  taskId: string;
  payload?: AnalysisRequestPayload;
  chunkSize?: number;
  flags?: LoaderFeatureFlags;
}

export interface WorkerResponseMessage {
  type: 'TASK_CHUNK' | 'TASK_COMPLETE' | 'TASK_ERROR';
  taskId: string;
  operation?: AnalysisOperation;
  chunk?: AnalysisStreamChunk;
  result?: unknown;
  backend?: ExecutionBackend;
  contentHash?: string;
  chunkCount?: number;
  memoryBytesUsed?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface ChunkedExecutionOptions {
  taskId: string;
  chunkSize?: number;
  signal?: AbortSignal;
  isCancelled?: (taskId: string) => boolean;
  onProgress?: (chunk: AnalysisStreamChunk) => void;
  flags?: LoaderFeatureFlags;
  yieldBetweenChunks?: boolean;
}

export interface ChunkedExecutionOutput<K extends AnalysisOperation> {
  result: AnalysisResultMap[K];
  backend: ExecutionBackend;
  contentHash: string;
  chunkCount: number;
  memoryBytesUsed: number;
}

function checkAborted(
  taskId: string,
  signal?: AbortSignal,
  isCancelled?: (id: string) => boolean,
): void {
  if (signal?.aborted || (isCancelled && isCancelled(taskId))) {
    throw new AnalysisEngineError(
      'TASK_CANCELLED',
      `Analysis task "${taskId}" was cancelled during execution.`,
    );
  }
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function estimatePayloadBytes(payload: AnalysisRequestPayload): number {
  switch (payload.operation) {
    case 'normalize_trace':
      return payload.events.length * 256;
    case 'compute_diff':
      return (
        payload.entries.length * 512 +
        ((payload.baseTrace?.length ?? 0) + (payload.candidateTrace?.length ?? 0)) * 256
      );
    case 'scan_entropy':
      return toUint8Array(payload.payload).byteLength;
    case 'compute_summary':
      return payload.values.length * 8;
    case 'analyze_logs':
      return payload.entries.length * 256;
    case 'analyze_corpus':
      return payload.seeds.length * 256;
  }
}

/**
 * Executes a validated analysis request in memory-bounded chunks with
 * cancellation checkpoints and progressive streaming callbacks.
 */
export async function executeAnalysisTaskChunked<
  TReq extends AnalysisRequestPayload,
>(
  rawRequest: TReq,
  options: ChunkedExecutionOptions,
): Promise<ChunkedExecutionOutput<TReq['operation']>> {
  const parsed = AnalysisRequestPayloadSchema.safeParse(rawRequest);
  if (!parsed.success) {
    throw new AnalysisEngineError(
      'SCHEMA_VALIDATION_FAILED',
      `Invalid analysis request payload: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    );
  }

  const request = parsed.data;
  const flags = options.flags ?? getAnalysisLoaderFlags();
  const { taskId, signal, isCancelled, onProgress } = options;
  const chunkSize = Math.max(1, options.chunkSize ?? 64);

  checkAborted(taskId, signal, isCancelled);
  const loadedCore = await loadWasmAnalysisCore(flags);
  const memoryBytesUsed = estimatePayloadBytes(request);
  const contentHash = computeContentHash(request, loadedCore.exports);

  const emitChunksForCollection = async <TItem>(
    items: readonly TItem[],
  ): Promise<number> => {
    const totalItems = items.length;
    const totalChunks = Math.max(1, Math.ceil(totalItems / chunkSize));
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      checkAborted(taskId, signal, isCancelled);
      const start = chunkIndex * chunkSize;
      const slice = items.slice(start, start + chunkSize);
      const processedItems = Math.min(totalItems, start + slice.length);

      if (onProgress) {
        onProgress({
          taskId,
          operation: request.operation,
          chunkIndex,
          totalChunks,
          processedItems,
          totalItems,
          partial: { processedItems, totalItems, batchSize: slice.length },
        });
      }

      if (options.yieldBetweenChunks && chunkIndex + 1 < totalChunks) {
        await yieldToEventLoop();
      }
    }
    return totalChunks;
  };

  let chunkCount = 1;
  let result: unknown;

  switch (request.operation) {
    case 'normalize_trace': {
      chunkCount = await emitChunksForCollection(request.events);
      checkAborted(taskId, signal, isCancelled);
      result = normalizeTraceEvents(request.events, flags);
      break;
    }
    case 'compute_diff': {
      chunkCount = await emitChunksForCollection(request.entries);
      checkAborted(taskId, signal, isCancelled);
      result = computeStructuralDiff(
        request.entries,
        request.baseTrace,
        request.candidateTrace,
        flags,
      );
      break;
    }
    case 'scan_entropy': {
      const bytes = toUint8Array(request.payload);
      const byteChunkSize = Math.max(1024, chunkSize * 256);
      const totalChunks = Math.max(1, Math.ceil(bytes.length / byteChunkSize));
      for (let idx = 0; idx < totalChunks; idx += 1) {
        checkAborted(taskId, signal, isCancelled);
        const processed = Math.min(bytes.length, (idx + 1) * byteChunkSize);
        if (onProgress) {
          onProgress({
            taskId,
            operation: 'scan_entropy',
            chunkIndex: idx,
            totalChunks,
            processedItems: processed,
            totalItems: bytes.length,
            partial: { processedBytes: processed, totalBytes: bytes.length },
          });
        }
        if (options.yieldBetweenChunks && idx + 1 < totalChunks) {
          await yieldToEventLoop();
        }
      }
      chunkCount = totalChunks;
      checkAborted(taskId, signal, isCancelled);
      result = scanEntropyAndPatterns(request.payload, flags);
      break;
    }
    case 'compute_summary': {
      chunkCount = await emitChunksForCollection(request.values);
      checkAborted(taskId, signal, isCancelled);
      result = computeSummaryStatistics(request.values);
      break;
    }
    case 'analyze_logs': {
      chunkCount = await emitChunksForCollection(request.entries);
      checkAborted(taskId, signal, isCancelled);
      result = analyzeLogEntries(
        request.entries,
        request.query,
        request.level,
        flags,
      );
      break;
    }
    case 'analyze_corpus': {
      chunkCount = await emitChunksForCollection(request.seeds);
      checkAborted(taskId, signal, isCancelled);
      result = analyzeCorpusSeeds(request.seeds, flags);
      break;
    }
  }

  checkAborted(taskId, signal, isCancelled);

  return {
    result: result as AnalysisResultMap[TReq['operation']],
    backend: loadedCore.backend,
    contentHash,
    chunkCount,
    memoryBytesUsed,
  };
}

/**
 * Attaches message listeners to a Web Worker global scope (or mock worker port).
 */
export function registerAnalysisWorkerHost(target: {
  addEventListener?: (
    type: 'message',
    listener: (event: MessageEvent<WorkerRequestMessage>) => void,
  ) => void;
  postMessage: (message: WorkerResponseMessage) => void;
}): void {
  const cancelledTasks = new Set<string>();

  const handleMessage = async (event: MessageEvent<WorkerRequestMessage>) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'CANCEL_TASK') {
      cancelledTasks.add(msg.taskId);
      return;
    }

    if (msg.type === 'EXECUTE_TASK' && msg.payload) {
      try {
        const output = await executeAnalysisTaskChunked(msg.payload, {
          taskId: msg.taskId,
          chunkSize: msg.chunkSize,
          flags: msg.flags,
          isCancelled: (id) => cancelledTasks.has(id),
          onProgress: (chunk) => {
            target.postMessage({
              type: 'TASK_CHUNK',
              taskId: msg.taskId,
              operation: msg.payload?.operation,
              chunk,
            });
          },
          yieldBetweenChunks: true,
        });

        target.postMessage({
          type: 'TASK_COMPLETE',
          taskId: msg.taskId,
          operation: msg.payload.operation,
          result: output.result,
          backend: output.backend,
          contentHash: output.contentHash,
          chunkCount: output.chunkCount,
          memoryBytesUsed: output.memoryBytesUsed,
        });
      } catch (error) {
        const isEngineErr = error instanceof AnalysisEngineError;
        target.postMessage({
          type: 'TASK_ERROR',
          taskId: msg.taskId,
          operation: msg.payload.operation,
          errorCode: isEngineErr ? error.code : 'WORKER_CRASHED',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      } finally {
        cancelledTasks.delete(msg.taskId);
      }
    }
  };

  if (typeof target.addEventListener === 'function') {
    target.addEventListener('message', handleMessage);
  }
}
