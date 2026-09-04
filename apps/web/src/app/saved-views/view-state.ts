import { sanitizeSearchParams, sanitizeSearchQuery } from "../../lib/sanitize";

/**
 * Saved-view state and its URL codec (#1430).
 *
 * A *view* is the whole UI snapshot of the runs surface — filters, sort,
 * columns, search, page. That is deliberately different from a *filter preset*
 * (`saved-filter-presets-utils.ts`), which is a named set of filter values
 * only. Presets answer "which runs"; views answer "which runs, shown how".
 *
 * The codec is versioned so bookmarks survive schema evolution: v2 is current,
 * and v1 links are mapped forward on decode.
 * All decoded URL params are sanitized via sanitizeSearchParams / sanitizeSearchQuery.
 */

export const VIEW_CODEC_VERSION = 2;

/**
 * URLs longer than this are legal but fragile — some proxies, chat clients and
 * older browsers truncate around 2000 characters, so the UI warns before that.
 */
export const URL_LENGTH_WARNING_THRESHOLD = 1800;

export type SortDirection = 'asc' | 'desc';

export interface ViewFilters {
  status: string[];
  area: string[];
  severity: string[];
  /** `null` means "either"; the tri-state matches the existing filter UI. */
  hasCrash: boolean | null;
}

export interface ViewState {
  search: string;
  filters: ViewFilters;
  sort: { key: string; direction: SortDirection };
  columns: string[];
  page: number;
}

/**
 * Deliberately excluded from the encoded state: row selection, open drawers and
 * modals, maintainer mode, and live-refresh toggles. Those are session or
 * identity concerns — sharing them would hand someone else a half-finished
 * interaction rather than a view.
 */
export function createDefaultViewState(): ViewState {
  return {
    search: '',
    filters: { status: [], area: [], severity: [], hasCrash: null },
    sort: { key: 'queuedAt', direction: 'desc' },
    columns: [],
    page: 1,
  };
}

/**
 * Canonical form: lists sorted and de-duplicated, page clamped. Encoding is
 * only reversible if two states that mean the same thing look the same.
 */
export function normalizeViewState(state: ViewState): ViewState {
  const list = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort();
  return {
    search: state.search.trim(),
    filters: {
      status: list(state.filters.status),
      area: list(state.filters.area),
      severity: list(state.filters.severity),
      hasCrash: state.filters.hasCrash,
    },
    sort: {
      key: state.sort.key || 'queuedAt',
      direction: state.sort.direction === 'asc' ? 'asc' : 'desc',
    },
    columns: list(state.columns),
    page: Number.isFinite(state.page) ? Math.max(1, Math.trunc(state.page)) : 1,
  };
}

/** Short parameter names keep shared links inside the length guard. */
const PARAM = {
  version: 'v',
  search: 'q',
  status: 'st',
  area: 'ar',
  severity: 'sv',
  crash: 'cr',
  sortKey: 'sk',
  sortDirection: 'sd',
  columns: 'co',
  page: 'pg',
} as const;

export function encodeViewState(state: ViewState): string {
  const normalized = normalizeViewState({
    ...state,
    search: state.search ? sanitizeSearchQuery(state.search) : "",
  });
  const params = new URLSearchParams();
  params.set(PARAM.version, String(VIEW_CODEC_VERSION));

  // Only non-default values are written, so a plain view yields a short URL.
  if (normalized.search) params.set(PARAM.search, normalized.search);
  if (normalized.filters.status.length) params.set(PARAM.status, normalized.filters.status.join(','));
  if (normalized.filters.area.length) params.set(PARAM.area, normalized.filters.area.join(','));
  if (normalized.filters.severity.length) params.set(PARAM.severity, normalized.filters.severity.join(','));
  if (normalized.filters.hasCrash !== null) {
    params.set(PARAM.crash, normalized.filters.hasCrash ? '1' : '0');
  }
  params.set(PARAM.sortKey, normalized.sort.key);
  params.set(PARAM.sortDirection, normalized.sort.direction);
  if (normalized.columns.length) params.set(PARAM.columns, normalized.columns.join(','));
  if (normalized.page !== 1) params.set(PARAM.page, String(normalized.page));

  return params.toString();
}

function splitList(value: string | null): string[] {
  return value ? value.split(',').filter(Boolean) : [];
}

function readCrash(value: string | null): boolean | null {
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return null;
}

/**
 * v1 used long parameter names and a single `crash` flag. Decoding maps them
 * forward so old bookmarks keep working.
 */
const LEGACY_V1_PARAMS: Record<string, keyof typeof PARAM> = {
  query: 'search',
  status: 'status',
  area: 'area',
  severity: 'severity',
  crash: 'crash',
  sortBy: 'sortKey',
  sortDir: 'sortDirection',
  cols: 'columns',
  page: 'page',
};

export function migrateLegacyParams(params: URLSearchParams): URLSearchParams {
  const migrated = new URLSearchParams(params);
  for (const [legacyName, canonical] of Object.entries(LEGACY_V1_PARAMS)) {
    const value = params.get(legacyName);
    if (value === null) continue;
    // An explicit v2 parameter always wins over its legacy twin.
    if (!migrated.has(PARAM[canonical])) migrated.set(PARAM[canonical], value);
    migrated.delete(legacyName);
  }
  migrated.set(PARAM.version, String(VIEW_CODEC_VERSION));
  return migrated;
}

/**
 * Decodes a querystring. Unknown and future parameters are ignored rather than
 * rejected, so a link written by a newer build still resolves to a usable view.
 */
export function decodeViewState(search: string): ViewState {
  const raw = sanitizeSearchParams(new URLSearchParams(search.startsWith('?') ? search.slice(1) : search));
  const params = raw.get(PARAM.version) === String(VIEW_CODEC_VERSION) ? raw : migrateLegacyParams(raw);

  const pageValue = Number(params.get(PARAM.page) ?? '1');
  const direction = params.get(PARAM.sortDirection);

  return normalizeViewState({
    search: sanitizeSearchQuery(params.get(PARAM.search) ?? ''),
    filters: {
      status: splitList(params.get(PARAM.status)),
      area: splitList(params.get(PARAM.area)),
      severity: splitList(params.get(PARAM.severity)),
      hasCrash: readCrash(params.get(PARAM.crash)),
    },
    sort: {
      key: sanitizeSearchQuery(params.get(PARAM.sortKey) ?? 'queuedAt'),
      direction: direction === 'asc' ? 'asc' : 'desc',
    },
    columns: splitList(params.get(PARAM.columns)),
    page: Number.isFinite(pageValue) ? pageValue : 1,
  });
}

export function buildShareUrl(origin: string, path: string, state: ViewState): string {
  return `${origin.replace(/\/$/, '')}${path}?${encodeViewState(state)}`;
}

export interface UrlLengthCheck {
  length: number;
  tooLong: boolean;
  message?: string;
}

export function checkUrlLength(url: string): UrlLengthCheck {
  const length = url.length;
  if (length <= URL_LENGTH_WARNING_THRESHOLD) return { length, tooLong: false };
  return {
    length,
    tooLong: true,
    message:
      `This link is ${length} characters. Some chat clients and proxies truncate ` +
      `URLs beyond about ${URL_LENGTH_WARNING_THRESHOLD}; narrow the filters or save it as a view instead.`,
  };
}

export function buildEmbedSnippet(url: string, heightPx = 600): string {
  return `<iframe src="${url}" width="100%" height="${heightPx}" style="border:0" title="CrashLab saved view"></iframe>`;
}
