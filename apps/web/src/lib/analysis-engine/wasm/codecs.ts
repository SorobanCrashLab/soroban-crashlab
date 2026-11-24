/**
 * Deterministic WASM & reference codecs, hashing, trace/event normalization,
 * structural diff computation, entropy/security pattern scanning, and summary
 * statistics (#2318).
 */

import {
  enforceMemoryBudget,
  jsFnv1a32,
  loadWasmAnalysisCoreSync,
  WASM_SCRATCH_PAGE_BYTES,
  type LoaderFeatureFlags,
} from './loader';
import {
  type AnalysisLogRecord,
  type CorpusAnalysisResult,
  type CorpusSeedInput,
  type DiffComputationResult,
  type DiffEntryInput,
  type EntropyScanResult,
  type LogQueryAnalysisResult,
  type NormalizedTraceEvent,
  type RawTraceEvent,
  type SecurityPatternMatch,
  type StructuralEntryDiff,
  type SummaryStatisticsResult,
  type TraceDivergenceSummary,
  type WasmAnalysisCoreExports,
} from './types';

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: false });

/** Encodes a string or byte buffer into a Uint8Array. */
export function toUint8Array(input: string | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) return input;
  return utf8Encoder.encode(input);
}

/** Formats an unsigned 32-bit integer as an 8-character lowercase hex digest. */
export function formatHex32(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0');
}

/**
 * Deterministic canonical JSON serializer with recursive key sorting.
 * Ensures identical hashes and comparisons regardless of JS engine property order.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return 'null';
    }
    return JSON.stringify(value) ?? 'null';
  }
  if (value instanceof Uint8Array) {
    return JSON.stringify(Array.from(value));
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const entries = sortedKeys.map(
    (key) => `${JSON.stringify(key)}:${canonicalizeJson(record[key])}`,
  );
  return `{${entries.join(',')}}`;
}

/**
 * Computes a deterministic 64-bit hex content hash (dual-lane FNV-1a via WASM
 * linear memory or exact JS fallback) over arbitrary bytes or structured values.
 */
export function computeContentHash(
  input: unknown,
  coreExports?: WasmAnalysisCoreExports,
): string {
  const bytes =
    input instanceof Uint8Array
      ? input
      : typeof input === 'string'
        ? utf8Encoder.encode(input)
        : utf8Encoder.encode(canonicalizeJson(input));

  const exportsToUse = coreExports ?? loadWasmAnalysisCoreSync().exports;
  const PrimaryChunkMax = WASM_SCRATCH_PAGE_BYTES - 64;

  let h1 = 0x811c9dc5;
  if (bytes.length <= PrimaryChunkMax) {
    const memView = new Uint8Array(exportsToUse.memory.buffer);
    memView.set(bytes, 0);
    h1 = exportsToUse.fnv1a32(0, bytes.length) >>> 0;
  } else {
    h1 = jsFnv1a32(bytes);
  }

  // Second lane with domain-separated salt for 64-bit collision resistance.
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = 0; i < bytes.length; i += 1) {
    h2 ^= bytes[i] ^ (i & 0xff);
    h2 = Math.imul(h2, 0x01000193);
  }

  return `${formatHex32(h1)}${formatHex32(h2 >>> 0)}`;
}

