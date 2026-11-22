/** Parallel git-bisect orchestration with progress and ETA (#2207). */

export interface BisectJob {
  id: string;
  commits: string[];
  workers: number;
  completed: number;
  assignments: Map<string, string>;
  culprit?: string;
}

export interface BisectProgress {
  completed: number;
  total: number;
  percent: number;
  estimatedRemainingSteps: number;
}

/** Create a bisect job over an ordered commit list (newest first). */
export function createBisectJob(id: string, commits: string[], workers = 4): BisectJob {
  if (workers < 1) throw new Error('workers must be >= 1');
  return { id, commits: [...commits], workers, completed: 0, assignments: new Map() };
}

/** Claim the next untested commit for a worker. */
export function claimNext(job: BisectJob, workerId: string): string | undefined {
  for (const commit of job.commits) {
    if (![...job.assignments.values()].includes(commit) && job.culprit === undefined) {
      job.assignments.set(workerId, commit);
      return commit;
    }
  }
  return undefined;
}

/** Record a replay result; a failing commit is the culprit and ends the job. */
export function recordResult(job: BisectJob, workerId: string, crashReproduced: boolean): BisectJob {
  const commit = job.assignments.get(workerId);
  if (!commit) throw new Error(`No assignment for worker ${workerId}`);
  job.assignments.delete(workerId);
  job.completed += 1;
  if (crashReproduced) job.culprit = commit;
  return job;
}

export function bisectProgress(job: BisectJob): BisectProgress {
  const total = job.commits.length;
  const completed = Math.min(total, job.completed);
  return {
    completed,
    total,
    percent: total === 0 ? 100 : Math.round((completed / total) * 100),
    estimatedRemainingSteps: Math.max(0, total - completed),
  };
}
