/** Neighbor navigation for the run detail workspace breadcrumb (#2257). */

export interface RunSummary {
  id: string;
  queuedAt?: string | number;
}

export interface RunNeighbors {
  previous: string | null;
  next: string | null;
  position: number;
  total: number;
}

function timestamp(run: RunSummary): number {
  if (typeof run.queuedAt === 'number') return run.queuedAt;
  if (typeof run.queuedAt === 'string') {
    const parsed = Date.parse(run.queuedAt);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** Runs are ordered newest-first; previous is newer, next is older. */
export function findRunNeighbors(runs: readonly RunSummary[], runId: string): RunNeighbors {
  const ordered = [...runs].sort((a, b) => timestamp(b) - timestamp(a) || a.id.localeCompare(b.id));
  const index = ordered.findIndex((run) => run.id === runId);
  if (index === -1) {
    return { previous: null, next: null, position: 0, total: ordered.length };
  }
  return {
    previous: index > 0 ? ordered[index - 1].id : null,
    next: index < ordered.length - 1 ? ordered[index + 1].id : null,
    position: index + 1,
    total: ordered.length,
  };
}
