import { describe, it, expect, vi } from 'vitest';
import type { FuzzingRun } from './types';

const fetchRuns = vi.fn();
vi.mock('../lib/api-client', () => ({
  fetchRuns: (...args: unknown[]) => fetchRuns(...args),
}));

import { createRunsProvider } from './command-palette-runs-provider';

function makeRun(overrides: Partial<FuzzingRun> = {}): FuzzingRun {
  return {
    id: 'run-1',
    status: 'completed',
    area: 'storage',
    severity: 'high',
    duration: 100,
    seedCount: 10,
    crashDetail: null,
    cpuInstructions: 0,
    memoryBytes: 0,
    minResourceFee: 0,
    ...overrides,
  } as unknown as FuzzingRun;
}

describe('createRunsProvider', () => {
  it('maps matching runs to command entries and navigates on run()', async () => {
    fetchRuns.mockResolvedValue({ runs: [makeRun({ id: 'run-42' }), makeRun({ id: 'other-99' })], total: 2 });
    const navigate = vi.fn();
    const provider = createRunsProvider(navigate);

    const controller = new AbortController();
    const entries = await provider.suggest('run-42', controller.signal);

    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('run:run-42');

    await entries[0].run();
    expect(navigate).toHaveBeenCalledWith('/runs/run-42');
  });

  it('returns no results once the signal is aborted', async () => {
    fetchRuns.mockImplementation(async (signal: AbortSignal) => {
      return new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve({ runs: [makeRun()], total: 1 }));
      });
    });
    const provider = createRunsProvider(vi.fn());
    const controller = new AbortController();

    const pending = provider.suggest('run', controller.signal);
    controller.abort();
    const entries = await pending;

    expect(entries).toEqual([]);
  });
});
