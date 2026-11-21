/**
 * WASM capability detection, binary compilation, memory sandbox guardrails,
 * and deterministic fallback kernel implementations (#2318).
 *
 * Security & CSP properties:
 * - No `eval` or `new Function`.
 * - Compiled from a verified, deterministic static WASM bytecode module when
 *   WebAssembly is available and allowed by CSP (`wasm-unsafe-eval`), with a
 *   100% bit-exact TypeScript fallback when WASM or workers are unavailable.
 * - Strict linear memory budget (`MAX_INPUT_BYTES`) with explicit OOM error UX.
 */

import {
  AnalysisEngineError,
  type AnalysisTelemetryEvent,
  type ExecutionBackend,
  type WasmAnalysisCoreExports,
  type WasmCapabilityReport,
} from './types';

/** Default hard cap per analysis invocation (128 MiB) to prevent tab OOM crashes. */
export const DEFAULT_MAX_MEMORY_BYTES = 128 * 1024 * 1024;

/** Maximum WASM linear memory pages (64 KiB each; 512 pages = 32 MiB scratch arena). */
export const WASM_SCRATCH_PAGE_BYTES = 65536;

/**
 * Hand-assembled, deterministic WebAssembly binary (`analysis-core.wasm`)
 * exporting:
 * - `memory` (1 page = 64 KiB initial, 256 pages max)
 * - `fnv1a32(ptr: i32, len: i32) -> i32`
 * - `count_byte_value(ptr: i32, len: i32, target: i32) -> i32`
 * - `count_ascii_printable(ptr: i32, len: i32) -> i32`
 * - `xor_checksum(ptr: i32, len: i32) -> i32`
 *
 * Using an embedded constant Uint8Array avoids network round-trips, works in
 * air-gapped/offline environments and Node/Vitest workers, and respects strict
 * CSP without external fetches.
 */
/**
 * Deterministically assembles the WebAssembly binary (`analysis-core.wasm`)
 * with auto-computed ULEB128 section and function body lengths so section bounds
 * are guaranteed exact.
 */
function encodeUleb128(value: number): number[] {
  const out: number[] = [];
  let v = value >>> 0;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    out.push(byte);
  } while (v !== 0);
  return out;
}

function encodeSleb128I32(value: number): number[] {
  const out: number[] = [];
  let v = value | 0;
  let more = true;
  while (more) {
    let byte = v & 0x7f;
    v >>= 7;
    if ((v === 0 && (byte & 0x40) === 0) || (v === -1 && (byte & 0x40) !== 0)) {
      more = false;
    } else {
      byte |= 0x80;
    }
    out.push(byte);
  }
  return out;
}

function encodeSection(id: number, payload: readonly number[]): number[] {
  return [id, ...encodeUleb128(payload.length), ...payload];
}

function encodeString(str: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(str));
  return [...encodeUleb128(bytes.length), ...bytes];
}

