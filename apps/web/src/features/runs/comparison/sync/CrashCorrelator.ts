/** Match crashes across runs by fingerprint, signature hash, or fuzzy signature. */

import type { FuzzingRun } from "@/app/types";
import type { CrashCorrelationResult, CrashMatch, CrashRecord } from "../types";

const EXACT_SCORE = 1;
const HASH_SCORE = 0.95;
const FUZZY_THRESHOLD = 0.6;

function normalize(signature: string): string {
  return signature
    .toLowerCase()
    .replace(/0x[0-9a-f]+/g, "0xADDR")
    .replace(/\d+/g, "#")
    .replace(/[^a-z0-9_#]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenSet(value: string): Set<string> {
  return new Set(normalize(value).split(" ").filter(Boolean));
}

export function similarity(a: string, b: string): number {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (left.size === 0 && right.size === 0) return 1;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

export function crashRecordsFromRun(run: FuzzingRun): CrashRecord[] {
  if (!run.crashDetail) return [];
  const detail = run.crashDetail;
  const durationMs = run.duration || 1;
  const fingerprint = detail.signatureHash !== undefined
    ? `hash:${detail.signatureHash}`
    : `sig:${normalize(detail.signature)}`;
  return [{
    runId: run.id,
    fingerprint,
    signature: detail.signature,
    timestampMs: Math.min(durationMs, Math.round(durationMs * 0.42)),
    severity: run.severity,
  }];
}

export function correlateCrashes(baseline: FuzzingRun, candidate: FuzzingRun): CrashCorrelationResult {
  const baselineCrashes = crashRecordsFromRun(baseline);
  const candidateCrashes = crashRecordsFromRun(candidate);
  const matched: CrashMatch[] = [];
  const usedCandidates = new Set<number>();

  for (const baseCrash of baselineCrashes) {
    let bestIndex = -1;
    let bestScore = 0;
    let kind: CrashMatch["kind"] = "fuzzy";

    for (let index = 0; index < candidateCrashes.length; index += 1) {
      if (usedCandidates.has(index)) continue;
      const candidateCrash = candidateCrashes[index];
      let score: number;
      if (baseCrash.fingerprint === candidateCrash.fingerprint) {
        score = EXACT_SCORE;
        kind = "exact";
      } else {
        score = similarity(baseCrash.signature, candidateCrash.signature);
        kind = "fuzzy";
        if (score < FUZZY_THRESHOLD) score = 0;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    if (bestIndex >= 0 && bestScore >= FUZZY_THRESHOLD) {
      if (bestScore === HASH_SCORE) kind = "exact";
      matched.push({ baseline: baseCrash, candidate: candidateCrashes[bestIndex], score: bestScore, kind });
      usedCandidates.add(bestIndex);
    }
  }

  return {
    matched,
    newInCandidate: candidateCrashes.filter((_crash, index) => !usedCandidates.has(index)),
    removedFromBaseline: baselineCrashes.filter((baseCrash) => !matched.some((match) => match.baseline === baseCrash)),
  };
}

export function summarizeCorrelation(results: CrashCorrelationResult[]): {
  matched: number;
  newCrashes: number;
  removedCrashes: number;
} {
  return {
    matched: results.reduce((sum, result) => sum + result.matched.length, 0),
    newCrashes: results.reduce((sum, result) => sum + result.newInCandidate.length, 0),
    removedCrashes: results.reduce((sum, result) => sum + result.removedFromBaseline.length, 0),
  };
}