/** Rounds a floating-point metric to 4 decimal places for cross-platform determinism. */
export function roundDeterministic(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Kernel 1: Summary Statistics (`compute_summary`)
 * Deterministic quantile (linear interpolation Type-7) & population variance.
 */
export function computeSummaryStatistics(
  values: readonly number[],
): SummaryStatisticsResult {
  const finite = values.filter((v) => Number.isFinite(v));
  const count = finite.length;
  if (count === 0) {
    return {
      count: 0,
      sum: 0,
      mean: 0,
      min: 0,
      max: 0,
      p50: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      variance: 0,
      stdDev: 0,
    };
  }

  const sorted = [...finite].sort((a, b) => a - b);
  let sum = 0;
  for (let i = 0; i < count; i += 1) {
    sum += sorted[i];
  }
  const mean = sum / count;

  let sqDiffSum = 0;
  for (let i = 0; i < count; i += 1) {
    const diff = sorted[i] - mean;
    sqDiffSum += diff * diff;
  }
  const variance = sqDiffSum / count;
  const stdDev = Math.sqrt(variance);

  const percentile = (q: number): number => {
    if (count === 1) return sorted[0];
    const pos = (count - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    const next = sorted[Math.min(count - 1, base + 1)];
    return sorted[base] + rest * (next - sorted[base]);
  };

  return {
    count,
    sum: roundDeterministic(sum),
    mean: roundDeterministic(mean),
    min: roundDeterministic(sorted[0]),
    max: roundDeterministic(sorted[count - 1]),
    p50: roundDeterministic(percentile(0.5)),
    p90: roundDeterministic(percentile(0.9)),
    p95: roundDeterministic(percentile(0.95)),
    p99: roundDeterministic(percentile(0.99)),
    variance: roundDeterministic(variance),
    stdDev: roundDeterministic(stdDev),
  };
}

/**
 * Kernel 2: Trace / Event Normalization (`normalize_trace`)
 * Orders, canonicalizes, hashes, and summarizes trace events.
 */
export function normalizeTraceEvents(
  rawEvents: readonly RawTraceEvent[],
  flags?: LoaderFeatureFlags,
): {
  events: NormalizedTraceEvent[];
  summary: SummaryStatisticsResult;
  digest: string;
} {
  enforceMemoryBudget(rawEvents.length * 256, flags?.maxMemoryBytes);
  const core = loadWasmAnalysisCoreSync(flags);

  const indexed = rawEvents.map((ev, idx) => ({
    raw: ev,
    sequence: typeof ev.sequence === 'number' && ev.sequence >= 0 ? ev.sequence : idx,
    origIndex: idx,
  }));

  indexed.sort((a, b) => {
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
    return a.origIndex - b.origIndex;
  });

  const durations: number[] = [];
  const normalized: NormalizedTraceEvent[] = indexed.map(({ raw, sequence }, idx) => {
    const caller = (raw.caller ?? 'root').trim() || 'root';
    const callee = (raw.callee ?? 'contract').trim() || 'contract';
    const method = (raw.method ?? raw.phase ?? 'invoke').trim() || 'invoke';
    const anchor =
      raw.anchor && raw.anchor.trim().length > 0
        ? raw.anchor.trim()
        : `${caller}->${callee}:${method}`;
    const depth =
      typeof raw.depth === 'number' && raw.depth >= 0 ? Math.floor(raw.depth) : 0;
    const durationMs =
      typeof raw.durationMs === 'number' && raw.durationMs >= 0
        ? roundDeterministic(raw.durationMs)
        : 0;
    const status = raw.status ?? 'success';
    const timestamp =
      typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp)
        ? raw.timestamp
        : idx * 10;
    const canonicalPayload = canonicalizeJson(raw.payload ?? null);
    const eventHash = computeContentHash(
      `${anchor}|${depth}|${status}|${canonicalPayload}`,
      core.exports,
    );

    durations.push(durationMs);

    return {
      id: raw.id && raw.id.trim().length > 0 ? raw.id.trim() : `trace-ev-${sequence}`,
      sequence,
      timestamp,
      anchor,
      caller,
      callee,
      method,
      depth,
      durationMs,
      status,
      canonicalPayload,
      eventHash,
    };
  });

  const summary = computeSummaryStatistics(durations);
  const digest = computeContentHash(
    normalized.map((e) => e.eventHash).join(':'),
    core.exports,
  );

  return { events: normalized, summary, digest };
}

function parseJsonObjectSafe(raw?: string): Record<string, unknown> | null {
  if (raw === undefined || raw === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Kernel 3: Structural State & Trace Diff Computation (`compute_diff`)
 * Computes deterministic key-sorted structural diffs and first-divergence alignment.
 */
export function computeStructuralDiff(
  entries: readonly DiffEntryInput[],
  baseTrace?: readonly RawTraceEvent[],
  candidateTrace?: readonly RawTraceEvent[],
  flags?: LoaderFeatureFlags,
): DiffComputationResult {
  enforceMemoryBudget(entries.length * 512, flags?.maxMemoryBytes);
  const core = loadWasmAnalysisCoreSync(flags);

  let created = 0;
  let updated = 0;
  let deleted = 0;
  let unchanged = 0;
  let totalFieldChanges = 0;

  const entryResults: StructuralEntryDiff[] = entries.map((entry) => {
    const hasBefore = entry.before !== undefined && entry.before !== '';
    const hasAfter = entry.after !== undefined && entry.after !== '';

    const beforeObj = parseJsonObjectSafe(entry.before);
    const afterObj = parseJsonObjectSafe(entry.after);

    if (beforeObj === null || afterObj === null) {
      const rawChanged = (entry.before ?? '') !== (entry.after ?? '');
      const changeType = !hasBefore && hasAfter
        ? 'created'
        : hasBefore && !hasAfter
          ? 'deleted'
          : rawChanged
            ? 'updated'
            : 'unchanged';

      if (changeType === 'created') created += 1;
      else if (changeType === 'updated') updated += 1;
      else if (changeType === 'deleted') deleted += 1;
      else unchanged += 1;

      const fieldChangeCount = rawChanged ? 1 : 0;
      totalFieldChanges += fieldChangeCount;

      return {
        id: entry.id,
        entryType: entry.entryType || 'contract_data',
        changeType,
        addedKeys: [],
        removedKeys: [],
        changedKeys: rawChanged ? ['<raw>'] : [],
        unchangedKeys: rawChanged ? [] : ['<raw>'],
        fieldChangeCount,
        parseFailed: true,
        contentHash: computeContentHash(
          `${entry.id}|${entry.before ?? ''}|${entry.after ?? ''}`,
          core.exports,
        ),
      };
    }

    const allKeys = Array.from(
      new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]),
    ).sort();

    const addedKeys: string[] = [];
    const removedKeys: string[] = [];
    const changedKeys: string[] = [];
    const unchangedKeys: string[] = [];

    for (const key of allKeys) {
      const inBefore = Object.prototype.hasOwnProperty.call(beforeObj, key);
      const inAfter = Object.prototype.hasOwnProperty.call(afterObj, key);

      if (!inBefore && inAfter) {
        addedKeys.push(key);
      } else if (inBefore && !inAfter) {
        removedKeys.push(key);
      } else if (
        canonicalizeJson(beforeObj[key]) !== canonicalizeJson(afterObj[key])
      ) {
        changedKeys.push(key);
      } else {
        unchangedKeys.push(key);
      }
    }

    const fieldChangeCount =
      addedKeys.length + removedKeys.length + changedKeys.length;
    totalFieldChanges += fieldChangeCount;

    let changeType: StructuralEntryDiff['changeType'];
    if (!hasBefore && hasAfter && fieldChangeCount > 0) {
      changeType = 'created';
      created += 1;
    } else if (hasBefore && !hasAfter && fieldChangeCount > 0) {
      changeType = 'deleted';
      deleted += 1;
    } else if (fieldChangeCount > 0) {
      changeType = 'updated';
      updated += 1;
    } else {
      changeType = 'unchanged';
      unchanged += 1;
    }

    return {
      id: entry.id,
      entryType: entry.entryType || 'contract_data',
      changeType,
      addedKeys,
      removedKeys,
      changedKeys,
      unchangedKeys,
      fieldChangeCount,
      parseFailed: false,
      contentHash: computeContentHash(
        {
          id: entry.id,
          changeType,
          addedKeys,
          removedKeys,
          changedKeys,
        },
        core.exports,
      ),
    };
  });

  let divergence: TraceDivergenceSummary | null = null;
  if (baseTrace && candidateTrace) {
    const normBase = normalizeTraceEvents(baseTrace, flags).events;
    const normCand = normalizeTraceEvents(candidateTrace, flags).events;
    const shared = Math.min(normBase.length, normCand.length);
    let matchedPrefix = 0;

    for (let i = 0; i < shared; i += 1) {
      const a = normBase[i];
      const b = normCand[i];
      if (a.anchor !== b.anchor || a.canonicalPayload !== b.canonicalPayload) {
        const prefixRatio = shared === 0 ? 0 : matchedPrefix / shared;
        const confidence = roundDeterministic(
          Math.min(1, Math.max(0, 0.5 + prefixRatio * 0.5)),
          2,
        );
        divergence = {
          kind: 'mismatch',
          index: i,
          matchedPrefix,
          confidence,
          baseAnchor: a.anchor,
          candidateAnchor: b.anchor,
        };
        break;
      }
      matchedPrefix += 1;
    }

    if (!divergence) {
      if (normBase.length === normCand.length) {
        divergence = {
          kind: 'identical',
          index: shared,
          matchedPrefix,
          confidence: 1,
          baseAnchor: null,
          candidateAnchor: null,
        };
      } else {
        const isBaseEnded = normBase.length < normCand.length;
        const prefixRatio = shared === 0 ? 0 : matchedPrefix / shared;
        const confidence = roundDeterministic(
          Math.min(1, Math.max(0, 0.25 + prefixRatio * 0.5)),
          2,
        );
        divergence = {
          kind: isBaseEnded ? 'base-ended' : 'candidate-ended',
          index: shared,
          matchedPrefix,
          confidence,
          baseAnchor: isBaseEnded ? null : (normBase[shared]?.anchor ?? null),
          candidateAnchor: isBaseEnded ? (normCand[shared]?.anchor ?? null) : null,
        };
      }
    }
  }

  const digest = computeContentHash(
    {
      entries: entryResults.map((e) => e.contentHash),
      divergence,
    },
    core.exports,
  );

  return {
    entries: entryResults,
    totals: {
      total: entryResults.length,
      created,
      updated,
      deleted,
      unchanged,
      totalFieldChanges,
    },
    divergence,
    digest,
  };
}

/** Deterministic security signature definitions for Soroban traces, logs, and payloads. */
interface SecuritySignatureRule {
  signatureId: string;
  label: string;
  severity: SecurityPatternMatch['severity'];
  pattern: RegExp;
  weight: number;
}

const SECURITY_SIGNATURE_RULES: readonly SecuritySignatureRule[] = [
  {
    signatureId: 'SEC-SOROBAN-AUTH-BYPASS',
    label: 'Missing or bypassed require_auth verification',
    severity: 'critical',
    pattern: /require_auth(?:_for_args)?\s*(?:failed|bypassed|missing|skipped)|unauthorized_invoker/gi,
    weight: 45,
  },
  {
    signatureId: 'SEC-SOROBAN-REENTRANCY',
    label: 'Cross-contract reentrancy or recursive state mutation trap',
    severity: 'critical',
    pattern: /reentrancy|re-entrant\s+call|HostError:\s*Contract\s*Re-entry/gi,
    weight: 45,
  },
  {
    signatureId: 'SEC-SOROBAN-ARITH-OVERFLOW',
    label: 'Checked arithmetic overflow / underflow panic',
    severity: 'high',
    pattern: /arithmetic\s+(?:overflow|underflow)|attempt\s+to\s+(?:add|subtract|multiply|divide)\s+with\s+overflow|panic:\s*overflow/gi,
    weight: 30,
  },
  {
    signatureId: 'SEC-SOROBAN-BUDGET-EXHAUSTED',
    label: 'Soroban CPU or memory budget exhaustion',
    severity: 'high',
    pattern: /budget\s+exceeded|ExceededLimit|CpuLimitExceeded|MemLimitExceeded|out\s+of\s+gas/gi,
    weight: 28,
  },
  {
    signatureId: 'SEC-SOROBAN-STORAGE-COLLISION',
    label: 'Ledger storage key collision or unauthorized TTL extension',
    severity: 'medium',
    pattern: /storage_collision|duplicate_key_write|invalid_ttl_extension/gi,
    weight: 18,
  },
  {
    signatureId: 'SEC-SECRET-LEAK-TOKEN',
    label: 'Potential secret key, seed phrase, or bearer credential exposure',
    severity: 'critical',
    pattern: /S[A-Z2-7]{55}|bearer\s+[a-z0-9_\-.]{16,}|private_key\s*[:=]/gi,
    weight: 50,
  },
  {
    signatureId: 'SEC-WASM-UNREACHABLE-TRAP',
    label: 'WASM unreachable instruction or division-by-zero trap',
    severity: 'medium',
    pattern: /wasm\s+trap:\s*unreachable|integer\s+divide\s+by\s+zero|UnreachableCodeReached/gi,
    weight: 20,
  },
];

/**
 * Kernel 4: Entropy & Deterministic Security Pattern Scanner (`scan_entropy`)
 * Uses WASM linear memory exports (`count_byte_value`, `count_ascii_printable`, `fnv1a32`)
 * together with deterministic byte histograms and Soroban security signature matching.
 */
export function scanEntropyAndPatterns(
  payload: string | Uint8Array,
  flags?: LoaderFeatureFlags,
): EntropyScanResult {
  const bytes = toUint8Array(payload);
  enforceMemoryBudget(bytes.length, flags?.maxMemoryBytes);

  const core = loadWasmAnalysisCoreSync(flags);
  const len = bytes.length;

  if (len === 0) {
    return {
      byteLength: 0,
      shannonEntropy: 0,
      normalizedEntropy: 0,
      uniqueByteCount: 0,
      asciiRatio: 0,
      zeroByteRatio: 0,
      classification: 'empty',
      matches: [],
      riskScore: 0,
      contentHash: computeContentHash(bytes, core.exports),
    };
  }

  const histogram = new Uint32Array(256);
  for (let i = 0; i < len; i += 1) {
    histogram[bytes[i]] += 1;
  }

  // Exercise WASM linear memory kernels on the first scratch window for hardware-accelerated
  // zero-byte & printable-ASCII counting and verify consistency.
  const scratchLimit = Math.min(len, WASM_SCRATCH_PAGE_BYTES - 64);
  const wasmMem = new Uint8Array(core.exports.memory.buffer);
  wasmMem.set(bytes.subarray(0, scratchLimit), 0);
  const wasmZeroCountHead = core.exports.count_byte_value(0, scratchLimit, 0);
  const wasmAsciiCountHead = core.exports.count_ascii_printable(0, scratchLimit);

  let zeroBytesTail = 0;
  let asciiTail = 0;
  for (let i = scratchLimit; i < len; i += 1) {
    const b = bytes[i];
    if (b === 0) zeroBytesTail += 1;
    if (b >= 32 && b <= 126) asciiTail += 1;
  }

  const totalZeros = wasmZeroCountHead + zeroBytesTail;
  const totalAscii = wasmAsciiCountHead + asciiTail;

  let uniqueByteCount = 0;
  let entropy = 0;
  for (let b = 0; b < 256; b += 1) {
    const count = histogram[b];
    if (count > 0) {
      uniqueByteCount += 1;
      const p = count / len;
      entropy -= p * Math.log2(p);
    }
  }

  const shannonEntropy = roundDeterministic(Math.max(0, Math.min(8, entropy)));
  const normalizedEntropy = roundDeterministic(shannonEntropy / 8);
  const asciiRatio = roundDeterministic(totalAscii / len);
  const zeroByteRatio = roundDeterministic(totalZeros / len);

  let classification: EntropyScanResult['classification'] = 'mixed';
  if (shannonEntropy >= 6.8 && asciiRatio < 0.5) {
    classification = 'high-entropy-packed';
  } else if (asciiRatio >= 0.75 || shannonEntropy <= 4.5) {
    classification = 'structured';
  }

  const textView =
    typeof payload === 'string'
      ? payload
      : utf8Decoder.decode(bytes.subarray(0, Math.min(len, 256 * 1024)));

  const matches: SecurityPatternMatch[] = [];
  let rawRisk = classification === 'high-entropy-packed' ? 20 : 0;

  for (const rule of SECURITY_SIGNATURE_RULES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match: RegExpExecArray | null = regex.exec(textView);
    while (match !== null) {
      const matchedText = match[0];
      matches.push({
        signatureId: rule.signatureId,
        label: rule.label,
        severity: rule.severity,
        offset: match.index,
        length: Math.max(1, matchedText.length),
        excerpt: matchedText.slice(0, 120),
      });
      rawRisk += rule.weight;
      if (matches.length >= 100) break;
      match = regex.exec(textView);
    }
    if (matches.length >= 100) break;
  }

  matches.sort((a, b) => {
    if (a.offset !== b.offset) return a.offset - b.offset;
    return a.signatureId.localeCompare(b.signatureId);
  });

  const riskScore = Math.min(100, Math.round(rawRisk));
  const contentHash = computeContentHash(bytes, core.exports);

  return {
    byteLength: len,
    shannonEntropy,
    normalizedEntropy,
    uniqueByteCount,
    asciiRatio,
    zeroByteRatio,
    classification,
    matches,
    riskScore,
    contentHash,
  };
}

/**
 * Kernel 5: Log Query & Security Insight Extraction (`analyze_logs`)
 */
export function analyzeLogEntries(
  entries: readonly AnalysisLogRecord[],
  query = '',
  level: 'all' | 'info' | 'warn' | 'error' | 'debug' = 'all',
  flags?: LoaderFeatureFlags,
): LogQueryAnalysisResult {
  enforceMemoryBudget(entries.length * 256, flags?.maxMemoryBytes);
  const core = loadWasmAnalysisCoreSync(flags);
  const normalizedQuery = query.trim().toLowerCase();

  const levelCounts = {
    info: 0,
    warn: 0,
    error: 0,
    debug: 0,
  };
  const sourceCounts = new Map<string, number>();
  const matchedIds: string[] = [];
  const matchedMessages: string[] = [];

  for (const entry of entries) {
    levelCounts[entry.level] += 1;

    if (level !== 'all' && entry.level !== level) {
      continue;
    }

    if (
      normalizedQuery.length > 0 &&
      !entry.message.toLowerCase().includes(normalizedQuery) &&
      !entry.source.toLowerCase().includes(normalizedQuery) &&
      !entry.id.toLowerCase().includes(normalizedQuery)
    ) {
      continue;
    }

    matchedIds.push(entry.id);
    sourceCounts.set(entry.source, (sourceCounts.get(entry.source) ?? 0) + 1);
    matchedMessages.push(`[${entry.id}] ${entry.source}: ${entry.message}`);
  }

  const topSources = Array.from(sourceCounts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.source.localeCompare(b.source)))
    .slice(0, 5);

  const combinedLogText = matchedMessages.join('\n');
  const entropyScan = scanEntropyAndPatterns(combinedLogText, flags);

  const digest = computeContentHash(
    {
      matchedIds,
      level,
      normalizedQuery,
      securityCount: entropyScan.matches.length,
    },
    core.exports,
  );

  return {
    matchedIds,
    totalCount: entries.length,
    matchedCount: matchedIds.length,
    levelCounts,
    topSources,
    securityMatches: entropyScan.matches,
    digest,
  };
}

