/**
 * Unified Client-Side WASM Analysis Engine API & Golden Parity Harness (#2318).
 *
 * Exposes high-level schema-validated bindings for:
 * - Trace/event normalization (`analyzeTraceNormalization`)
 * - Run & ledger state structural diffing (`analyzeRunDiff`)
 * - Entropy & security pattern scanning (`analyzeEntropyAndSecurity`)
 * - Summary statistics (`analyzeSummaryStatistics`)
 * - Log query & security insight extraction (`analyzeLogQuery`)
 * - Corpus deduplication & coverage metrics (`analyzeCorpus`)
 * - Parity validation comparing WASM vs JS reference outputs (`runGoldenParityHarness`)
 */

import {
  AnalysisArtifactCache,
  getSharedAnalysisCache,
} from './cache';
import {
  canonicalizeJson,
  computeContentHash,
} from './wasm/codecs';
import {
  configureAnalysisLoaderFlags,
  detectWasmCapabilities,
  emitAnalysisTelemetry,
  getAnalysisLoaderFlags,
  onAnalysisTelemetry,
  type LoaderFeatureFlags,
} from './wasm/loader';
import {
  AnalysisEngineError,
  AnalysisRequestPayloadSchema,
  type AnalysisLogRecord,
  type AnalysisOperation,
  type AnalysisRequestPayload,
  type AnalysisResponseEnvelope,
  type AnalysisStreamChunk,
  type CorpusSeedInput,
  type DiffEntryInput,
  type RawTraceEvent,
  type TaskPriority,
} from './wasm/types';
import {
  AnalysisWorkerPool,
  getSharedAnalysisWorkerPool,
} from './workers/pool';

export * from './wasm/types';
export * from './wasm/loader';
export * from './wasm/codecs';
export * from './workers/scheduler';
export * from './workers/analysis.worker';
export * from './workers/pool';
export * from './cache';

export interface AnalysisInvokeOptions {
  priority?: TaskPriority;
  chunkSize?: number;
  signal?: AbortSignal;
  onProgress?: (chunk: AnalysisStreamChunk) => void;
  bypassCache?: boolean;
  pool?: AnalysisWorkerPool;
  cache?: AnalysisArtifactCache;
  flags?: LoaderFeatureFlags;
}

/**
 * Core schema-validated execution entrypoint with content-hash caching,
 * worker pool orchestration, progressive chunk callbacks, and fallback telemetry.
 */
