import { api } from '../lib/api-client';
import type { CommandEntry, CommandProvider } from '../lib/command-palette/registry';
import type { FuzzingRun } from './types';

const PALETTE_RESULT_LIMIT = 8;

function runToEntry(run: FuzzingRun, navigate: (path: string) => void): CommandEntry {
  return {
    id: `run:${run.id}`,
    title: `Run ${run.id}`,
    subtitle: `${run.area} · ${run.status} · ${run.severity}`,
    category: 'run',
    keywords: [
      run.area,
      run.status,
      run.severity,
      run.crashDetail?.signature ?? '',
      ...(run.tags ?? []),
    ].filter(Boolean),
    run: () => navigate(`/runs/${run.id}`),
  };
}

export function createRunsProvider(navigate: (path: string) => void): CommandProvider {
  return {
    id: 'runs-provider',
    async suggest(query: string, signal: AbortSignal): Promise<CommandEntry[]> {
      const { results } = await api.runs.search(query, {
        limit: PALETTE_RESULT_LIMIT,
        signal,
      });
      if (signal.aborted) return [];
      return results.map((result) => runToEntry(result.run, navigate));
    },
  };
}
