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

type Stringish = string | number | boolean | null | undefined;

function normalizeForSearch(value: Stringish): string {
  if (value === null || value === undefined) return '';
  return String(value).toLowerCase();
}

function tokenise(term: string): string[] {
  return term
    .toLowerCase()
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

function includesAllTokens(haystack: string, tokens: string[]): boolean {
  return tokens.every((t) => haystack.includes(t));
}

function runToSearchableText(r: FuzzingRun): string {
  const crash = r.crashDetail;
  return [
    r.id,
    r.status,
    r.area,
    r.severity,
    r.duration,
    r.seedCount,
    r.cpuInstructions,
    r.memoryBytes,
    r.minResourceFee,
    crash?.failureCategory,
    crash?.signature,
    crash?.payload,
    crash?.replayAction,
    ...(r.tags ?? []),
    ...(r.annotations ?? []),
    ...(r.associatedIssues?.flatMap((i) => [i.label, i.href]) ?? []),
  ]
    .map((v) => normalizeForSearch(v as Stringish))
    .join(' ');
}

export function filterBySearchTerm(runs: FuzzingRun[], term: string): FuzzingRun[] {
  const tokens = tokenise(term);
  if (tokens.length === 0) return runs;
  return runs.filter((r) => {
    const text = runToSearchableText(r);
    return includesAllTokens(text, tokens);
  });
}

export function filterByCrash(runs: FuzzingRun[], hasCrash: boolean | null): FuzzingRun[] {
  if (hasCrash === null) return runs;
  return runs.filter((r) => (hasCrash ? r.crashDetail !== null : r.crashDetail === null));
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
