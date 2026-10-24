export const MAX_SEARCH_RESULTS = 200;
export const DEFAULT_SEARCH_LIMIT = 50;
export const MAX_QUERY_TERMS = 12;
export const SEARCH_TRUNCATION_HINT =
  'Showing the top matches. Narrow your query for more specific results.';

export type SearchSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SearchField {
  key: string;
  label: string;
  value: string;
}

export interface SearchDocument {
  id: string;
  fields: SearchField[];
  timestamp?: number;
  count?: number;
  severity?: SearchSeverity;
}

export interface MatchedField {
  field: string;
  value: string;
}

export interface SearchHit {
  document: SearchDocument;
  score: number;
  matchedFields: MatchedField[];
}

export interface RankOptions {
  limit?: number;
  now?: number;
  maxEditDistance?: number;
}

export interface RankOutcome {
  hits: SearchHit[];
  total: number;
  truncated: boolean;
  hint?: string;
}

const EXACT_ID_SCORE = 1000;
const EXACT_VALUE_SCORE = 500;
const PREFIX_ID_SCORE = 700;
const PREFIX_VALUE_SCORE = 300;
const EXACT_TOKEN_SCORE = 400;
const PREFIX_TOKEN_SCORE = 250;
const SUBSTRING_VALUE_SCORE = 180;
const FUZZY_DISTANCE_ONE_SCORE = 160;
const FUZZY_DISTANCE_TWO_SCORE = 80;

const MAX_RECENCY_BOOST = 100;
const RECENCY_WINDOW_DAYS = 30;
const MAX_COUNT_BOOST = 80;
const MAX_COVERAGE_BOOST = 80;
const MAX_FIELD_SPREAD_BOOST = 60;

const SEVERITY_BOOST: Record<SearchSeverity, number> = {
  critical: 40,
  high: 30,
  medium: 15,
  low: 5,
};

const FIELD_WEIGHTS: Record<string, number> = {
  id: 2.4,
  signature: 1.8,
  contract: 1.6,
  tag: 1.25,
  tags: 1.25,
  category: 1.2,
  issue: 1.0,
  area: 1.0,
  status: 1.0,
  severity: 0.9,
  annotation: 0.8,
  payload: 0.8,
  detail: 0.8,
  metric: 0.7,
};

const DAY_MS = 86_400_000;

export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).toLowerCase().trim();
}

export function tokenize(value: unknown): string[] {
  return normalizeText(value).match(/[\p{L}\p{N}_]+/gu) ?? [];
}

export function queryTerms(query: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const token of tokenize(query)) {
    if (seen.has(token)) continue;
    seen.add(token);
    terms.push(token);
    if (terms.length >= MAX_QUERY_TERMS) break;
  }
  return terms;
}

export function maxEditDistanceFor(term: string, override?: number): number {
  if (override !== undefined) return Math.max(0, override);
  if (term.length <= 2) return 0;
  if (term.length <= 4) return 1;
  return 2;
}

export function boundedEditDistance(a: string, b: string, maxDistance: number): number {
  if (a === b) return 0;
  if (maxDistance <= 0) return maxDistance + 1;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  const previous = new Array<number>(b.length + 1);
  const current = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) previous[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMinimum = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      const insertion = current[j - 1] + 1;
      const deletion = previous[j] + 1;
      current[j] = Math.min(substitution, insertion, deletion);
      if (current[j] < rowMinimum) rowMinimum = current[j];
    }
    if (rowMinimum > maxDistance) return maxDistance + 1;
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }

  return previous[b.length] <= maxDistance ? previous[b.length] : maxDistance + 1;
}

function fieldWeight(key: string): number {
  return FIELD_WEIGHTS[key] ?? 0.7;
}

function isWordCharacter(character: string | undefined): boolean {
  if (character === undefined) return false;
  const code = character.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95 ||
    code > 127
  );
}

function literalTokenMatch(
  value: string,
  term: string,
): 'exact-token' | 'prefix-token' | 'substring' | null {
  let from = 0;
  let found = false;
  for (;;) {
    const at = value.indexOf(term, from);
    if (at === -1) break;
    found = true;
    const startsToken = at === 0 || !isWordCharacter(value[at - 1]);
    const endsToken =
      at + term.length === value.length || !isWordCharacter(value[at + term.length]);
    if (startsToken && endsToken) return 'exact-token';
    if (startsToken) return 'prefix-token';
    from = at + 1;
  }
  return found ? 'substring' : null;
}

function scoreField(field: SearchField, term: string, maxDistance: number): number {
  const value = normalizeText(field.value);
  if (value.length === 0) return 0;

  const isId = field.key === 'id';
  if (value === term) return isId ? EXACT_ID_SCORE : EXACT_VALUE_SCORE;
  if (value.startsWith(term)) return isId ? PREFIX_ID_SCORE : PREFIX_VALUE_SCORE;

  const literal = literalTokenMatch(value, term);
  if (literal === 'exact-token') return EXACT_TOKEN_SCORE;
  if (literal === 'prefix-token') return PREFIX_TOKEN_SCORE;
  if (literal === 'substring') return SUBSTRING_VALUE_SCORE;

  if (maxDistance <= 0) return 0;
  let bestDistance = maxDistance + 1;
  for (const token of tokenize(value)) {
    if (Math.abs(token.length - term.length) > maxDistance) continue;
    const distance = boundedEditDistance(term, token, maxDistance);
    if (distance < bestDistance) bestDistance = distance;
    if (bestDistance === 1) break;
  }

  if (bestDistance === 1) return FUZZY_DISTANCE_ONE_SCORE;
  if (bestDistance === 2) return FUZZY_DISTANCE_TWO_SCORE;
  return 0;
}

