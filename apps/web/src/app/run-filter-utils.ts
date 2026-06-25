import { FuzzingRun, RunStatus, RunArea, RunSeverity } from './types';

export interface RunFilters {
  status: RunStatus[];
  area: RunArea[];
  severity: RunSeverity[];
  searchTerm: string;
  hasCrash: boolean | null;
}

export function filterByStatus(runs: FuzzingRun[], statuses: RunStatus[]): FuzzingRun[] {
  if (statuses.length === 0) return runs;
  return runs.filter((r) => statuses.includes(r.status));
}

export function filterByArea(runs: FuzzingRun[], areas: RunArea[]): FuzzingRun[] {
  if (areas.length === 0) return runs;
  return runs.filter((r) => areas.includes(r.area));
}

export function filterBySeverity(runs: FuzzingRun[], severities: RunSeverity[]): FuzzingRun[] {
  if (severities.length === 0) return runs;
  return runs.filter((r) => severities.includes(r.severity));
}

export function filterBySearchTerm(runs: FuzzingRun[], term: string): FuzzingRun[] {
  if (!term.trim()) return runs;
  const lower = term.toLowerCase();
  return runs.filter((r) => r.id.toLowerCase().includes(lower));
}

export function filterByCrash(runs: FuzzingRun[], hasCrash: boolean | null): FuzzingRun[] {
  if (hasCrash === null) return runs;
  return runs.filter((r) => hasCrash ? r.crashDetail !== null : r.crashDetail === null);
}

export function applyRunFilters(runs: FuzzingRun[], filters: RunFilters): FuzzingRun[] {
  return filterByCrash(
    filterBySearchTerm(
      filterBySeverity(
        filterByArea(
          filterByStatus(runs, filters.status),
          filters.area
        ),
        filters.severity
      ),
      filters.searchTerm
    ),
    filters.hasCrash
  );
}
