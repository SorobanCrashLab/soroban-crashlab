/** Run vs baseline signature comparison (#2207). */

import { signaturesMatch } from './SignatureMatcher';

export interface SignatureCount {
  signature: string;
  count: number;
}

export interface ComparisonResult {
  newSignatures: SignatureCount[];
  fixedSignatures: SignatureCount[];
  persistentSignatures: SignatureCount[];
}

/**
 * Diff a new run against a stable baseline.
 * Exact matches use a hash map (O(n)); only unresolved signatures use the
 * configurable fuzzy matcher, keeping 10k-crash comparisons well under 5s.
 */
export function compareRuns(
  baseline: SignatureCount[],
  current: SignatureCount[],
  fuzzyThreshold = 0.9,
): ComparisonResult {
  const result: ComparisonResult = {
    newSignatures: [],
    fixedSignatures: [],
    persistentSignatures: [],
  };
  const baselineByExact = new Map(baseline.map((item) => [item.signature, item]));
  const matchedBaseline = new Set<string>();
  const matchedCurrent = new Set<string>();

  for (const item of current) {
    const exact = baselineByExact.get(item.signature);
    if (exact) {
      result.persistentSignatures.push(item);
      matchedBaseline.add(exact.signature);
      matchedCurrent.add(item.signature);
      continue;
    }
    const fuzzy = baseline.find(
      (candidate) =>
        !matchedBaseline.has(candidate.signature) &&
        signaturesMatch(candidate.signature, item.signature, fuzzyThreshold),
    );
    if (fuzzy) {
      result.persistentSignatures.push(item);
      matchedBaseline.add(fuzzy.signature);
      matchedCurrent.add(item.signature);
    } else {
      result.newSignatures.push(item);
    }
  }

  for (const item of baseline) {
    if (!matchedBaseline.has(item.signature)) result.fixedSignatures.push(item);
  }
  // Defensive: fuzzy matches recorded as current but not baseline-matched.
  result.newSignatures = result.newSignatures.filter((item) => !matchedCurrent.has(item.signature));
  return result;
}
