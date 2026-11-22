import type { LogEntry } from '../app/log-viewer-utils';

export const MOCK_LOG_ENTRIES: LogEntry[] = [
  { id: '1', timestamp: Date.now() - 300_000, level: 'info', source: 'fuzz-worker', message: 'Campaign drive_run started (partition 0/4)' },
  { id: '2', timestamp: Date.now() - 270_000, level: 'debug', source: 'fuzz-worker', message: 'Mutation stream seeded from case id 0x7a3f' },
  { id: '3', timestamp: Date.now() - 240_000, level: 'warn', source: 'rpc', message: 'RPC latency p95 820ms (threshold 750ms)' },
  { id: '4', timestamp: Date.now() - 210_000, level: 'info', source: 'scheduler', message: 'Checkpoint advanced: next_seed_index=18432' },
  { id: '5', timestamp: Date.now() - 180_000, level: 'error', source: 'fuzz-worker', message: 'InvariantViolation: balance_nonnegative (signature recorded)' },
  { id: '6', timestamp: Date.now() - 150_000, level: 'info', source: 'rpc', message: 'Replay envelope submitted for run-1012' },
  { id: '7', timestamp: Date.now() - 120_000, level: 'debug', source: 'scheduler', message: 'PRNG state commit checkpoint=73728' },
  { id: '8', timestamp: Date.now() - 90_000, level: 'warn', source: 'fuzz-worker', message: 'Soft budget warning on contract token (91% instr)' },
  { id: '9', timestamp: Date.now() - 60_000, level: 'error', source: 'rpc', message: 'Transient RPC timeout (attempt 2/3)' },
  { id: '10', timestamp: Date.now() - 30_000, level: 'info', source: 'scheduler', message: 'Partition 0/4 complete – 18432 seeds processed' },
];

export const SEED_LOG_ENTRIES: LogEntry[] = MOCK_LOG_ENTRIES.slice(0, 6).map((entry, index) => ({
  ...entry,
  id: `seed-${index + 1}`,
}));