export async function runAnalysisTask<TReq extends AnalysisRequestPayload>(
  rawRequest: TReq,
  options: AnalysisInvokeOptions = {},
): Promise<AnalysisResponseEnvelope<TReq['operation']>> {
  const startedAt = Date.now();
  const parsed = AnalysisRequestPayloadSchema.safeParse(rawRequest);
  if (!parsed.success) {
    throw new AnalysisEngineError(
      'SCHEMA_VALIDATION_FAILED',
      `Analysis request validation failed: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    );
  }

  const request = parsed.data as TReq;
  const cache = options.cache ?? getSharedAnalysisCache();
  const pool = options.pool ?? getSharedAnalysisWorkerPool();
  const flags = options.flags ?? getAnalysisLoaderFlags();
  const contentHash = computeContentHash(request);

  if (!options.bypassCache) {
    const cachedResult = await cache.get<
      AnalysisResponseEnvelope<TReq['operation']>['result']
    >(request.operation, contentHash);
    if (cachedResult !== null) {
      const capabilities = detectWasmCapabilities(flags);
      return {
        taskId: `cached-${contentHash.slice(0, 8)}`,
        operation: request.operation,
        result: cachedResult,
        backend: capabilities.recommendedBackend,
        cached: true,
        contentHash,
        durationMs: Math.max(0, Date.now() - startedAt),
        chunkCount: 0,
        memoryBytesUsed: 0,
      };
    }
  }

  const submission = pool.submit(request, {
    priority: options.priority,
    chunkSize: options.chunkSize,
    signal: options.signal,
    onProgress: options.onProgress,
    flags,
  });

  const output = await submission.promise;

  if (!options.bypassCache) {
    await cache.set(request.operation, output.contentHash, output.result);
  }

  return {
    taskId: submission.taskId,
    operation: request.operation,
    result: output.result,
    backend: output.backend,
    cached: false,
    contentHash: output.contentHash,
    durationMs: Math.max(0, Date.now() - startedAt),
    chunkCount: output.chunkCount,
    memoryBytesUsed: output.memoryBytesUsed,
  };
}

/** High-level binding: Trace / event normalization (`normalize_trace`). */
export async function analyzeTraceNormalization(
  events: readonly RawTraceEvent[],
  options?: AnalysisInvokeOptions,
): Promise<AnalysisResponseEnvelope<'normalize_trace'>> {
  return runAnalysisTask(
    {
      operation: 'normalize_trace',
      events: [...events],
    },
    options,
  );
}

/** High-level binding: Run state & trace structural diffing (`compute_diff`). */
export async function analyzeRunDiff(
  params: {
    entries: readonly DiffEntryInput[];
    baseTrace?: readonly RawTraceEvent[];
    candidateTrace?: readonly RawTraceEvent[];
  },
  options?: AnalysisInvokeOptions,
): Promise<AnalysisResponseEnvelope<'compute_diff'>> {
  return runAnalysisTask(
    {
      operation: 'compute_diff',
      entries: [...params.entries],
      baseTrace: params.baseTrace ? [...params.baseTrace] : undefined,
      candidateTrace: params.candidateTrace ? [...params.candidateTrace] : undefined,
    },
    options,
  );
}

/** High-level binding: Entropy & deterministic security pattern scanning (`scan_entropy`). */
export async function analyzeEntropyAndSecurity(
  payload: string | Uint8Array,
  options?: AnalysisInvokeOptions,
): Promise<AnalysisResponseEnvelope<'scan_entropy'>> {
  return runAnalysisTask(
    {
      operation: 'scan_entropy',
      payload,
    },
    options,
  );
}

/** High-level binding: Deterministic summary statistics (`compute_summary`). */
export async function analyzeSummaryStatistics(
  values: readonly number[],
  options?: AnalysisInvokeOptions,
): Promise<AnalysisResponseEnvelope<'compute_summary'>> {
  return runAnalysisTask(
    {
      operation: 'compute_summary',
      values: [...values],
    },
    options,
  );
}

/** High-level binding: Log query & security insight extraction (`analyze_logs`). */
export async function analyzeLogQuery(
  params: {
    entries: readonly AnalysisLogRecord[];
    query?: string;
    level?: 'all' | 'info' | 'warn' | 'error' | 'debug';
  },
  options?: AnalysisInvokeOptions,
): Promise<AnalysisResponseEnvelope<'analyze_logs'>> {
  return runAnalysisTask(
    {
      operation: 'analyze_logs',
      entries: [...params.entries],
      query: params.query ?? '',
      level: params.level ?? 'all',
    },
    options,
  );
}

/** High-level binding: Corpus deduplication & coverage analysis (`analyze_corpus`). */
export async function analyzeCorpus(
  seeds: readonly CorpusSeedInput[],
  options?: AnalysisInvokeOptions,
): Promise<AnalysisResponseEnvelope<'analyze_corpus'>> {
  return runAnalysisTask(
    {
      operation: 'analyze_corpus',
      seeds: [...seeds],
    },
    options,
  );
}

// ---------------------------------------------------------------------------
// Golden Parity Validation Harness (WASM vs Reference JS Fallback)
// ---------------------------------------------------------------------------

export interface ParityCaseResult {
  name: string;
  operation: AnalysisOperation;
  matches: boolean;
  wasmDigest: string;
  referenceDigest: string;
}

export interface ParitySuiteReport {
  allPassed: boolean;
  totalCases: number;
  passedCases: number;
  cases: ParityCaseResult[];
}

/** Built-in golden datasets exercising all 6 analysis kernels. */
export const GOLDEN_PARITY_DATASETS: readonly {
  name: string;
  request: AnalysisRequestPayload;
}[] = [
  {
    name: 'golden-trace-normalization',
    request: {
      operation: 'normalize_trace',
      events: [
        {
          id: 'ev-2',
          sequence: 2,
          caller: 'token_contract',
          callee: 'vault_contract',
          method: 'deposit',
          depth: 1,
          durationMs: 42.5,
          status: 'success',
          payload: { b: 200, a: 100 },
        },
        {
          id: 'ev-1',
          sequence: 1,
          caller: 'root',
          callee: 'token_contract',
          method: 'transfer',
          depth: 0,
          durationMs: 12.25,
          status: 'success',
          payload: { to: 'GABC', amount: 500 },
        },
      ],
    },
  },
  {
    name: 'golden-structural-diff',
    request: {
      operation: 'compute_diff',
      entries: [
        {
          id: 'ledger-balance-1',
          entryType: 'contract_data',
          before: JSON.stringify({ balance: 1000, owner: 'G1', nonce: 1 }),
          after: JSON.stringify({ owner: 'G1', balance: 750, paused: false }),
        },
        {
          id: 'ledger-created-2',
          entryType: 'contract_data',
          after: JSON.stringify({ initialized: true }),
        },
      ],
      baseTrace: [
        { sequence: 0, anchor: 'init', payload: { seed: 7 } },
        { sequence: 1, anchor: 'call:swap', payload: { amount: 10 } },
      ],
      candidateTrace: [
        { sequence: 0, anchor: 'init', payload: { seed: 7 } },
        { sequence: 1, anchor: 'call:swap', payload: { amount: 99 } },
      ],
    },
  },
  {
    name: 'golden-entropy-security-scan',
    request: {
      operation: 'scan_entropy',
      payload:
        'HostError: Contract Re-entry detected; require_auth failed for invoker; panic: arithmetic overflow at swap:84',
    },
  },
  {
    name: 'golden-summary-statistics',
    request: {
      operation: 'compute_summary',
      values: [10, 20, 30, 40, 50, 100, 250],
    },
  },
  {
    name: 'golden-log-query-insights',
    request: {
      operation: 'analyze_logs',
      query: 'overflow',
      level: 'all',
      entries: [
        {
          id: 'log-1',
          timestamp: 1700000001000,
          level: 'info',
          source: 'fuzzer',
          message: 'Campaign started with 4 workers',
        },
        {
          id: 'log-2',
          timestamp: 1700000002000,
          level: 'error',
          source: 'runtime',
          message: 'panic: arithmetic overflow in token.swap',
        },
      ],
    },
  },
  {
    name: 'golden-corpus-dedupe',
    request: {
      operation: 'analyze_corpus',
      seeds: [
        {
          id: 'seed-1',
          contract: 'token.swap',
          source: 'coverage-guided',
          mutation: 'havoc',
          coverage: 18.4,
          crashes: 2,
          size: 412,
          status: 'promoted',
          payloadHex: '0x53574150',
        },
        {
          id: 'seed-2-dup',
          contract: 'token.swap',
          source: 'dictionary',
          mutation: 'havoc',
          coverage: 18.4,
          crashes: 0,
          size: 412,
          status: 'active',
          payloadHex: '0x53574150',
        },
      ],
    },
  },
];

/**
 * Executes the parity suite across WASM and pure-JS fallback backends,
 * verifying that both produce identical canonical outputs and content digests.
 */
export async function runGoldenParityHarness(
  datasets = GOLDEN_PARITY_DATASETS,
): Promise<ParitySuiteReport> {
  const cases: ParityCaseResult[] = [];

  for (const item of datasets) {
    const wasmResponse = await runAnalysisTask(item.request, {
      bypassCache: true,
      flags: { forceJsFallback: false },
    });
    const referenceResponse = await runAnalysisTask(item.request, {
      bypassCache: true,
      flags: { forceJsFallback: true },
    });

    const wasmCanonical = canonicalizeJson(wasmResponse.result);
    const referenceCanonical = canonicalizeJson(referenceResponse.result);
    const wasmDigest = computeContentHash(wasmCanonical);
    const referenceDigest = computeContentHash(referenceCanonical);
    const matches =
      wasmCanonical === referenceCanonical && wasmDigest === referenceDigest;

    cases.push({
      name: item.name,
      operation: item.request.operation,
      matches,
      wasmDigest,
      referenceDigest,
    });
  }

  const passedCases = cases.filter((c) => c.matches).length;
  const allPassed = passedCases === cases.length;

  emitAnalysisTelemetry({
    type: 'parity_check',
    reason: `Parity suite ${passedCases}/${cases.length} passed`,
  });

  return {
    allPassed,
    totalCases: cases.length,
    passedCases,
    cases,
  };
}

export {
  configureAnalysisLoaderFlags,
  detectWasmCapabilities,
  onAnalysisTelemetry,
};
