/**
 * Shared TypeScript contracts, Zod schemas, and capability descriptors for the
 * Client-Side WASM Analysis Engine (#2318).
 */

import { z } from 'zod';

/** Supported analysis kernel operations. */
export const AnalysisOperationSchema = z.enum([
  'normalize_trace',
  'compute_diff',
  'scan_entropy',
  'compute_summary',
  'analyze_logs',
  'analyze_corpus',
]);

export type AnalysisOperation = z.infer<typeof AnalysisOperationSchema>;

/** Execution backend used to produce an analysis result. */
export type ExecutionBackend = 'wasm-worker' | 'wasm-main' | 'js-worker' | 'js-fallback';

/** Task scheduling priority (higher priority dequeues first). */
export const TaskPrioritySchema = z.enum(['critical', 'high', 'normal', 'low']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

/** Raw trace event input before normalization. */
export const RawTraceEventSchema = z.object({
  id: z.string().optional(),
  sequence: z.number().int().nonnegative().optional(),
  timestamp: z.number().optional(),
  phase: z.string().optional(),
  anchor: z.string().optional(),
  caller: z.string().optional(),
  callee: z.string().optional(),
  method: z.string().optional(),
  depth: z.number().int().nonnegative().optional(),
  durationMs: z.number().nonnegative().optional(),
  status: z.enum(['success', 'failed', 'pending']).optional(),
  payload: z.unknown().optional(),
});

export type RawTraceEvent = z.infer<typeof RawTraceEventSchema>;

/** Canonical normalized trace event produced by `normalize_trace`. */
export const NormalizedTraceEventSchema = z.object({
  id: z.string(),
  sequence: z.number().int().nonnegative(),
  timestamp: z.number(),
  anchor: z.string(),
  caller: z.string(),
  callee: z.string(),
  method: z.string(),
  depth: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  status: z.enum(['success', 'failed', 'pending']),
  canonicalPayload: z.string(),
  eventHash: z.string(),
});

export type NormalizedTraceEvent = z.infer<typeof NormalizedTraceEventSchema>;

/** Ledger or state entry input for structural diffing. */
export const DiffEntryInputSchema = z.object({
  id: z.string(),
  entryType: z.string().default('contract_data'),
  before: z.string().optional(),
  after: z.string().optional(),
});

export type DiffEntryInput = z.infer<typeof DiffEntryInputSchema>;

/** Field-level structural diff for a single state entry. */
export const StructuralEntryDiffSchema = z.object({
  id: z.string(),
  entryType: z.string(),
  changeType: z.enum(['created', 'updated', 'deleted', 'unchanged']),
  addedKeys: z.array(z.string()),
  removedKeys: z.array(z.string()),
  changedKeys: z.array(z.string()),
  unchangedKeys: z.array(z.string()),
  fieldChangeCount: z.number().int().nonnegative(),
  parseFailed: z.boolean(),
  contentHash: z.string(),
});

export type StructuralEntryDiff = z.infer<typeof StructuralEntryDiffSchema>;

/** Trace divergence summary produced during run diff computation. */
export const TraceDivergenceSummarySchema = z.object({
  kind: z.enum(['identical', 'mismatch', 'base-ended', 'candidate-ended']),
  index: z.number().int().nonnegative(),
  matchedPrefix: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  baseAnchor: z.string().nullable(),
  candidateAnchor: z.string().nullable(),
});

export type TraceDivergenceSummary = z.infer<typeof TraceDivergenceSummarySchema>;

/** Complete result of `compute_diff`. */
export const DiffComputationResultSchema = z.object({
  entries: z.array(StructuralEntryDiffSchema),
  totals: z.object({
    total: z.number().int().nonnegative(),
    created: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    deleted: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    totalFieldChanges: z.number().int().nonnegative(),
  }),
  divergence: TraceDivergenceSummarySchema.nullable(),
  digest: z.string(),
});

export type DiffComputationResult = z.infer<typeof DiffComputationResultSchema>;

/** Deterministic security pattern match from `scan_entropy`. */
export const SecurityPatternMatchSchema = z.object({
  signatureId: z.string(),
  label: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  offset: z.number().int().nonnegative(),
  length: z.number().int().positive(),
  excerpt: z.string(),
});

export type SecurityPatternMatch = z.infer<typeof SecurityPatternMatchSchema>;

/** Entropy and security pattern scan output. */
export const EntropyScanResultSchema = z.object({
  byteLength: z.number().int().nonnegative(),
  shannonEntropy: z.number().min(0).max(8),
  normalizedEntropy: z.number().min(0).max(1),
  uniqueByteCount: z.number().int().min(0).max(256),
  asciiRatio: z.number().min(0).max(1),
  zeroByteRatio: z.number().min(0).max(1),
  classification: z.enum(['empty', 'structured', 'mixed', 'high-entropy-packed']),
  matches: z.array(SecurityPatternMatchSchema),
  riskScore: z.number().min(0).max(100),
  contentHash: z.string(),
});

export type EntropyScanResult = z.infer<typeof EntropyScanResultSchema>;

/** Deterministic summary statistics output (`compute_summary`). */
export const SummaryStatisticsResultSchema = z.object({
  count: z.number().int().nonnegative(),
  sum: z.number(),
  mean: z.number(),
  min: z.number(),
  max: z.number(),
  p50: z.number(),
  p90: z.number(),
  p95: z.number(),
  p99: z.number(),
  variance: z.number().nonnegative(),
  stdDev: z.number().nonnegative(),
});

export type SummaryStatisticsResult = z.infer<typeof SummaryStatisticsResultSchema>;

/** Log record input for `analyze_logs`. */
export const AnalysisLogRecordSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  level: z.enum(['info', 'warn', 'error', 'debug']),
  source: z.string(),
  message: z.string(),
});

