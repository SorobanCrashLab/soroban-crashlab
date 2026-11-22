/**
 * Fuzzy subsequence matcher for the command palette.
 *
 * Scoring formula (subsequence-with-gaps baseline — see issue #1439):
 *   - Each matched character contributes a base of 10 points.
 *   - Consecutive matches (no gap since the previous matched character) add an
 *     escalating bonus (5, 10, 15, ...) to reward contiguous runs.
 *   - A match starting a "word" (position 0, or preceded by whitespace/`-`/`_`/`/`)
 *     adds a flat 8-point bonus so acronym-style queries ("cp" -> "Command Palette")
 *     score well.
 *   - A non-consecutive match after the first is penalised by the gap size,
 *     capped at 5 points, so scattered matches score lower than tight ones.
 *   - A small density bonus rewards shorter targets relative to the query.
 * Cleverness (e.g. Levenshtein, n-gram scoring) is intentionally avoided until
 * this baseline proves insufficient in practice.
 */

export interface MatchResult {
  matched: boolean;
  score: number;
  /** Indices into `target` that matched a query character, for highlight rendering. */
  indices: number[];
}

const NO_MATCH: MatchResult = { matched: false, score: 0, indices: [] };

export function fuzzyMatch(query: string, target: string): MatchResult {
  if (query.trim().length === 0) {
    return { matched: true, score: 0, indices: [] };
  }
  if (target.length === 0) {
    return NO_MATCH;
  }

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  const indices: number[] = [];
  let qi = 0;
  let score = 0;
  let prevMatchIndex = -1;
  let consecutiveRun = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) {
      continue;
    }

    let charScore = 10;

    if (prevMatchIndex === ti - 1) {
      consecutiveRun += 1;
      charScore += consecutiveRun * 5;
    } else {
      consecutiveRun = 0;
      if (prevMatchIndex >= 0) {
        const gap = ti - prevMatchIndex - 1;
        charScore -= Math.min(gap, 5);
      }
    }

    const isWordStart = ti === 0 || /[\s\-_/]/.test(target[ti - 1]);
    if (isWordStart) {
      charScore += 8;
    }

    score += charScore;
    indices.push(ti);
    prevMatchIndex = ti;
    qi += 1;
  }

  if (qi !== q.length) {
    return NO_MATCH;
  }

  score += Math.max(0, 20 - Math.max(0, target.length - query.length));

  return { matched: true, score, indices };
}

/**
 * Splits `text` into highlight segments based on the matched `indices`
 * returned by {@link fuzzyMatch}, for rendering `<mark>`-style emphasis.
 */
export function highlightSegments(
  text: string,
  indices: number[],
): { text: string; highlighted: boolean }[] {
  if (indices.length === 0) {
    return [{ text, highlighted: false }];
  }

  const matchSet = new Set(indices);
  const segments: { text: string; highlighted: boolean }[] = [];
  let current = '';
  let currentHighlighted = matchSet.has(0);

  for (let i = 0; i < text.length; i++) {
    const highlighted = matchSet.has(i);
    if (highlighted !== currentHighlighted && current !== '') {
      segments.push({ text: current, highlighted: currentHighlighted });
      current = '';
    }
    currentHighlighted = highlighted;
    current += text[i];
  }

  if (current !== '') {
    segments.push({ text: current, highlighted: currentHighlighted });
  }

  return segments;
}
