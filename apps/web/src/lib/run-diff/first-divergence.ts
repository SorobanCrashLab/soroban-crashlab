/**
 * Deterministic trace alignment for run diffs (#2287).
 *
 * Two runs are compared event-by-event in recorded order. An event matches
 * when its anchor (instruction / event / phase id) and its payload are equal,
 * where payloads are compared through a key-sorted JSON form so that object
 * key order never produces a false divergence. The first mismatch is the
 * first-cause candidate; its confidence is a simple heuristic, documented on
 * `scoreDivergence`.
 */

export interface TraceEvent {
  /** Semantic anchor: instruction, event or phase identifier. */
  anchor: string;
  /** Arbitrary payload (args, state, result). Compared structurally. */
  payload?: unknown;
}

export type DivergenceKind =
  /** Both traces have an event here, but anchor or payload differs. */
  | 'mismatch'
  /** The base trace ended before the candidate did. */
  | 'base-ended'
  /** The candidate trace ended before the base did. */
  | 'candidate-ended';

export interface FirstDivergence {
  kind: DivergenceKind;
  /** Index of the first differing event (in both traces). */
  index: number;
  /** Count of events that matched before the divergence. */
  matchedPrefix: number;
  /** Heuristic confidence in [0, 1] that this event is the first cause. */
  confidence: number;
}

/** Stable JSON: object keys sorted recursively, so key order is ignored. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(',')}}`;
}

export function eventsEqual(a: TraceEvent, b: TraceEvent): boolean {
  return a.anchor === b.anchor && stableStringify(a.payload) === stableStringify(b.payload);
}

/**
 * Heuristic confidence that the divergence point is the root cause.
 *  - A payload/anchor mismatch on an otherwise-aligned prefix is the strongest
 *    signal (0.5 base), a trace that simply ends is weaker (0.25 base).
 *  - The longer the matched prefix relative to the trace, the more the
 *    divergence stands out from background noise (up to +0.5).
 */
export function scoreDivergence(kind: DivergenceKind, matchedPrefix: number, totalEvents: number): number {
  const base = kind === 'mismatch' ? 0.5 : 0.25;
  const prefixRatio = totalEvents === 0 ? 0 : matchedPrefix / totalEvents;
  const score = base + prefixRatio * 0.5;
  return Math.round(Math.min(1, Math.max(0, score)) * 100) / 100;
}

/**
 * Returns the first point where `candidate` departs from `base`, or `null`
 * when the two traces are identical.
 */
export function findFirstDivergence(
  base: readonly TraceEvent[],
  candidate: readonly TraceEvent[],
): FirstDivergence | null {
  const shared = Math.min(base.length, candidate.length);
  let matchedPrefix = 0;

  for (let index = 0; index < shared; index += 1) {
    if (!eventsEqual(base[index], candidate[index])) {
      return {
        kind: 'mismatch',
        index,
        matchedPrefix,
        confidence: scoreDivergence('mismatch', matchedPrefix, shared),
      };
    }
    matchedPrefix += 1;
  }

  if (base.length === candidate.length) return null;

  const kind: DivergenceKind = base.length < candidate.length ? 'base-ended' : 'candidate-ended';
  return {
    kind,
    index: shared,
    matchedPrefix,
    confidence: scoreDivergence(kind, matchedPrefix, shared),
  };
}