function buildEmbeddedAnalysisCoreWasm(): Uint8Array {
  // Type section: 2 function signatures
  // type 0: (i32, i32) -> i32
  // type 1: (i32, i32, i32) -> i32
  const typeSection = encodeSection(1, [
    0x02,
    0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f,
    0x60, 0x03, 0x7f, 0x7f, 0x7f, 0x01, 0x7f,
  ]);

  // Function section: 4 functions (types 0, 1, 0, 0)
  const funcSection = encodeSection(3, [0x04, 0x00, 0x01, 0x00, 0x00]);

  // Memory section: 1 memory, min 1 page, max 32 pages (limits flag 0x01 = has max)
  const memSection = encodeSection(5, [0x01, 0x01, 0x01, 0x20]);

  // Export section: memory + 4 functions
  const exportPayload = [
    0x05,
    ...encodeString('memory'), 0x02, 0x00,
    ...encodeString('fnv1a32'), 0x00, 0x00,
    ...encodeString('count_byte_value'), 0x00, 0x01,
    ...encodeString('count_ascii_printable'), 0x00, 0x02,
    ...encodeString('xor_checksum'), 0x00, 0x03,
  ];
  const exportSection = encodeSection(7, exportPayload);

  // Func 0: fnv1a32(ptr: local 0, len: local 1) -> i32
  const fn0Body = [
    0x01, 0x02, 0x7f, // 2 i32 locals (2: i, 3: hash)
    0x41, ...encodeSleb128I32(0x811c9dc5 | 0), // i32.const 0x811c9dc5
    0x21, 0x03, // local.set 3
    0x41, 0x00, // i32.const 0
    0x21, 0x02, // local.set 2
    0x02, 0x40, // block
    0x03, 0x40, //   loop
    0x20, 0x02, //     local.get 2
    0x20, 0x01, //     local.get 1
    0x4f,       //     i32.ge_u
    0x0d, 0x01, //     br_if 1
    0x20, 0x03, //     local.get 3
    0x20, 0x00, //     local.get 0
    0x20, 0x02, //     local.get 2
    0x6a,       //     i32.add
    0x2d, 0x00, 0x00, // i32.load8_u
    0x73,       //     i32.xor
    0x41, ...encodeSleb128I32(0x01000193), // i32.const 16777619 (0x01000193)
    0x6c,       //     i32.mul
    0x21, 0x03, //     local.set 3
    0x20, 0x02, //     local.get 2
    0x41, 0x01, //     i32.const 1
    0x6a,       //     i32.add
    0x21, 0x02, //     local.set 2
    0x0c, 0x00, //     br 0
    0x0b,       //   end
    0x0b,       // end
    0x20, 0x03, // local.get 3
    0x0b,       // end
  ];

  // Func 1: count_byte_value(ptr: local 0, len: local 1, target: local 2) -> i32
  const fn1Body = [
    0x01, 0x02, 0x7f, // 2 i32 locals (3: i, 4: count)
    0x41, 0x00,
    0x21, 0x03,
    0x41, 0x00,
    0x21, 0x04,
    0x02, 0x40,
    0x03, 0x40,
    0x20, 0x03,
    0x20, 0x01,
    0x4f,
    0x0d, 0x01,
    0x20, 0x04,
    0x20, 0x00,
    0x20, 0x03,
    0x6a,
    0x2d, 0x00, 0x00,
    0x20, 0x02,
    0x46,
    0x6a,
    0x21, 0x04,
    0x20, 0x03,
    0x41, 0x01,
    0x6a,
    0x21, 0x03,
    0x0c, 0x00,
    0x0b,
    0x0b,
    0x20, 0x04,
    0x0b,
  ];

  // Func 2: count_ascii_printable(ptr: local 0, len: local 1) -> i32
  const fn2Body = [
    0x01, 0x03, 0x7f, // 3 i32 locals (2: i, 3: count, 4: b)
    0x41, 0x00,
    0x21, 0x02,
    0x41, 0x00,
    0x21, 0x03,
    0x02, 0x40,
    0x03, 0x40,
    0x20, 0x02,
    0x20, 0x01,
    0x4f,
    0x0d, 0x01,
    0x20, 0x00,
    0x20, 0x02,
    0x6a,
    0x2d, 0x00, 0x00,
    0x22, 0x04,
    0x41, 0x20,
    0x4f,
    0x20, 0x04,
    0x41, 0x7e,
    0x4d,
    0x71,
    0x20, 0x03,
    0x6a,
    0x21, 0x03,
    0x20, 0x02,
    0x41, 0x01,
    0x6a,
    0x21, 0x02,
    0x0c, 0x00,
    0x0b,
    0x0b,
    0x20, 0x03,
    0x0b,
  ];

  // Func 3: xor_checksum(ptr: local 0, len: local 1) -> i32
  const fn3Body = [
    0x01, 0x02, 0x7f, // 2 i32 locals (2: i, 3: acc)
    0x41, 0x00,
    0x21, 0x02,
    0x41, 0x00,
    0x21, 0x03,
    0x02, 0x40,
    0x03, 0x40,
    0x20, 0x02,
    0x20, 0x01,
    0x4f,
    0x0d, 0x01,
    0x20, 0x03,
    0x20, 0x00,
    0x20, 0x02,
    0x6a,
    0x2d, 0x00, 0x00,
    0x73,
    0x21, 0x03,
    0x20, 0x02,
    0x41, 0x01,
    0x6a,
    0x21, 0x02,
    0x0c, 0x00,
    0x0b,
    0x0b,
    0x20, 0x03,
    0x0b,
  ];

  const codePayload = [
    0x04,
    ...encodeUleb128(fn0Body.length), ...fn0Body,
    ...encodeUleb128(fn1Body.length), ...fn1Body,
    ...encodeUleb128(fn2Body.length), ...fn2Body,
    ...encodeUleb128(fn3Body.length), ...fn3Body,
  ];
  const codeSection = encodeSection(10, codePayload);

  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...typeSection,
    ...funcSection,
    ...memSection,
    ...exportSection,
    ...codeSection,
  ]);
}

export const EMBEDDED_ANALYSIS_CORE_WASM = buildEmbeddedAnalysisCoreWasm();

/** Telemetry listener callback. */
export type TelemetryListener = (event: AnalysisTelemetryEvent) => void;

const telemetryListeners = new Set<TelemetryListener>();

