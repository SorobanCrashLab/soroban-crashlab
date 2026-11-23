/**
 * Deterministic log dataset used by the log search/tail APIs (#075).
 *
 * A real deployment swaps `eventAt` for a storage cursor. Keeping generation
 * index-based means the API can paginate a 1M+ event corpus without materialising
 * it in memory, while still exercising realistic facets, histograms and redaction.
 */

import { MOCK_LOG_ENTRIES } from '@/fixtures/logs';
import type { LogEvent, LogLevel } from './types';

export const LOG_DATASET_SIZE = 1_000_010;
const FIXTURE_COUNT = MOCK_LOG_ENTRIES.length;
const FIXTURE_STEP_MS = 30_000;
const SYNTHETIC_STEP_MS = 1_000;

/** Anchor is stable for the lifetime of the server process. */
const DATASET_END = Math.floor(Date.now() / 60_000) * 60_000;
const FIXTURE_END = DATASET_END - (FIXTURE_COUNT - 1) * FIXTURE_STEP_MS;

const SOURCES = ['fuzz-worker', 'rpc', 'scheduler', 'replay', 'orchestrator', 'wasm-runner'];
const CONTRACTS = ['token', 'escrow', 'crashlab-core', ' soroban-example'.trim()];
const CAMPAIGNS = ['camp-auth-2026', 'camp-token-fuzz', 'camp-replay-regression'];
const RUNS = ['run-1042', 'run-1043', 'run-1044', 'run-1051'];
const ERROR_CODES = ['INV-001', 'INV-002', 'RPC-TIMEOUT', 'WASM-TRAP', 'PANIC-OOB'];

function hash(index: number, salt: number): number {
  let value = (index ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

export function timestampForIndex(index: number): number {
  if (index < FIXTURE_COUNT) return DATASET_END - index * FIXTURE_STEP_MS;
  return FIXTURE_END - (index - FIXTURE_COUNT + 1) * SYNTHETIC_STEP_MS;
}

/** Inverse of `timestampForIndex`, clamped to the dataset. */
export function indexForTimestamp(timestamp: number): number {
  if (timestamp >= timestampForIndex(FIXTURE_COUNT - 1)) {
    return Math.max(0, Math.min(FIXTURE_COUNT - 1, Math.round((DATASET_END - timestamp) / FIXTURE_STEP_MS)));
  }
  return Math.min(
    LOG_DATASET_SIZE - 1,
    FIXTURE_COUNT + Math.max(0, Math.round((FIXTURE_END - timestamp) / SYNTHETIC_STEP_MS) - 1),
  );
}

function levelFor(index: number): LogLevel {
  const value = hash(index, 0x1a2b3c) % 100;
  if (value < 2) return 'error';
  if (value < 10) return 'warn';
  if (value < 68) return 'info';
  return 'debug';
}

function fromFixture(index: number): LogEvent {
  const fixture = MOCK_LOG_ENTRIES[index];
  return {
    id: `log-${index}`,
    timestamp: timestampForIndex(index),
    level: fixture.level,
    source: fixture.source,
    message: fixture.message,
    contract: index % 2 === 0 ? 'token' : 'crashlab-core',
    run_id: 'run-1042',
    campaign_id: 'camp-auth-2026',
    trace_id: `tr-${1000 + index}`,
    span_id: `sp-${index}`,
    error_code: fixture.level === 'error' ? 'INV-001' : undefined,
    incident_id: index === 4 ? 'inc-14' : undefined,
    artifact_id: index === 5 ? 'art-bundle-3' : undefined,
    attributes: { partition: index % 4, seed_index: 18432 + index },
    redacted: [],
  };
}

/** Generate one event by its stable position in the corpus. */
export function eventAt(index: number): LogEvent {
  if (!Number.isInteger(index) || index < 0 || index >= LOG_DATASET_SIZE) {
    throw new RangeError(`Log index ${index} is outside the dataset`);
  }
  if (index < FIXTURE_COUNT) return fromFixture(index);

  const level = levelFor(index);
  const source = SOURCES[hash(index, 7) % SOURCES.length];
  const contract = CONTRACTS[hash(index, 11) % CONTRACTS.length];
  const runId = RUNS[hash(index, 13) % RUNS.length];
  const campaignId = CAMPAIGNS[hash(index, 17) % CAMPAIGNS.length];
  const traceId = `tr-${1000 + (hash(index, 19) % 900)}`;
  const spanId = `sp-${hash(index, 23) % 5000}`;
  const latency = 120 + (hash(index, 29) % 1800);
  const errorCode = level === 'error' ? ERROR_CODES[hash(index, 31) % ERROR_CODES.length] : undefined;
  const includeSecret = hash(index, 37) % 500 === 0;
  const messages: Record<LogLevel, string> = {
    error: `${errorCode}: invariant violation detected in ${contract}`,
    warn: `RPC latency p95 ${latency}ms exceeds 750ms threshold`,
    info: `Mutation stream committed seed ${hash(index, 41) % 100000} for ${contract}`,
    debug: `Checkpoint advanced: next_seed_index=${18432 + index}`,
  };

  return {
    id: `log-${index}`,
    timestamp: timestampForIndex(index),
    level,
    source,
    message: includeSecret
      ? `${messages[level]} token=sk-live-abcdefghijklmnopqrstuvwxyz`
      : messages[level],
    contract,
    run_id: runId,
    campaign_id: campaignId,
    trace_id: traceId,
    span_id: spanId,
    error_code: errorCode,
    incident_id: level === 'error' && hash(index, 43) % 4 === 0 ? `inc-${hash(index, 47) % 40}` : undefined,
    artifact_id: hash(index, 53) % 50 === 0 ? `art-${hash(index, 59) % 500}` : undefined,
    attributes: {
      latency_ms: latency,
      attempt: 1 + (hash(index, 61) % 3),
      seed_index: 18432 + index,
      ...(includeSecret ? { authorization: 'Bearer sk-live-abcdefghijklmnopqrstuvwxyz' } : {}),
    },
    redacted: [],
  };
}

/**
 * Index bounds for a time window. Returns inclusive start/end indices.
 */
export function indexRangeForWindow(from: number, to: number): { start: number; end: number } {
  const start = Math.max(0, Math.min(LOG_DATASET_SIZE - 1, indexForTimestamp(to)));
  const end = Math.max(start, Math.min(LOG_DATASET_SIZE - 1, indexForTimestamp(from)));
  return { start, end };
}