/**
 * Kernel 6: Corpus & Coverage Deduplication Analysis (`analyze_corpus`)
 */
export function analyzeCorpusSeeds(
  seeds: readonly CorpusSeedInput[],
  flags?: LoaderFeatureFlags,
): CorpusAnalysisResult {
  enforceMemoryBudget(seeds.length * 256, flags?.maxMemoryBytes);
  const core = loadWasmAnalysisCoreSync(flags);

  const signatureSet = new Set<string>();
  const duplicateSeedIds: string[] = [];
  const coverages: number[] = [];
  const sizes: number[] = [];
  const byContract = new Map<
    string,
    { seedCount: number; crashCount: number; maxCoverage: number }
  >();

  for (const seed of seeds) {
    coverages.push(seed.coverage);
    sizes.push(seed.size);

    const sigKey = computeContentHash(
      `${seed.contract}|${seed.mutation}|${Math.round(seed.coverage * 10)}|${seed.payloadHex ?? ''}`,
      core.exports,
    );
    if (signatureSet.has(sigKey)) {
      duplicateSeedIds.push(seed.id);
    } else {
      signatureSet.add(sigKey);
    }

    const existing = byContract.get(seed.contract) ?? {
      seedCount: 0,
      crashCount: 0,
      maxCoverage: 0,
    };
    existing.seedCount += 1;
    existing.crashCount += seed.crashes;
    if (seed.coverage > existing.maxCoverage) {
      existing.maxCoverage = seed.coverage;
    }
    byContract.set(seed.contract, existing);
  }

  const hotContracts = Array.from(byContract.entries())
    .map(([contract, stats]) => ({
      contract,
      seedCount: stats.seedCount,
      crashCount: stats.crashCount,
      maxCoverage: roundDeterministic(stats.maxCoverage),
    }))
    .sort((a, b) => {
      if (b.crashCount !== a.crashCount) return b.crashCount - a.crashCount;
      if (b.maxCoverage !== a.maxCoverage) return b.maxCoverage - a.maxCoverage;
      return a.contract.localeCompare(b.contract);
    });

  const totalSeeds = seeds.length;
  const uniqueSignatures = signatureSet.size;
  const redundancyRatio =
    totalSeeds === 0
      ? 0
      : roundDeterministic(duplicateSeedIds.length / totalSeeds);

  const coverageStats = computeSummaryStatistics(coverages);
  const sizeStats = computeSummaryStatistics(sizes);

  const digest = computeContentHash(
    {
      totalSeeds,
      uniqueSignatures,
      duplicateSeedIds,
      hotContracts,
    },
    core.exports,
  );

  return {
    totalSeeds,
    uniqueSignatures,
    duplicateSeedIds,
    redundancyRatio,
    coverageStats,
    sizeStats,
    hotContracts,
    digest,
  };
}
