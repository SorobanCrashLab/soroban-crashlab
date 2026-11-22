import { FuzzingRun } from './types';

export interface FuzzySearchResult {
  run: FuzzingRun;
  score: number;
  matchedFields: Array<{ field: string; value: string }>;
}

function normalize(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).toLowerCase().trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (a.length > b.length) [a, b] = [b, a];
  const row = new Array(a.length + 1).fill(0).map((_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = row[0];
    row[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const tmp = row[i];
      row[i] = Math.min(
        prev + (a[i - 1] === b.charAt(j - 1) ? 0 : 1),
        row[i] + 1,
        row[i - 1] + 1,
      );
      prev = tmp;
    }
  }
  return row[a.length];
}

function fieldScore(haystack: string, needle: string): number {
  if (!needle || !haystack) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (h === n) return 100;
  if (h.startsWith(n)) return 90;
  if (h.includes(n)) return 75;
  const dist = levenshtein(n, h.substring(0, Math.min(h.length, n.length + 3)));
  if (dist <= 1) return 60;
  if (dist <= 2) return 40;
  if (dist <= 3) return 20;
  const words = h.split(/\s+/);
  for (const word of words) {
    if (word.includes(n)) return 50;
    const wd = levenshtein(n, word);
    if (wd <= 1) return 45;
    if (wd <= 2) return 25;
  }
  return 0;
}

interface RunField {
  key: string;
  label: string;
  value: string;
}

function getRunFields(run: FuzzingRun): RunField[] {
  const fields: RunField[] = [
    { key: 'id', label: 'Run ID', value: normalize(run.id) },
    { key: 'status', label: 'Status', value: normalize(run.status) },
    { key: 'area', label: 'Area', value: normalize(run.area) },
    { key: 'severity', label: 'Severity', value: normalize(run.severity) },
    { key: 'duration', label: 'Duration', value: normalize(run.duration) },
    { key: 'seedCount', label: 'Seed Count', value: normalize(run.seedCount) },
    { key: 'cpuInstructions', label: 'CPU Instructions', value: normalize(run.cpuInstructions) },
    { key: 'memoryBytes', label: 'Memory Bytes', value: normalize(run.memoryBytes) },
    { key: 'minResourceFee', label: 'Min Resource Fee', value: normalize(run.minResourceFee) },
  ];
  if (run.crashDetail) {
    fields.push({ key: 'crashDetail.failureCategory', label: 'Failure Category', value: normalize(run.crashDetail.failureCategory) });
    fields.push({ key: 'crashDetail.signature', label: 'Crash Signature', value: normalize(run.crashDetail.signature) });
    if (run.crashDetail.signatureHash) fields.push({ key: 'crashDetail.signatureHash', label: 'Signature Hash', value: normalize(run.crashDetail.signatureHash) });
    fields.push({ key: 'crashDetail.payload', label: 'Crash Payload', value: normalize(run.crashDetail.payload) });
    fields.push({ key: 'crashDetail.replayAction', label: 'Replay Action', value: normalize(run.crashDetail.replayAction) });
  }
  if (run.tags) {
    run.tags.forEach((tag, i) => {
      fields.push({ key: `tags[${i}]`, label: 'Tag', value: normalize(tag) });
    });
  }
  if (run.annotations) {
    run.annotations.forEach((note, i) => {
      fields.push({ key: `annotations[${i}]`, label: 'Annotation', value: normalize(note) });
    });
  }
  if (run.associatedIssues) {
    run.associatedIssues.forEach((issue, i) => {
      fields.push({ key: `associatedIssues[${i}]`, label: 'Issue', value: normalize(issue.label) });
    });
  }
  return fields;
}

