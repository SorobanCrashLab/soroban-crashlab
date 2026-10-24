/**
 * lib/comparison/url-state — shareable comparison links (#1877).
 *
 * A comparison is defined entirely by its query string, so it can be pasted
 * into an issue, bookmarked, or replayed from a bug report. Parsing is strict:
 * a link that cannot be honoured returns a reason the page renders inline
 * instead of silently comparing the wrong two runs.
 */

export const MAX_RUN_ID_LENGTH = 128;

export interface ComparisonSearchState {
  base: string;
  candidate: string;
  failureClass?: string;
  contract?: string;
}

export type ComparisonSearchResult =
  | { ok: true; state: ComparisonSearchState }
  | {
      ok: false;
      reason: 'missing-base' | 'missing-candidate' | 'same-run' | 'invalid-id';
      message: string;
    };

export type SearchParamsLike = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function normaliseId(value: string | string[] | undefined): string | null {
  const raw = first(value);
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  if (!id) return null;
  // Run ids are slugs; reject control characters and absurd lengths rather
  // than reflecting them back into the page or the API call.
  if (id.length > MAX_RUN_ID_LENGTH) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(id)) return null;
  return id;
}

function normaliseFilter(value: string | string[] | undefined): string | undefined {
  const raw = first(value);
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_RUN_ID_LENGTH) return undefined;
  return trimmed;
}

/** Parses and validates the comparison query string. */
export function decodeComparisonSearch(params: SearchParamsLike): ComparisonSearchResult {
  const base = normaliseId(params.base);
  const candidate = normaliseId(params.candidate);

  if (params.base !== undefined && base === null) {
    return { ok: false, reason: 'invalid-id', message: 'The baseline run id is not valid.' };
  }
  if (params.candidate !== undefined && candidate === null) {
    return { ok: false, reason: 'invalid-id', message: 'The candidate run id is not valid.' };
  }
  if (!base) {
    return { ok: false, reason: 'missing-base', message: 'Pick a baseline run to compare from.' };
  }
  if (!candidate) {
    return { ok: false, reason: 'missing-candidate', message: 'Pick a candidate run to compare against.' };
  }
  if (base === candidate) {
    return { ok: false, reason: 'same-run', message: 'Pick two different runs — comparing a run with itself shows no changes.' };
  }

  const state: ComparisonSearchState = { base, candidate };
  const failureClass = normaliseFilter(params.failureClass ?? params.class);
  const contract = normaliseFilter(params.contract);
  if (failureClass) state.failureClass = failureClass;
  if (contract) state.contract = contract;

  return { ok: true, state };
}

/** Encodes the minimal, canonical query string for a comparison. */
export function encodeComparisonSearch(state: ComparisonSearchState): string {
  const params = new URLSearchParams();
  params.set('base', state.base);
  params.set('candidate', state.candidate);
  if (state.failureClass) params.set('failureClass', state.failureClass);
  if (state.contract) params.set('contract', state.contract);
  return params.toString();
}

/** Canonical path for sharing/linking a comparison. */
export function comparisonHref(state: ComparisonSearchState): string {
  return `/compare?${encodeComparisonSearch(state)}`;
}

/**
 * Applies the optional filters to a signature sample. A filter only ever hides
 * rows; it never rewrites one, so filtered and unfiltered views agree on the
 * counts they do show.
 */
export function matchesComparisonFilter(
  sample: { failureClass?: string; contract?: string; signature?: string },
  filters: Pick<ComparisonSearchState, 'failureClass' | 'contract'>,
): boolean {
  if (filters.failureClass && sample.failureClass !== filters.failureClass) return false;
  if (filters.contract) {
    const haystack = `${sample.contract ?? ''} ${sample.signature ?? ''}`.toLowerCase();
    if (!haystack.includes(filters.contract.toLowerCase())) return false;
  }
  return true;
}
