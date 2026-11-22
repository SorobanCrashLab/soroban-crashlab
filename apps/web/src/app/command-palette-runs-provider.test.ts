import { describe, it, expect, vi } from 'vitest';
import type { FuzzingRun } from './types';

const search = vi.fn();
vi.mock('../lib/api-client', () => ({
  api: { runs: { search: (...args: unknown[]) => search(...args) } },
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

function result(run: FuzzingRun) {
  return { run, score: 100, matchedFields: [] };
}

describe('createRunsProvider', () => {
  it('maps ranked server results to command entries and navigates on run()', async () => {
    search.mockResolvedValue({
      results: [result(makeRun({ id: 'run-42' })), result(makeRun({ id: 'other-99' }))],
      total: 2,
      truncated: false,
      indexed: 2,
      tookMs: 1,
    });
    const navigate = vi.fn();
    const provider = createRunsProvider(navigate);

    const controller = new AbortController();
    const entries = await provider.suggest('run-42', controller.signal);

    expect(search).toHaveBeenCalledWith('run-42', {
      limit: 8,
      signal: controller.signal,
    });
    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe('run:run-42');

    await entries[0].run();
    expect(navigate).toHaveBeenCalledWith('/runs/run-42');
  });

  it('returns no results once the signal is aborted', async () => {
    search.mockImplementation(async (_query: string, options: { signal: AbortSignal }) => {
      return new Promise((resolve) => {
        options.signal.addEventListener('abort', () =>
          resolve({
            results: [result(makeRun())],
            total: 1,
            truncated: false,
            indexed: 1,
            tookMs: 1,
          }),
        );
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