export function fuzzySearch(
  runs: FuzzingRun[],
  query: string,
): FuzzySearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const results: FuzzySearchResult[] = [];
  for (const run of runs) {
    const fields = getRunFields(run);
    let totalScore = 0;
    const matchedFields: Array<{ field: string; value: string }> = [];
    for (const field of fields) {
      let fieldMatched = false;
      for (const token of tokens) {
        const s = fieldScore(field.value, token);
        if (s > 0) {
          totalScore += s;
          if (!fieldMatched) {
            matchedFields.push({ field: field.label, value: field.value });
            fieldMatched = true;
          }
        }
      }
    }
    if (totalScore > 0) {
      results.push({ run, score: totalScore, matchedFields });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

export function getSearchableFieldLabels(): string[] {
  return [
    'Run ID', 'Status', 'Area', 'Severity', 'Duration',
    'Seed Count', 'CPU Instructions', 'Memory Bytes', 'Min Resource Fee',
    'Failure Category', 'Crash Signature', 'Signature Hash',
    'Crash Payload', 'Replay Action', 'Tag', 'Annotation', 'Issue',
  ];
}

/** A run of text that either matched the query or did not. */
export interface HighlightSegment {
  text: string;
  matched: boolean;
}

/**
 * Splits `value` into alternating matched/unmatched segments so a caller can
 * render the query terms in situ instead of showing a bare truncated string.
 *
 * Matching is case-insensitive and literal, and mirrors the tokenisation used
 * by `fuzzySearch`: a query of `panic overflow` marks both terms wherever they
 * occur, in either order. Empty or whitespace-only queries yield a single
 * unmatched segment, so the caller can render unconditionally.
 *
 * Segments carry plain text only. Nothing here builds markup, so a value
 * containing `<script>` cannot escape into the page: the renderer emits each
 * `text` as a React child and escapes it.
 */
export function highlightMatches(value: string, query: string): HighlightSegment[] {
  if (!value) return [];

  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) return [{ text: value, matched: false }];

  // Collect every match span first, then merge overlaps. Scanning per term
  // would otherwise emit two `matched` segments for overlapping hits and
  // split a term such as `error` inside `errorhandler`.
  const spans: Array<[number, number]> = [];
  const haystack = value.toLowerCase();

  for (const term of terms) {
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(term, from);
      if (at === -1) break;
      spans.push([at, at + term.length]);
      from = at + term.length;
    }
  }

  if (spans.length === 0) return [{ text: value, matched: false }];

  spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const merged: Array<[number, number]> = [spans[0]];
  for (let i = 1; i < spans.length; i++) {
    const [start, end] = spans[i];
    const last = merged[merged.length - 1];
    if (start <= last[1]) {
      // Overlapping or adjacent: widen the existing span rather than nesting.
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) {
      segments.push({ text: value.slice(cursor, start), matched: false });
    }
    segments.push({ text: value.slice(start, end), matched: true });
    cursor = end;
  }
  if (cursor < value.length) {
    segments.push({ text: value.slice(cursor), matched: false });
  }

  return segments;
}

/**
 * Truncates `value` around the first match so the highlighted term survives
 * the cut, then returns the segments for the visible window.
 *
 * A crash payload or signature can run to hundreds of characters; showing the
 * first 30 would routinely slice the matched term out of view and leave the
 * reader with an unhighlighted stub. Centring the window on the first match
 * keeps the reason the result ranked visible.
 */
export function highlightedExcerpt(
  value: string,
  query: string,
  maxLength = 120,
): HighlightSegment[] {
  if (value.length <= maxLength) return highlightMatches(value, query);

  const segments = highlightMatches(value, query);
  const firstMatch = segments.findIndex((segment) => segment.matched);
  if (firstMatch === -1) {
    return [{ text: `${value.slice(0, maxLength)}…`, matched: false }];
  }

  // Offset of the first matched character within the full value.
  let offset = 0;
  for (let i = 0; i < firstMatch; i++) offset += segments[i].text.length;

  // Keep the whole matched run inside the window.
  //
  // Prefer starting the window on the match, so the reason the result ranked
  // is the first thing shown. That is impossible when the match sits too close
  // to the end to fill a window, so in that case back off just far enough to
  // keep the match on screen. Without the second case a match at the very end
  // of the value would be sliced out of view entirely, which is the one thing
  // this function exists to prevent.
  let start = offset;
  if (value.length - start < maxLength && offset > 0) {
    start = Math.max(0, value.length - maxLength);
  }

  const excerpt = highlightMatches(value.slice(start, start + maxLength), query);
  if (start === 0) return excerpt;

  return [{ text: '…', matched: false }, ...excerpt];
}
