/**
 * Deterministic failure correlation (#2314).
 *
 * A failed job/step is matched against known regressions, incidents and recent
 * changes by (1) explicit fingerprint, (2) code-area overlap, then (3) token
 * similarity. Every match carries the rule that produced it and a confidence
 * score; ties are broken by candidate id so the UI never reshuffles on refresh.
 */

import type {
  ChangeRecord,
  CiRun,
  IncidentRecord,
  RegressionRecord,
} from './model';
import { normalizeConclusion } from './status';

export type CorrelationKind = 'regression' | 'incident' | 'change';

export interface CorrelationCandidate {
  id: string;
  kind: CorrelationKind;
  title: string;
  fingerprint?: string;
  occurredAt: string;
  areas: string[];
  details: string[];
  link?: string;
}

export interface FailureSignal {
  id: string;
  runId: string;
  jobName: string;
  stepName: string;
  message: string;
  codeAreas: string[];
  occurredAt: string;
}

export interface Correlation {
  id: string;
  kind: CorrelationKind;
  title: string;
  confidence: number;
  rule: 'fingerprint' | 'area+token' | 'token' | 'area';
  evidence: string[];
  link?: string;
  signals: string[];
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'your', 'have',
  'failed', 'failure', 'error', 'step', 'job', 'run', 'test', 'tests', 'ci',
  'build', 'action', 'workflow', 'the', 'was', 'are', 'but', 'not', 'you',
]);

/** Lowercases, splits on non-alphanumerics and drops noise words. */
export function tokenize(value: string): string[] {
  const tokens = value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
  return [...new Set(tokens)].sort();
}

function overlap(a: readonly string[], b: readonly string[]): string[] {
  const right = new Set(b);
  return [...new Set(a)].filter((token) => right.has(token)).sort();
}

function confidenceFor(
  rule: Correlation['rule'],
  sharedTokens: readonly string[],
  sharedAreas: readonly string[],
): number {
  const tokenScore = Math.min(sharedTokens.length / 3, 1);
  const areaScore = Math.min(sharedAreas.length / 2, 1);
  if (rule === 'fingerprint') return 0.98;
  if (rule === 'area+token') return Math.min(0.95, 0.5 + 0.25 * tokenScore + 0.2 * areaScore);
  if (rule === 'area') return Math.min(0.7, 0.42 + 0.2 * areaScore);
  return Math.min(0.68, 0.2 + 0.45 * tokenScore);
}

/** Matches one failure against all candidates, strongest first. */
export function correlateFailure(
  signal: FailureSignal,
  candidates: readonly CorrelationCandidate[],
  nowMs?: number,
): Correlation[] {
  const signalTokens = tokenize(`${signal.jobName} ${signal.stepName} ${signal.message}`);
  const signalAreas = signal.codeAreas.map((area) => area.toLowerCase());
  const signalTime = Date.parse(signal.occurredAt);
  const time = nowMs ?? Date.now();

  const matches: Correlation[] = [];
  for (const candidate of candidates) {
    // Do not correlate a signal with evidence recorded weeks after it.
    const candidateTime = Date.parse(candidate.occurredAt);
    if (Number.isFinite(signalTime) && Number.isFinite(candidateTime)) {
      if (Math.abs(signalTime - candidateTime) > 21 * 86_400_000 || candidateTime > time + 86_400_000) {
        continue;
      }
    }

    const candidateTokens = tokenize(
      [candidate.title, ...candidate.details].join(' '),
    );
    const candidateAreas = candidate.areas.map((area) => area.toLowerCase());
    const sharedTokens = overlap(signalTokens, candidateTokens);
    const sharedAreas = overlap(signalAreas, candidateAreas);
    const fingerprintHit =
      Boolean(candidate.fingerprint) &&
      tokenize(candidate.fingerprint!).every((token) => signalTokens.includes(token));
    const rule: Correlation['rule'] | null = fingerprintHit
      ? 'fingerprint'
      : sharedAreas.length > 0 && sharedTokens.length > 0
        ? 'area+token'
        : sharedTokens.length >= 2
          ? 'token'
          : sharedAreas.length > 0
            ? 'area'
            : null;
    if (!rule) continue;

    const confidence = confidenceFor(rule, sharedTokens, sharedAreas);
    if (confidence < 0.35) continue;
    const evidence = [
      ...(fingerprintHit ? [`Fingerprint '${candidate.fingerprint}' present in failure text`] : []),
      ...(sharedAreas.length ? [`Shared code area: ${sharedAreas.join(', ')}`] : []),
      ...(sharedTokens.length ? [`Shared terms: ${sharedTokens.slice(0, 6).join(', ')}`] : []),
      `Candidate recorded ${candidate.occurredAt}`,
    ];
    matches.push({
      id: candidate.id,
      kind: candidate.kind,
      title: candidate.title,
      confidence: Math.round(confidence * 100) / 100,
      rule,
      evidence,
      link: candidate.link,
      signals: [signal.id],
    });
  }

  return matches.sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
}

