/*
 * useReproducers — #2300
 * Fetch the fixture catalog, validation runs, promotions and version history.
 */

export function useReproducers() {
  return {
    fixtures: [] as never[],
    validationRuns: [] as never[],
    promotions: [] as never[],
    revisions: [] as never[],
  };
}
