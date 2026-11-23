/**
 * Deterministic release-readiness assessment (#2314).
 *
 * The release view is a *roll-up*, not another scorer: every item it reports
 * points back to a gate card, required check, flake, incident or correlation
 * that the user can open in the other tabs. Callers pass `nowMs` so the same
 * snapshot always yields the same report.
 */

import type { Correlation } from './correlation';
import type { FlakeScore } from './flake';
import type { GateCard, GateEvaluation } from './gates';
import type {
  CiRun,
  IncidentRecord,
  RegressionRecord,
} from './model';
import { isBlockingCheck, runStatus, STATUS_LABEL } from './status';

export type ReleaseStatus = 'ready' | 'warning' | 'blocked';

export interface ReleaseFinding {
  id: string;
  severity: 'blocker' | 'warning';
  title: string;
  detail: string;
  evidence: string[];
  kind: 'gate' | 'check' | 'flake' | 'incident' | 'regression' | 'correlation' | 'pending';
  runId?: string;
  link?: string;
}

export interface ReleaseReadinessReport {
  status: ReleaseStatus;
  score: number;
  summary: string;
  blockers: ReleaseFinding[];
  warnings: ReleaseFinding[];
  checkedAt: string;
}

export interface ReleaseAssessmentInput {
  runs: readonly CiRun[];
  evaluation: GateEvaluation;
  flakes: readonly FlakeScore[];
  correlations: readonly Correlation[];
  regressions: readonly RegressionRecord[];
  incidents: readonly IncidentRecord[];
  nowMs?: number;
}

function isActive(endsAt: string | undefined, nowMs: number): boolean {
  if (!endsAt) return true;
  const value = Date.parse(endsAt);
  return !Number.isFinite(value) || value > nowMs;
}

function gateFinding(card: GateCard, severity: ReleaseFinding['severity']): ReleaseFinding {
  return {
    id: `gate:${card.kind}`,
    severity,
    kind: 'gate',
    title: `${card.label} ${card.status === 'fail' ? 'failed' : 'needs attention'}`,
    detail: card.detail,
    evidence: card.reasons,
    runId: card.runId,
    link: card.links[0]?.url,
  };
}

function shortSha(sha: string): string {
  return sha.length > 10 ? `${sha.slice(0, 7)}…${sha.slice(-4)}` : sha;
}

/** Builds a release report with stable ordering and no side effects. */
export function assessReleaseReadiness(input: ReleaseAssessmentInput): ReleaseReadinessReport {
  const nowMs = input.nowMs ?? Date.now();
  const blockers: ReleaseFinding[] = [];
  const warnings: ReleaseFinding[] = [];

  for (const card of input.evaluation.blockers) {
    if (card.required) blockers.push(gateFinding(card, 'blocker'));
    else warnings.push(gateFinding(card, 'warning'));
  }
  for (const card of input.evaluation.cards) {
    if (card.status === 'warn' && !input.evaluation.warnings.some((item) => item.kind === card.kind)) {
      warnings.push(gateFinding(card, 'warning'));
    }
    if (card.status === 'pending') {
      warnings.push({
        ...gateFinding(card, 'warning'),
        detail: `Gate is still ${STATUS_LABEL.pending.toLowerCase()}.`,
      });
    }
  }

  for (const run of input.runs) {
    for (const check of run.checks.filter(isBlockingCheck)) {
      blockers.push({
        id: `check:${run.id}:${check.id}`,
        severity: 'blocker',
        kind: 'check',
        title: `Required check failed: ${check.name}`,
        detail: `${run.workflowName} on ${run.branch} (${shortSha(run.commitSha)})`,
        evidence: [`Conclusion: ${check.conclusion ?? 'none'}`, `Status: ${check.status}`],
        runId: run.id,
        link: check.detailsUrl,
      });
    }
    if (runStatus(run) === 'pending') {
      warnings.push({
        id: `pending:${run.id}`,
        severity: 'warning',
        kind: 'pending',
        title: `${run.workflowName} is still running`,
        detail: `${run.branch} · ${shortSha(run.commitSha)}`,
        evidence: ['Release checks have not completed yet.'],
        runId: run.id,
        link: run.htmlUrl,
      });
    }
  }

  for (const incident of input.incidents) {
    if (!isActive(incident.resolvedAt, nowMs)) continue;
    blockers.push({
      id: `incident:${incident.id}`,
      severity: 'blocker',
      kind: 'incident',
      title: `Active incident: ${incident.title}`,
      detail: `${incident.severity} severity · areas: ${incident.areas.join(', ') || 'unspecified'}`,
      evidence: [`Started ${incident.startedAt}`, 'No resolution timestamp within the current window.'],
      link: incident.link,
    });
  }

  const correlatedRegressionIds = new Set(
    input.correlations
      .filter((item) => item.kind === 'regression' && item.confidence >= 0.6)
      .map((item) => item.id),
  );
  for (const regression of input.regressions) {
    if (regression.status === 'fixed') continue;
    const correlated = correlatedRegressionIds.has(regression.id);
    (correlated ? blockers : warnings).push({
      id: `regression:${regression.id}`,
      severity: correlated ? 'blocker' : 'warning',
      kind: 'regression',
      title: `${correlated ? 'Correlated' : 'Open'} regression: ${regression.title}`,
      detail: `${regression.status} · areas: ${regression.areas.join(', ') || 'unspecified'}`,
      evidence: [`Detected ${regression.detectedAt}`],
      link: regression.link,
    });
  }

  for (const flake of input.flakes) {
    if (!flake.isFlaky) continue;
    const severity = flake.severity === 'critical' ? 'blocker' : flake.severity === 'high' ? 'warning' : null;
    if (!severity) continue;
    (severity === 'blocker' ? blockers : warnings).push({
      id: `flake:${flake.testId}`,
      severity,
      kind: 'flake',
      title: `${severity === 'blocker' ? 'Critical' : 'High-risk'} flake: ${flake.name}`,
      detail: `Score ${flake.score}/100 · confidence ${Math.round(flake.confidence * 100)}%`,
      evidence: flake.evidence,
    });
  }

  for (const correlation of input.correlations) {
    if (correlation.kind === 'regression' || correlation.confidence < 0.75) continue;
    warnings.push({
      id: `correlation:${correlation.id}`,
      severity: 'warning',
      kind: 'correlation',
      title: `${correlation.kind}: ${correlation.title}`,
      detail: `${Math.round(correlation.confidence * 100)}% confidence via ${correlation.rule}`,
      evidence: correlation.evidence,
      link: correlation.link,
    });
  }

  const sort = (a: ReleaseFinding, b: ReleaseFinding) => a.id.localeCompare(b.id);
  blockers.sort(sort);
  warnings.sort(sort);
  const status: ReleaseStatus = blockers.length ? 'blocked' : warnings.length ? 'warning' : 'ready';
  const score = Math.max(0, Math.min(100, 100 - blockers.length * 22 - warnings.length * 6));
  const summary =
    status === 'blocked'
      ? `${blockers.length} blocker${blockers.length === 1 ? '' : 's'} must be resolved before release.`
      : status === 'warning'
        ? `No hard blockers, but ${warnings.length} warning${warnings.length === 1 ? '' : 's'} need review.`
        : 'All required gates and checks are clear for release.';

  return {
    status,
    score,
    summary,
    blockers,
    warnings,
    checkedAt: new Date(nowMs).toISOString(),
  };
}