export type AnalysisLogRecord = z.infer<typeof AnalysisLogRecordSchema>;

/** Log query and deterministic insight output. */
export const LogQueryAnalysisResultSchema = z.object({
  matchedIds: z.array(z.string()),
  totalCount: z.number().int().nonnegative(),
  matchedCount: z.number().int().nonnegative(),
  levelCounts: z.object({
    info: z.number().int().nonnegative(),
    warn: z.number().int().nonnegative(),
    error: z.number().int().nonnegative(),
    debug: z.number().int().nonnegative(),
  }),
  topSources: z.array(
    z.object({
      source: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  securityMatches: z.array(SecurityPatternMatchSchema),
  digest: z.string(),
});

export type LogQueryAnalysisResult = z.infer<typeof LogQueryAnalysisResultSchema>;

/** Corpus seed input for `analyze_corpus`. */
export const CorpusSeedInputSchema = z.object({
  id: z.string(),
  contract: z.string(),
  source: z.string(),
  mutation: z.string(),
  coverage: z.number().nonnegative(),
  crashes: z.number().int().nonnegative(),
  size: z.number().int().nonnegative(),
  status: z.enum(['promoted', 'active', 'quarantined']),
  payloadHex: z.string().optional(),
});

export type CorpusSeedInput = z.infer<typeof CorpusSeedInputSchema>;

/** Corpus & coverage analysis result. */
export const CorpusAnalysisResultSchema = z.object({
  totalSeeds: z.number().int().nonnegative(),
  uniqueSignatures: z.number().int().nonnegative(),
  duplicateSeedIds: z.array(z.string()),
  redundancyRatio: z.number().min(0).max(1),
  coverageStats: SummaryStatisticsResultSchema,
  sizeStats: SummaryStatisticsResultSchema,
  hotContracts: z.array(
    z.object({
      contract: z.string(),
      seedCount: z.number().int().nonnegative(),
      crashCount: z.number().int().nonnegative(),
      maxCoverage: z.number().nonnegative(),
    }),
  ),
  digest: z.string(),
});

export type CorpusAnalysisResult = z.infer<typeof CorpusAnalysisResultSchema>;

/** Discriminated union of analysis requests validated at the engine boundary. */
export const AnalysisRequestPayloadSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('normalize_trace'),
    events: z.array(RawTraceEventSchema),
  }),
  z.object({
    operation: z.literal('compute_diff'),
    entries: z.array(DiffEntryInputSchema),
    baseTrace: z.array(RawTraceEventSchema).optional(),
    candidateTrace: z.array(RawTraceEventSchema).optional(),
  }),
  z.object({
    operation: z.literal('scan_entropy'),
    payload: z.union([z.string(), z.instanceof(Uint8Array)]),
  }),
  z.object({
    operation: z.literal('compute_summary'),
    values: z.array(z.number().finite()),
  }),
  z.object({
    operation: z.literal('analyze_logs'),
    entries: z.array(AnalysisLogRecordSchema),
    query: z.string().default(''),
    level: z.enum(['all', 'info', 'warn', 'error', 'debug']).default('all'),
  }),
  z.object({
    operation: z.literal('analyze_corpus'),
    seeds: z.array(CorpusSeedInputSchema),
  }),
]);

