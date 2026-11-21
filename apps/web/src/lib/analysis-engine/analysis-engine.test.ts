import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AnalysisArtifactCache,
  AnalysisEngineError,
  AnalysisTaskScheduler,
  AnalysisWorkerPool,
  analyzeCorpus,
  analyzeEntropyAndSecurity,
  analyzeLogQuery,
  analyzeRunDiff,
  analyzeSummaryStatistics,
  analyzeTraceNormalization,
  canonicalizeJson,
  computeContentHash,
  configureAnalysisLoaderFlags,
  detectWasmCapabilities,
  jsFnv1a32,
  loadWasmAnalysisCore,
  onAnalysisTelemetry,
  registerAnalysisWorkerHost,
  resetSharedAnalysisCache,
  resetSharedAnalysisWorkerPool,
  runAnalysisTask,
  runGoldenParityHarness,
  type AnalysisStreamChunk,
  type AnalysisTelemetryEvent,
  type WorkerRequestMessage,
  type WorkerResponseMessage,
} from './api';

describe('Client-Side WASM Analysis Engine (#2318)', () => {
  beforeEach(() => {
    configureAnalysisLoaderFlags({});
    resetSharedAnalysisCache();
    resetSharedAnalysisWorkerPool();
  });

  afterEach(() => {
    configureAnalysisLoaderFlags({});
    resetSharedAnalysisCache();
    resetSharedAnalysisWorkerPool();
  });

  describe('WASM Loader & Capability Detection', () => {
    it('detects native WebAssembly support and compiles embedded WASM core', async () => {
      const capabilities = detectWasmCapabilities();
      expect(capabilities.webAssembly).toBe(true);

      const core = await loadWasmAnalysisCore();
      expect(core.isNativeWasm).toBe(true);

      const payload = new TextEncoder().encode('soroban-crashlab-wasm-test');
      const memView = new Uint8Array(core.exports.memory.buffer);
      memView.set(payload, 0);

      const wasmHash = core.exports.fnv1a32(0, payload.length) >>> 0;
      const jsHash = jsFnv1a32(payload);
      expect(wasmHash).toBe(jsHash);

      const asciiCount = core.exports.count_ascii_printable(0, payload.length);
      expect(asciiCount).toBe(payload.length);

      const dashCount = core.exports.count_byte_value(0, payload.length, '-'.charCodeAt(0));
      expect(dashCount).toBe(3);

      const checksum = core.exports.xor_checksum(0, payload.length);
      expect(checksum).toBeGreaterThan(0);
    });

    it('gracefully falls back to deterministic JS core when forceJsFallback is enabled', async () => {
      const telemetry: AnalysisTelemetryEvent[] = [];
      const unsub = onAnalysisTelemetry((e) => telemetry.push(e));

      const core = await loadWasmAnalysisCore({ forceJsFallback: true });
      unsub();

      expect(core.isNativeWasm).toBe(false);
      expect(core.backend).toBe('js-fallback');
      expect(telemetry.some((e) => e.type === 'fallback_triggered')).toBe(true);
    });

    it('enforces explicit OOM memory budget limits and emits telemetry', async () => {
      const telemetry: AnalysisTelemetryEvent[] = [];
      const unsub = onAnalysisTelemetry((e) => telemetry.push(e));

      await expect(
        analyzeEntropyAndSecurity(new Uint8Array(2048), {
          flags: { maxMemoryBytes: 512 },
        }),
      ).rejects.toMatchObject({
        code: 'OOM_LIMIT_EXCEEDED',
      });

      unsub();
      expect(telemetry.some((e) => e.type === 'oom_guard_tripped')).toBe(true);
    });
  });

  describe('Core Kernels & Schema Contracts', () => {
    it('normalizes out-of-order trace events deterministically regardless of key order', async () => {
      const resA = await analyzeTraceNormalization([
        {
          id: 'step-2',
          sequence: 2,
          caller: 'token',
          callee: 'vault',
          method: 'deposit',
          depth: 1,
          durationMs: 30,
          status: 'success',
          payload: { z: 1, a: 2 },
        },
        {
          id: 'step-1',
          sequence: 1,
          caller: 'user',
          callee: 'token',
          method: 'approve',
          depth: 0,
          durationMs: 10,
          status: 'success',
          payload: { b: true, a: 'ok' },
        },
      ]);

      const resB = await analyzeTraceNormalization([
        {
          id: 'step-1',
          sequence: 1,
          caller: 'user',
          callee: 'token',
          method: 'approve',
          depth: 0,
          durationMs: 10,
          status: 'success',
          payload: { a: 'ok', b: true },
        },
        {
          id: 'step-2',
          sequence: 2,
          caller: 'token',
          callee: 'vault',
          method: 'deposit',
          depth: 1,
          durationMs: 30,
          status: 'success',
          payload: { a: 2, z: 1 },
        },
      ]);

      expect(resA.result.events.map((e) => e.id)).toEqual(['step-1', 'step-2']);
      expect(resA.result.digest).toBe(resB.result.digest);
      expect(resA.result.summary.count).toBe(2);
      expect(resA.result.summary.mean).toBe(20);
    });

    it('computes structural ledger diffs and pinpoints first trace divergence', async () => {
      const response = await analyzeRunDiff({
        entries: [
          {
            id: 'entry-created',
            entryType: 'contract_data',
            after: JSON.stringify({ balance: 500 }),
          },
          {
            id: 'entry-updated',
            entryType: 'contract_data',
            before: JSON.stringify({ count: 1, owner: 'GA' }),
            after: JSON.stringify({ owner: 'GA', count: 2, extra: true }),
          },
          {
            id: 'entry-deleted',
            entryType: 'contract_data',
            before: JSON.stringify({ temp: 123 }),
          },
        ],
        baseTrace: [
          { sequence: 0, anchor: 'phase:init', payload: { v: 1 } },
          { sequence: 1, anchor: 'call:transfer', payload: { amount: 100 } },
        ],
        candidateTrace: [
          { sequence: 0, anchor: 'phase:init', payload: { v: 1 } },
          { sequence: 1, anchor: 'call:transfer', payload: { amount: 999 } },
        ],
      });

      expect(response.result.totals).toEqual({
        total: 3,
        created: 1,
        updated: 1,
        deleted: 1,
        unchanged: 0,
        totalFieldChanges: 4,
      });
      expect(response.result.divergence).toMatchObject({
        kind: 'mismatch',
        index: 1,
        matchedPrefix: 1,
      });
    });

    it('scans entropy and detects Soroban security signatures', async () => {
      const sample =
        'HostError: Contract Re-entry detected during callback; require_auth failed for account; arithmetic overflow';
      const scan = await analyzeEntropyAndSecurity(sample);

      expect(scan.result.byteLength).toBe(sample.length);
      expect(scan.result.shannonEntropy).toBeGreaterThan(3);
      expect(scan.result.matches.map((m) => m.signatureId)).toEqual(
        expect.arrayContaining([
          'SEC-SOROBAN-REENTRANCY',
          'SEC-SOROBAN-AUTH-BYPASS',
          'SEC-SOROBAN-ARITH-OVERFLOW',
        ]),
      );
      expect(scan.result.riskScore).toBeGreaterThanOrEqual(80);
    });

    it('computes deterministic summary statistics with quantiles', async () => {
      const stats = await analyzeSummaryStatistics([10, 20, 30, 40, 50]);
      expect(stats.result).toMatchObject({
        count: 5,
        sum: 150,
        mean: 30,
        min: 10,
        max: 50,
        p50: 30,
        p90: 46,
      });
    });

    it('analyzes log queries and extracts security matches and top sources', async () => {
      const logResult = await analyzeLogQuery({
        query: 'budget',
        level: 'error',
        entries: [
          {
            id: 'l-1',
            timestamp: 1000,
            level: 'info',
            source: 'runner',
            message: 'Starting fuzz run',
          },
          {
            id: 'l-2',
            timestamp: 2000,
            level: 'error',
            source: 'soroban-host',
            message: 'CpuLimitExceeded: budget exceeded in contract call',
          },
        ],
      });

      expect(logResult.result.matchedIds).toEqual(['l-2']);
      expect(logResult.result.topSources).toEqual([{ source: 'soroban-host', count: 1 }]);
      expect(logResult.result.securityMatches[0]?.signatureId).toBe(
        'SEC-SOROBAN-BUDGET-EXHAUSTED',
      );
    });

    it('analyzes corpus seeds for duplicates, redundancy ratio, and hot contracts', async () => {
      const corpusResult = await analyzeCorpus([
        {
          id: 'seed-a',
          contract: 'token.swap',
          source: 'fuzzer',
          mutation: 'havoc',
          coverage: 22.5,
          crashes: 3,
          size: 400,
          status: 'promoted',
          payloadHex: '0xdeadbeef',
        },
        {
          id: 'seed-b-dup',
          contract: 'token.swap',
          source: 'manual',
          mutation: 'havoc',
          coverage: 22.5,
          crashes: 0,
          size: 400,
          status: 'active',
          payloadHex: '0xdeadbeef',
        },
        {
          id: 'seed-c',
          contract: 'vault.deposit',
          source: 'dictionary',
          mutation: 'splice',
          coverage: 15.0,
          crashes: 1,
          size: 256,
          status: 'active',
          payloadHex: '0xcafebabe',
        },
      ]);

      expect(corpusResult.result.totalSeeds).toBe(3);
      expect(corpusResult.result.uniqueSignatures).toBe(2);
      expect(corpusResult.result.duplicateSeedIds).toEqual(['seed-b-dup']);
      expect(corpusResult.result.redundancyRatio).toBeCloseTo(0.3333, 3);
      expect(corpusResult.result.hotContracts[0]?.contract).toBe('token.swap');
    });

    it('rejects malformed payloads via Zod schema validation', async () => {
      await expect(
        runAnalysisTask({
          operation: 'compute_summary',
          values: [Number.NaN],
        }),
      ).rejects.toBeInstanceOf(AnalysisEngineError);
    });
  });

  describe('Priority Scheduler, Worker Pool, Streaming & Cancellation', () => {
    it('dequeues tasks in strict priority order with FIFO tie-breaking', () => {
      const scheduler = new AnalysisTaskScheduler({ maxQueueDepth: 10 });
      const order: string[] = [];

      const noop = () => {};
      scheduler.enqueue({
        id: 'low-1',
        operation: 'compute_summary',
        priority: 'low',
        payload: {},
        resolve: noop,
        reject: noop,
      });
      scheduler.enqueue({
        id: 'high-1',
        operation: 'compute_summary',
        priority: 'high',
        payload: {},
        resolve: noop,
        reject: noop,
      });
      scheduler.enqueue({
        id: 'critical-1',
        operation: 'compute_summary',
        priority: 'critical',
        payload: {},
        resolve: noop,
        reject: noop,
      });
      scheduler.enqueue({
        id: 'high-2',
        operation: 'compute_summary',
        priority: 'high',
        payload: {},
        resolve: noop,
        reject: noop,
      });

      while (scheduler.size > 0) {
        const next = scheduler.dequeue();
        if (next) order.push(next.id);
      }

      expect(order).toEqual(['critical-1', 'high-1', 'high-2', 'low-1']);
    });

    it('streams progressive chunks and supports AbortController cancellation', async () => {
      const pool = new AnalysisWorkerPool({
        concurrency: 2,
        defaultChunkSize: 2,
        yieldBetweenChunks: true,
      });

      const chunks: AnalysisStreamChunk[] = [];
      const values = [1, 2, 3, 4, 5];
      const res = await analyzeSummaryStatistics(values, {
        pool,
        chunkSize: 2,
        bypassCache: true,
        onProgress: (chunk) => chunks.push(chunk),
      });

      expect(res.chunkCount).toBe(3);
      expect(chunks).toHaveLength(3);
      expect(chunks[2]?.processedItems).toBe(5);

      const abortController = new AbortController();
      abortController.abort();

      await expect(
        analyzeSummaryStatistics([10, 20, 30], {
          pool,
          signal: abortController.signal,
          bypassCache: true,
        }),
      ).rejects.toMatchObject({
        code: 'TASK_CANCELLED',
      });

      pool.shutdown();
    });

    it('processes messages over the Web Worker host protocol', async () => {
      const messages: WorkerResponseMessage[] = [];
      let registeredListener:
        | ((event: MessageEvent<WorkerRequestMessage>) => void)
        | null = null;

      registerAnalysisWorkerHost({
        addEventListener: (_type, listener) => {
          registeredListener = listener;
        },
        postMessage: (msg) => {
          messages.push(msg);
        },
      });

      expect(registeredListener).not.toBeNull();
      await registeredListener!({
        data: {
          type: 'EXECUTE_TASK',
          taskId: 'worker-msg-1',
          chunkSize: 2,
          payload: {
            operation: 'compute_summary',
            values: [5, 15, 25],
          },
        },
      } as MessageEvent<WorkerRequestMessage>);

      // Wait briefly for async handler completion
      await new Promise((r) => setTimeout(r, 25));

      expect(messages.some((m) => m.type === 'TASK_CHUNK')).toBe(true);
      const completeMsg = messages.find((m) => m.type === 'TASK_COMPLETE');
      expect(completeMsg).toBeDefined();
      expect(completeMsg?.taskId).toBe('worker-msg-1');
    });
  });

  describe('Artifact Cache & Content-Hash Invalidation', () => {
    it('returns cached results on identical content hash and invalidates on hash mutation', async () => {
      const cache = new AnalysisArtifactCache({
        maxEntries: 4,
        enableIndexedDb: false,
      });

      const first = await analyzeSummaryStatistics([2, 4, 6, 8], { cache });
      expect(first.cached).toBe(false);

      const second = await analyzeSummaryStatistics([2, 4, 6, 8], { cache });
      expect(second.cached).toBe(true);
      expect(second.contentHash).toBe(first.contentHash);
      expect(second.result).toEqual(first.result);

      await cache.invalidateByHash(first.contentHash);
      const afterInvalidate = await analyzeSummaryStatistics([2, 4, 6, 8], { cache });
      expect(afterInvalidate.cached).toBe(false);
    });
  });

  describe('Golden Parity Harness (WASM vs Reference Fallback)', () => {
    it('produces 100% bit-exact canonical outputs and digests across all golden datasets', async () => {
      const report = await runGoldenParityHarness();
      expect(report.allPassed).toBe(true);
      expect(report.passedCases).toBe(report.totalCases);

      for (const item of report.cases) {
        expect(item.matches).toBe(true);
        expect(item.wasmDigest).toBe(item.referenceDigest);
      }
    });

    it('produces deterministic canonical JSON and content hashes across nested objects', () => {
      const a = { z: [1, { d: 4, c: 3 }], a: 'soroban' };
      const b = { a: 'soroban', z: [1, { c: 3, d: 4 }] };
      expect(canonicalizeJson(a)).toBe(canonicalizeJson(b));
      expect(computeContentHash(a)).toBe(computeContentHash(b));
    });
  });
});