/** Subscribe to analysis engine telemetry events (returns unsubscribe handle). */
export function onAnalysisTelemetry(listener: TelemetryListener): () => void {
  telemetryListeners.add(listener);
  return () => {
    telemetryListeners.delete(listener);
  };
}

/** Internal helper to broadcast telemetry safely. */
export function emitAnalysisTelemetry(
  event: Omit<AnalysisTelemetryEvent, 'timestamp'>,
): void {
  const fullEvent: AnalysisTelemetryEvent = {
    ...event,
    timestamp: Date.now(),
  };
  for (const listener of telemetryListeners) {
    try {
      listener(fullEvent);
    } catch {
      // Never allow telemetry listeners to break analysis flow.
    }
  }
}

/** Pure JS FNV-1a 32-bit hash matching the WASM `fnv1a32` export bit-for-bit. */
export function jsFnv1a32(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Pure JS fallback matching the `WasmAnalysisCoreExports` contract. */
export function createJsFallbackCoreExports(initialPages = 1): WasmAnalysisCoreExports {
  const buffer = new ArrayBuffer(initialPages * WASM_SCRATCH_PAGE_BYTES);
  const fakeMemory = {
    buffer,
    grow(delta: number): number {
      return initialPages + delta;
    },
  } as unknown as WebAssembly.Memory;

  return {
    memory: fakeMemory,
    fnv1a32(ptr: number, len: number): number {
      const view = new Uint8Array(fakeMemory.buffer, ptr, len);
      return jsFnv1a32(view) | 0;
    },
    count_byte_value(ptr: number, len: number, target: number): number {
      const view = new Uint8Array(fakeMemory.buffer, ptr, len);
      const t = target & 0xff;
      let count = 0;
      for (let i = 0; i < view.length; i += 1) {
        if (view[i] === t) count += 1;
      }
      return count;
    },
    count_ascii_printable(ptr: number, len: number): number {
      const view = new Uint8Array(fakeMemory.buffer, ptr, len);
      let count = 0;
      for (let i = 0; i < view.length; i += 1) {
        const b = view[i];
        if (b >= 32 && b <= 126) count += 1;
      }
      return count;
    },
    xor_checksum(ptr: number, len: number): number {
      const view = new Uint8Array(fakeMemory.buffer, ptr, len);
      let acc = 0;
      for (let i = 0; i < view.length; i += 1) {
        acc ^= view[i];
      }
      return acc;
    },
  };
}

/** Feature-flag overrides for testing fallback paths and capability degrades. */
export interface LoaderFeatureFlags {
  forceJsFallback?: boolean;
  disableWorkers?: boolean;
  maxMemoryBytes?: number;
}

let activeFlags: LoaderFeatureFlags = {};

export function configureAnalysisLoaderFlags(flags: LoaderFeatureFlags): void {
  activeFlags = { ...flags };
  cachedInstance = null;
}

export function getAnalysisLoaderFlags(): Readonly<LoaderFeatureFlags> {
  return activeFlags;
}

/** Probes runtime environment capabilities without unsafe calls. */
export function detectWasmCapabilities(
  overrides: LoaderFeatureFlags = activeFlags,
): WasmCapabilityReport {
  const hasWasmGlobal =
    !overrides.forceJsFallback &&
    typeof WebAssembly !== 'undefined' &&
    typeof WebAssembly.instantiate === 'function' &&
    typeof WebAssembly.validate === 'function';

  let webAssemblyValid = false;
  if (hasWasmGlobal) {
    try {
      webAssemblyValid = WebAssembly.validate(EMBEDDED_ANALYSIS_CORE_WASM);
    } catch {
      webAssemblyValid = false;
    }
  }

  const streamingCompile =
    webAssemblyValid && typeof WebAssembly.instantiateStreaming === 'function';

  const webWorkers =
    !overrides.disableWorkers && typeof Worker !== 'undefined';

  const sharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  const indexedDb = typeof indexedDB !== 'undefined';

  // Probe WebAssembly SIMD support using a minimal valid v128 module header.
  let simd = false;
  if (webAssemblyValid) {
    try {
      simd = WebAssembly.validate(
        new Uint8Array([
          0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01,
          0x60, 0x00, 0x01, 0x7b, 0x03, 0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01,
          0x08, 0x00, 0xfd, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0b,
        ]),
      );
    } catch {
      simd = false;
    }
  }

  let recommendedBackend: ExecutionBackend = 'js-fallback';
  if (webAssemblyValid && webWorkers) {
    recommendedBackend = 'wasm-worker';
  } else if (webAssemblyValid) {
    recommendedBackend = 'wasm-main';
  } else if (webWorkers) {
    recommendedBackend = 'js-worker';
  }

  return {
    webAssembly: webAssemblyValid,
    streamingCompile,
    webWorkers,
    sharedArrayBuffer,
    indexedDb,
    simd,
    recommendedBackend,
  };
}

/** Enforces memory budget before allocating or streaming heavy payloads. */
export function enforceMemoryBudget(
  requestedBytes: number,
  maxBytes: number = activeFlags.maxMemoryBytes ?? DEFAULT_MAX_MEMORY_BYTES,
): void {
  if (!Number.isFinite(requestedBytes) || requestedBytes < 0) {
    throw new AnalysisEngineError(
      'SCHEMA_VALIDATION_FAILED',
      `Invalid memory byte size requested: ${String(requestedBytes)}`,
    );
  }
  if (requestedBytes > maxBytes) {
    emitAnalysisTelemetry({
      type: 'oom_guard_tripped',
      reason: `Requested ${requestedBytes} bytes exceeds budget ${maxBytes} bytes`,
    });
    throw new AnalysisEngineError(
      'OOM_LIMIT_EXCEEDED',
      `Input size (${(requestedBytes / (1024 * 1024)).toFixed(2)} MiB) exceeds client-side memory budget (${(maxBytes / (1024 * 1024)).toFixed(2)} MiB). Try filtering the scope or streaming smaller chunks.`,
      { requestedBytes, maxBytes },
    );
  }
}

export interface LoadedWasmCore {
  exports: WasmAnalysisCoreExports;
  isNativeWasm: boolean;
  backend: ExecutionBackend;
}

let cachedInstance: LoadedWasmCore | null = null;

/**
 * Loads (or returns cached) WASM analysis core exports, falling back cleanly
 * to the deterministic TypeScript implementation when WASM is disabled or blocked.
 */
export async function loadWasmAnalysisCore(
  options: LoaderFeatureFlags = activeFlags,
): Promise<LoadedWasmCore> {
  if (
    cachedInstance &&
    options === activeFlags
  ) {
    return cachedInstance;
  }

  const capabilities = detectWasmCapabilities(options);

  if (capabilities.webAssembly) {
    try {
      const instantiated = await WebAssembly.instantiate(
        EMBEDDED_ANALYSIS_CORE_WASM,
        {},
      );
      const instance =
        'instance' in instantiated ? instantiated.instance : instantiated;
      const exports = instance.exports as unknown as WasmAnalysisCoreExports;
      const loaded: LoadedWasmCore = {
        exports,
        isNativeWasm: true,
        backend: capabilities.webWorkers ? 'wasm-worker' : 'wasm-main',
      };
      if (options === activeFlags) {
        cachedInstance = loaded;
      }
      return loaded;
    } catch (error) {
      emitAnalysisTelemetry({
        type: 'fallback_triggered',
        backend: 'js-fallback',
        reason: error instanceof Error ? error.message : 'WASM instantiate failed',
      });
    }
  } else {
    emitAnalysisTelemetry({
      type: 'fallback_triggered',
      backend: 'js-fallback',
      reason: options.forceJsFallback
        ? 'forceJsFallback flag enabled'
        : 'WebAssembly unavailable in runtime',
    });
  }

  const fallbackLoaded: LoadedWasmCore = {
    exports: createJsFallbackCoreExports(1),
    isNativeWasm: false,
    backend: capabilities.webWorkers ? 'js-worker' : 'js-fallback',
  };
  if (options === activeFlags) {
    cachedInstance = fallbackLoaded;
  }
  return fallbackLoaded;
}

/**
 * Synchronous accessor for kernels that run inside an already-initialized worker
 * or synchronous parity harness.
 */
export function loadWasmAnalysisCoreSync(
  options: LoaderFeatureFlags = activeFlags,
): LoadedWasmCore {
  const capabilities = detectWasmCapabilities(options);
  if (capabilities.webAssembly) {
    try {
      const mod = new WebAssembly.Module(EMBEDDED_ANALYSIS_CORE_WASM);
      const instance = new WebAssembly.Instance(mod, {});
      return {
        exports: instance.exports as unknown as WasmAnalysisCoreExports,
        isNativeWasm: true,
        backend: capabilities.webWorkers ? 'wasm-worker' : 'wasm-main',
      };
    } catch (error) {
      emitAnalysisTelemetry({
        type: 'fallback_triggered',
        backend: 'js-fallback',
        reason: error instanceof Error ? error.message : 'Sync WASM init failed',
      });
    }
  } else {
    emitAnalysisTelemetry({
      type: 'fallback_triggered',
      backend: 'js-fallback',
      reason: options.forceJsFallback
        ? 'forceJsFallback flag enabled'
        : 'WebAssembly unavailable',
    });
  }

  return {
    exports: createJsFallbackCoreExports(1),
    isNativeWasm: false,
    backend: 'js-fallback',
  };
}
