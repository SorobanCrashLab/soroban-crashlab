import { describe, it, expect, vi } from 'vitest';
import { buildStaticEntries } from './command-palette-static-entries';

function makeDeps() {
  return {
    navigate: vi.fn(),
    toggleTheme: vi.fn(),
    toggleMaintainerMode: vi.fn(),
    exportCurrentView: vi.fn(),
    onRecentsCleared: vi.fn(),
  };
}

describe('buildStaticEntries', () => {
  it('stays within the curated cap of 40 entries', () => {
    expect(buildStaticEntries(makeDeps()).length).toBeLessThanOrEqual(40);
  });

  it('has unique ids', () => {
    const ids = buildStaticEntries(makeDeps()).map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('wires navigation entries to the navigate callback', () => {
    const deps = makeDeps();
    const entries = buildStaticEntries(deps);
    entries.find((entry) => entry.id === 'nav:runs')?.run();
    expect(deps.navigate).toHaveBeenCalledWith('/runs');
  });

  it('wires the clear-recents action to both clearRecents and the onRecentsCleared callback', () => {
    const deps = makeDeps();
    const entries = buildStaticEntries(deps);
    entries.find((entry) => entry.id === 'action:clear-recent-commands')?.run();
    expect(deps.onRecentsCleared).toHaveBeenCalledTimes(1);
  });
});
