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

function normaliseToken(token: string): string {
  return token.trim().toLowerCase();
}

// Lightweight fuzzy matching tuned for UI filtering:
// - Exact substring match passes immediately.
// - Otherwise allow near matches based on a small Levenshtein distance,
//   computed against the best matching substring window.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure a is the shorter string to reduce memory.
  if (a.length > b.length) {
    const tmp = a;
    a = b;
    b = tmp;
  }

  const previous = new Array(a.length + 1).fill(0).map((_, i) => i);
  const current = new Array(a.length + 1).fill(0);

  for (let j = 1; j <= b.length; j++) {
    current[0] = j;
    const bj = b.charAt(j - 1);

    for (let i = 1; i <= a.length; i++) {
      const ai = a.charAt(i - 1);
      const cost = ai === bj ? 0 : 1;

      current[i] = Math.min(
        previous[i] + 1, // deletion
        current[i - 1] + 1, // insertion
        previous[i - 1] + cost // substitution
      );
    }

    for (let i = 0; i <= a.length; i++) previous[i] = current[i];
  }

  return previous[a.length];
}

function fuzzyTokenMatch(haystack: string, token: string): boolean {
  const t = normaliseToken(token);
  if (!t) return true;
  if (haystack.includes(t)) return true;

  // Find a best-effort window in haystack to compare against.
  // We consider windows of similar length; fuzzy matching too aggressively will hurt precision.
  const targetLen = t.length;
  const minLen = Math.max(1, targetLen - 2);
  const maxLen = targetLen + 2;

  let best = Infinity;

  // If token is very short, be conservative (typos are less reliable).
  const maxDistance = targetLen <= 3 ? 1 : targetLen <= 6 ? 2 : 3;

  for (let start = 0; start < haystack.length; start++) {
    for (let w = minLen; w <= maxLen; w++) {
      if (start + w > haystack.length) break;
      const window = haystack.substring(start, start + w);
      // Quick filter: if first/last chars mismatch often, skip (cheap heuristic).
      if (window.charAt(0) !== t.charAt(0) && window.charAt(window.length - 1) !== t.charAt(t.length - 1)) {
        continue;
      }
      const d = levenshtein(t, window);
      if (d < best) best = d;
      if (best <= maxDistance) return true;
    }
  }

  return best <= maxDistance;
}

function fuzzyIncludesAllTokens(haystack: string, tokens: string[]): boolean {
  const h = haystack.toLowerCase();
  return tokens.every((t) => fuzzyTokenMatch(h, t));
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
    // Optional timestamps (often searched during triage)
    r.queuedAt,
    r.startedAt,
    r.finishedAt,
    crash?.failureCategory,
    crash?.signature,
    crash?.signatureHash,
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
    return fuzzyIncludesAllTokens(text, tokens);
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