function recencyBoost(timestamp: number | undefined, now: number): number {
  if (timestamp === undefined || !Number.isFinite(timestamp)) return 0;
  const ageDays = Math.max(0, (now - timestamp) / DAY_MS);
  const freshness = Math.max(0, 1 - ageDays / RECENCY_WINDOW_DAYS);
  return freshness * MAX_RECENCY_BOOST;
}

function scoreDocument(
  document: SearchDocument,
  terms: string[],
  normalizedQuery: string,
  now: number,
  maxEditDistance: number | undefined,
): SearchHit | null {
  if (document.fields.length === 0) return null;

  let score = 0;
  let matchedTerms = 0;
  let fieldMatches = 0;

  const idField = document.fields.find((field) => field.key === 'id');
  if (idField) {
    const idValue = normalizeText(idField.value);
    const idScore =
      idValue === normalizedQuery
        ? EXACT_ID_SCORE
        : idValue.startsWith(normalizedQuery)
          ? PREFIX_ID_SCORE
          : 0;
    if (idScore > 0) {
      score += idScore * fieldWeight('id');
      matchedTerms += 1;
      fieldMatches += 1;
    }
  }

  for (const term of terms) {
    const termDistance = maxEditDistanceFor(term, maxEditDistance);
    let bestTermScore = 0;

    for (const field of document.fields) {
      const rawScore = scoreField(field, term, termDistance);
      if (rawScore === 0) continue;

      fieldMatches += 1;
      const weighted = rawScore * fieldWeight(field.key);
      if (weighted > bestTermScore) bestTermScore = weighted;
    }

    if (bestTermScore > 0) {
      matchedTerms += 1;
      score += bestTermScore;
    }
  }

  if (matchedTerms === 0) return null;

  score += Math.min(MAX_COVERAGE_BOOST, matchedTerms * 20);
  score += Math.min(
    MAX_FIELD_SPREAD_BOOST,
    Math.max(0, fieldMatches - matchedTerms) * 8,
  );
  score += recencyBoost(document.timestamp, now);
  score += SEVERITY_BOOST[document.severity ?? 'low'];
  score += Math.min(MAX_COUNT_BOOST, Math.log1p(Math.max(0, document.count ?? 0)) * 10);

  return {
    document,
    score: Math.round(score * 100) / 100,
    matchedFields: [],
  };
}

function matchedFieldsFor(
  document: SearchDocument,
  terms: string[],
  maxEditDistance: number | undefined,
): MatchedField[] {
  const bestByField = new Map<string, { score: number; field: SearchField }>();

  for (const term of terms) {
    const termDistance = maxEditDistanceFor(term, maxEditDistance);
    for (const field of document.fields) {
      const rawScore = scoreField(field, term, termDistance);
      if (rawScore === 0) continue;
      const weighted = rawScore * fieldWeight(field.key);
      const existing = bestByField.get(field.key);
      if (!existing || weighted > existing.score) {
        bestByField.set(field.key, { score: weighted, field });
      }
    }
  }

  return [...bestByField.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ field }) => ({ field: field.label, value: field.value }));
}

function compareHits(a: SearchHit, b: SearchHit): number {
  if (b.score !== a.score) return b.score - a.score;
  const aTime = a.document.timestamp ?? 0;
  const bTime = b.document.timestamp ?? 0;
  if (bTime !== aTime) return bTime - aTime;
  return a.document.id.localeCompare(b.document.id);
}

function insertTopHit(kept: SearchHit[], hit: SearchHit, limit: number): void {
  if (kept.length < limit) {
    kept.push(hit);
    if (kept.length === limit) kept.sort(compareHits);
    return;
  }

  if (compareHits(hit, kept[kept.length - 1]) >= 0) return;

  let low = 0;
  let high = kept.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compareHits(hit, kept[middle]) < 0) high = middle;
    else low = middle + 1;
  }
  kept.splice(low, 0, hit);
  kept.pop();
}

export function rankDocuments(
  documents: Iterable<SearchDocument>,
  query: string,
  options: RankOptions = {},
): RankOutcome {
  const terms = queryTerms(query);
  if (terms.length === 0) {
    return { hits: [], total: 0, truncated: false };
  }

  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_SEARCH_LIMIT, MAX_SEARCH_RESULTS));
  const now = options.now ?? Date.now();
  const normalizedQuery = normalizeText(query).replace(/\s+/g, ' ');
  const kept: SearchHit[] = [];
  let total = 0;

  for (const document of documents) {
    const hit = scoreDocument(document, terms, normalizedQuery, now, options.maxEditDistance);
    if (!hit) continue;
    total += 1;
    insertTopHit(kept, hit, limit);
  }

  if (kept.length < limit) kept.sort(compareHits);

  const hits = kept.map((hit) => ({
    ...hit,
    matchedFields: matchedFieldsFor(hit.document, terms, options.maxEditDistance),
  }));

  const truncated = total > hits.length;
  return {
    hits,
    total,
    truncated,
    hint: truncated ? SEARCH_TRUNCATION_HINT : undefined,
  };
}
