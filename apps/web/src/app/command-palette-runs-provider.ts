/**
 * Feature-owned command palette provider: searches runs by id/status/area.
 * Registered from feature code (see CommandPalette.tsx) — no edits to the
 * palette core (`src/lib/command-palette/registry.ts`) were needed to add it.
 */
import { fetchRuns } from '../lib/api-client';
import type { CommandEntry, CommandProvider } from '../lib/command-palette/registry';
import type { FuzzingRun } from './types';

function runToEntry(run: FuzzingRun, navigate: (path: string) => void): CommandEntry {
  return {
    id: `run:${run.id}`,
    title: `Run ${run.id}`,
    subtitle: `${run.area} · ${run.status} · ${run.severity}`,
    category: 'run',
    keywords: [run.area, run.status, run.severity],
    run: () => navigate(`/runs/${run.id}`),
  };
}

export function createRunsProvider(navigate: (path: string) => void): CommandProvider {
  return {
    id: 'runs-provider',
    async suggest(query: string, signal: AbortSignal): Promise<CommandEntry[]> {
      const { runs } = await fetchRuns(signal);
      if (signal.aborted) return [];

      const needle = query.toLowerCase();
      return runs
        .filter(
          (run) =>
            run.id.toLowerCase().includes(needle) ||
            run.area.toLowerCase().includes(needle) ||
            run.status.toLowerCase().includes(needle),
        )
        .slice(0, 8)
        .map((run) => runToEntry(run, navigate));
    },
  };
}
