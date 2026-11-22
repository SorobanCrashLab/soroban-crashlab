import { describe, it, expect, vi } from 'vitest';
import { createCommandRegistry, type CommandEntry, type CommandProvider } from './registry';

function entry(id: string, title: string): CommandEntry {
  return { id, title, category: 'action', run: vi.fn() };
}

describe('command registry search', () => {
  it('returns all static entries for an empty query, unscored', async () => {
    const registry = createCommandRegistry();
    registry.registerEntries([entry('a', 'Toggle theme'), entry('b', 'Toggle maintainer mode')]);

    const controller = new AbortController();
    const results = await registry.search('', { signal: controller.signal });

    expect(results.map((r) => r.entry.id).sort()).toEqual(['a', 'b']);
  });

  it('filters static entries by fuzzy match', async () => {
    const registry = createCommandRegistry();
    registry.registerEntries([entry('theme', 'Toggle theme'), entry('maintainer', 'Toggle maintainer mode')]);

    const controller = new AbortController();
    const results = await registry.search('thm', { signal: controller.signal });

    expect(results.map((r) => r.entry.id)).toEqual(['theme']);
  });

  it('weights command titles above descriptions and keywords', async () => {
    const registry = createCommandRegistry();
    registry.registerEntries([
      { ...entry('keyword-match', 'Open settings'), keywords: ['theme'] },
      { ...entry('title-match', 'Toggle theme') },
    ]);

    const results = await registry.search('theme', { signal: new AbortController().signal });

    expect(results[0].entry.id).toBe('title-match');
  });

  it('filters context-specific entries and providers', async () => {
    const registry = createCommandRegistry();
    registry.registerEntries([
      { ...entry('run-action', 'Replay run'), when: ({ pathname }) => pathname.startsWith('/runs/') },
      entry('global-action', 'Open settings'),
    ]);
    registry.registerProvider({
      id: 'runs-only',
      when: ({ pathname }) => pathname.startsWith('/runs/'),
      suggest: async () => [entry('provider-run', 'Run result')],
    });

    const results = await registry.search('run', {
      signal: new AbortController().signal,
      context: { pathname: '/settings' },
    });

    expect(results.map(({ entry: result }) => result.id)).toEqual([]);
  });

  it('boosts recent entries above higher raw-scoring matches', async () => {
    const registry = createCommandRegistry();
    registry.registerEntries([entry('run-x', 'Run X details'), entry('run-y', 'Run Y details')]);

    const controller = new AbortController();
    const results = await registry.search('run', {
      signal: controller.signal,
      recentIds: ['run-y'],
    });

    expect(results[0].entry.id).toBe('run-y');
  });

  it('merges provider results and dedupes by id, static entries winning', async () => {
    const registry = createCommandRegistry();
    registry.registerEntries([entry('shared-id', 'Static Title')]);
    const provider: CommandProvider = {
      id: 'test-provider',
      suggest: async () => [entry('shared-id', 'Provider Title'), entry('only-provider', 'Only Provider')],
    };
    registry.registerProvider(provider);

    const controller = new AbortController();
    const results = await registry.search('title', { signal: controller.signal });

    const shared = results.find((r) => r.entry.id === 'shared-id');
    expect(shared?.entry.title).toBe('Static Title');
    expect(results.some((r) => r.entry.id === 'only-provider')).toBe(true);
  });

  it('discards provider results once the query signal has been aborted (cancellation-safe)', async () => {
    const registry = createCommandRegistry();
    const controller = new AbortController();

    const provider: CommandProvider = {
      id: 'slow-provider',
      // Ignores the signal and resolves anyway — the registry must still
      // discard the result once the caller has moved on to a newer query.
      suggest: () =>
        new Promise((resolve) => {
          setTimeout(() => resolve([entry('stale', 'Stale result')]), 10);
        }),
    };
    registry.registerProvider(provider);

    const pending = registry.search('stale', { signal: controller.signal });
    controller.abort();
    const results = await pending;

    expect(results).toEqual([]);
  });

  it('a rejecting provider does not break aggregation of other results', async () => {
    const registry = createCommandRegistry();
    registry.registerEntries([entry('nav', 'Go to Runs')]);
    registry.registerProvider({
      id: 'broken-provider',
      suggest: async () => {
        throw new Error('boom');
      },
    });

    const controller = new AbortController();
    const results = await registry.search('runs', { signal: controller.signal });

    expect(results.map((r) => r.entry.id)).toEqual(['nav']);
  });

  it('unregister callbacks remove entries and providers', async () => {
    const registry = createCommandRegistry();
    const unregister = registry.registerEntries([entry('temp', 'Temporary entry')]);
    unregister();

    const controller = new AbortController();
    const results = await registry.search('', { signal: controller.signal });

    expect(results).toEqual([]);
  });

  it('listEntries exposes a read-only snapshot of registered static entries', () => {
    const registry = createCommandRegistry();
    registry.registerEntries([entry('a', 'Toggle theme'), entry('b', 'Toggle maintainer mode')]);

    expect(registry.listEntries().map((e) => e.id).sort()).toEqual(['a', 'b']);

    // Providers are query-driven and not part of the snapshot.
    registry.registerProvider({
      id: 'test-provider',
      suggest: async () => [entry('run-y', 'Run Y details')],
    });
    expect(registry.listEntries().map((e) => e.id).sort()).toEqual(['a', 'b']);
  });
});