export type AnalysisRequestPayload = z.infer<typeof AnalysisRequestPayloadSchema>;

/** Strongly typed result mapping per operation. */
export interface AnalysisResultMap {
  normalize_trace: {
    events: NormalizedTraceEvent[];
    summary: SummaryStatisticsResult;
    digest: string;
  };
  compute_diff: DiffComputationResult;
  scan_entropy: EntropyScanResult;
  compute_summary: SummaryStatisticsResult;
  analyze_logs: LogQueryAnalysisResult;
  analyze_corpus: CorpusAnalysisResult;
}

/** Progress notification emitted during chunked streaming execution. */
export interface AnalysisStreamChunk<TPartial = unknown> {
  taskId: string;
  operation: AnalysisOperation;
  chunkIndex: number;
  totalChunks: number;
  processedItems: number;
  totalItems: number;
  partial: TPartial;
}

/** Envelope returned by all analysis engine invocations. */
export interface AnalysisResponseEnvelope<K extends AnalysisOperation = AnalysisOperation> {
  taskId: string;
  operation: K;
  result: AnalysisResultMap[K];
  backend: ExecutionBackend;
  cached: boolean;
  contentHash: string;
  durationMs: number;
  chunkCount: number;
  memoryBytesUsed: number;
}

/** Runtime capability probe snapshot. */
export interface WasmCapabilityReport {
  webAssembly: boolean;
  streamingCompile: boolean;
  webWorkers: boolean;
  sharedArrayBuffer: boolean;
  indexedDb: boolean;
  simd: boolean;
  recommendedBackend: ExecutionBackend;
}

/** Telemetry event emitted by the analysis engine. */
export interface AnalysisTelemetryEvent {
  type:
    | 'task_completed'
    | 'task_cancelled'
    | 'task_failed'
    | 'fallback_triggered'
    | 'oom_guard_tripped'
    | 'cache_hit'
    | 'cache_miss'
    | 'parity_check';
  operation?: AnalysisOperation;
  backend?: ExecutionBackend;
  durationMs?: number;
  contentHash?: string;
  reason?: string;
  timestamp: number;
}

/** Explicit error codes for memory safety, cancellation, and validation. */
export type AnalysisErrorCode =
  | 'OOM_LIMIT_EXCEEDED'
  | 'TASK_CANCELLED'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'WASM_UNAVAILABLE'
  | 'WORKER_CRASHED';

export class AnalysisEngineError extends Error {
  public readonly code: AnalysisErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: AnalysisErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AnalysisEngineError';
    this.code = code;
    this.details = details;
  }
}

/** Low-level exports from the embedded WASM kernel module. */
export interface WasmAnalysisCoreExports {
  memory: WebAssembly.Memory;
  fnv1a32(ptr: number, len: number): number;
  count_byte_value(ptr: number, len: number, target: number): number;
  count_ascii_printable(ptr: number, len: number): number;
  xor_checksum(ptr: number, len: number): number;
}
