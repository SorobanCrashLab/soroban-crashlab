/**
 * Pure helpers shared by the run timeline components.
 *
 * Fixes #1076: the timelines key their rendered rows on `run.id`, but nothing
 * guaranteed the incoming `runs` prop held distinct ids. Callers build that array
 * by merging polled results with already-loaded pages, so the same run routinely
 * appears twice — React then warns "Encountered two children with the same key"
 * and reconciliation gets confused about which row is which. Deduplicating on the
 * way in keeps the keys unique at the source instead of papering over it with a
 * composite key (which would silently render the same run twice).
 *
 * Kept free of React/JSX so it can be unit-tested with the repo's tsc + node
 * harness.
 */

/** Minimal shape the timelines need: anything carrying a string `id`. */
interface HasId {
  id: string;
}

/**
 * Drop later entries whose `id` was already seen, preserving the order of first
 * appearance. The first occurrence wins because callers prepend freshly polled
 * runs, so it carries the most recent data.
 */
export function dedupeRunsById<T extends HasId>(runs: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const run of runs) {
    if (seen.has(run.id)) continue;
    seen.add(run.id);
    unique.push(run);
  }

  return unique;
}

/** Whether an array contains repeated ids — used to assert the fix in tests. */
export function hasDuplicateIds(runs: readonly HasId[]): boolean {
  return new Set(runs.map((run) => run.id)).size !== runs.length;
}
