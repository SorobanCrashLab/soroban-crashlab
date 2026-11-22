import type { FuzzingRun } from './types';
import { rankDocuments } from '../lib/search/ranker';
import { runToSearchDocument } from '../lib/search/run-document';

export interface FuzzySearchResult {
  run: FuzzingRun;
  score: number;
  matchedFields: Array<{ field: string; value: string }>;
}

export function fuzzySearch(
  runs: FuzzingRun[],
  query: string,
): FuzzySearchResult[] {
  const trimmed = query.trim();
  if (!trimmed || runs.length === 0) return [];

  const byId = new Map(runs.map((run) => [run.id, run]));
  const outcome = rankDocuments(
    runs.map(runToSearchDocument),
    trimmed,
    { limit: runs.length },
  );

  return outcome.hits.flatMap((hit) => {
    const run = byId.get(hit.document.id);
    if (!run) return [];
    return [{ run, score: hit.score, matchedFields: hit.matchedFields }];
  });
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