export function toCandidates(input: {
  regressions: readonly RegressionRecord[];
  incidents: readonly IncidentRecord[];
  changes: readonly ChangeRecord[];
}): CorrelationCandidate[] {
  return [
    ...input.regressions.map((item) => ({
      id: item.id,
      kind: 'regression' as const,
      title: item.title,
      fingerprint: item.fingerprint,
      occurredAt: item.detectedAt,
      areas: item.areas,
      details: [item.status],
      link: item.link,
    })),
    ...input.incidents.map((item) => ({
      id: item.id,
      kind: 'incident' as const,
      title: item.title,
      occurredAt: item.startedAt,
      areas: item.areas,
      details: [item.severity, ...(item.resolvedAt ? ['resolved'] : [])],
      link: item.link,
    })),
    ...input.changes.map((item) => ({
      id: item.id,
      kind: 'change' as const,
      title: item.title,
      occurredAt: item.mergedAt,
      areas: item.areas,
      details: [item.author, ...item.files],
      link: item.prNumber ? `https://github.com/example/crashlab/pull/${item.prNumber}` : undefined,
    })),
  ];
}

/** Extracts failed step signals from runs (including reruns). */
export function failureSignalsFromRuns(runs: readonly CiRun[]): FailureSignal[] {
  const signals: FailureSignal[] = [];
  for (const run of runs) {
    for (const job of run.jobs) {
      for (const step of job.steps) {
        if (normalizeConclusion(step.conclusion, step.status) !== 'fail') continue;
        const message = step.annotations.map((annotation) => annotation.message).join(' ');
        signals.push({
          id: `${run.id}:${job.id}:${step.id}`,
          runId: run.id,
          jobName: job.name,
          stepName: step.name,
          message,
          codeAreas: run.codeAreas,
          occurredAt: step.completedAt ?? run.updatedAt,
        });
      }
    }
    for (const check of run.checks) {
      const status = normalizeConclusion(check.conclusion, check.status);
      if (status !== 'fail') continue;
      signals.push({
        id: `${run.id}:${check.id}`,
        runId: run.id,
        jobName: 'Required checks',
        stepName: check.name,
        message: check.required ? 'required check failed' : 'check failed',
        codeAreas: run.codeAreas,
        occurredAt: run.updatedAt,
      });
    }
  }
  return signals;
}

/** Correlates all failure signals and merges evidence per candidate. */
export function correlateFailures(
  runs: readonly CiRun[],
  input: {
    regressions: readonly RegressionRecord[];
    incidents: readonly IncidentRecord[];
    changes: readonly ChangeRecord[];
  },
  nowMs?: number,
): Correlation[] {
  const candidates = toCandidates(input);
  const merged = new Map<string, Correlation>();
  for (const signal of failureSignalsFromRuns(runs)) {
    for (const match of correlateFailure(signal, candidates, nowMs)) {
      const previous = merged.get(match.id);
      if (!previous) {
        merged.set(match.id, match);
        continue;
      }
      merged.set(match.id, {
        ...previous,
        confidence: Math.max(previous.confidence, match.confidence),
        evidence: [...new Set([...previous.evidence, ...match.evidence])].sort(),
        signals: [...new Set([...previous.signals, ...match.signals])].sort(),
      });
    }
  }
  return [...merged.values()].sort(
    (a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id),
  );
}
