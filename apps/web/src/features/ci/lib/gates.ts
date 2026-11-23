/**
 * Quality-gate evaluation with explicit budgets (#2314).
 *
 * Observations are provider-independent. Each gate is evaluated against the
 * policy from the snapshot; a small regression inside the tolerance produces a
 * warning, anything larger blocks. Statuses coming from failed jobs/checks
 * always block regardless of numeric budgets.
 */

import {
  DEFAULT_GATE_POLICY,
  GATE_KINDS,
  GATE_LABELS,
  sanitizeUrl,
  type CiArtifact,
  type CiGatePolicy,
  type CiRun,
  type CiStatus,
  type GateKind,
  type GateMetric,
} from './model';
import { checkStatus, normalizeConclusion, rollupStatus } from './status';

export interface GateObservation {
  kind: GateKind;
  status: CiStatus;
  value?: number;
  baseline?: number;
  unit?: string;
  message?: string;
  detailsUrl?: string;
  /** Vulnerability counts are reported together by dependency scanners. */
  security?: { critical: number; high: number };
  artifacts: CiArtifact[];
  runId?: string;
  updatedAt?: string;
}

export interface GateBudget {
  label: string;
  target: number;
  unit: string;
  tolerance?: number;
}

export interface GateLink {
  label: string;
  url: string;
}

export interface GateCard {
  kind: GateKind;
  label: string;
  status: CiStatus;
  required: boolean;
  headline: string;
  detail: string;
  value?: number;
  baseline?: number;
  unit?: string;
  delta?: number;
  deltaLabel?: string;
  budget?: GateBudget;
  reasons: string[];
  links: GateLink[];
  runId?: string;
  updatedAt?: string;
}

export interface GateEvaluation {
  cards: GateCard[];
  status: CiStatus;
  blockers: GateCard[];
  warnings: GateCard[];
  evaluatedAt: string;
}

function metricValue(metrics: readonly GateMetric[], name: string): number | undefined {
  const found = metrics.find((metric) => metric.name === name);
  return found && Number.isFinite(found.value) ? found.value : undefined;
}

function metricBaseline(metrics: readonly GateMetric[], name: string): number | undefined {
  const found = metrics.find((metric) => metric.name === name);
  return found && Number.isFinite(found.baseline) ? found.baseline : undefined;
}

/**
 * Collapses runs into at most one observation per gate. The worst status wins;
 * numeric metrics come from the most recently updated run that reported them.
 * A deterministic tie-break keeps server and client output byte-identical.
 */
export function gateObservationsFromRuns(runs: readonly CiRun[]): GateObservation[] {
  const byGate = new Map<GateKind, GateObservation>();

  for (const run of runs) {
    const statuses = new Map<GateKind, CiStatus[]>();
    const push = (kind: GateKind, status: CiStatus) => {
      const bucket = statuses.get(kind);
      if (bucket) bucket.push(status);
      else statuses.set(kind, [status]);
    };

    for (const job of run.jobs) {
      const status = normalizeConclusion(job.conclusion, job.status);
      for (const kind of job.gates) push(kind, status);
      for (const step of job.steps) {
        const stepStatus = normalizeConclusion(step.conclusion, step.status);
        for (const kind of job.gates) {
          if (/test|coverage|lint|e2e|mutation|perf|visual|security/i.test(step.name)) {
            push(kind, stepStatus);
          }
        }
      }
    }
    for (const check of run.checks) {
      if (check.gate) push(check.gate, checkStatus(check));
    }

    for (const [kind, gateStatuses] of statuses) {
      const status = rollupStatus(gateStatuses);
      const previous = byGate.get(kind);
      const detailsUrl = sanitizeUrl(run.jobs.find((job) => job.gates.includes(kind))?.htmlUrl ??
        run.checks.find((check) => check.gate === kind)?.detailsUrl ??
        run.htmlUrl);
      const artifact = run.artifacts.find((item) => item.kind === 'report') ?? run.artifacts[0];
      const artifacts = artifact && sanitizeUrl(artifact.url) ? [artifact] : [];
      const next: GateObservation = {
        kind,
        status,
        artifacts,
        detailsUrl,
        runId: run.id,
        updatedAt: run.updatedAt,
      };
      if (!previous || statusRank(status) > statusRank(previous.status)) {
        byGate.set(kind, next);
      }
    }

    // Metrics may be reported by a run with no tagged job (e.g. a coverage
    // upload step), so merge them independently of job status evidence.
    for (const metric of run.metrics) {
      const previous = byGate.get(metric.kind) ?? {
        kind: metric.kind,
        status: 'skip' as CiStatus,
        artifacts: [],
        runId: run.id,
        updatedAt: run.updatedAt,
      };
      if (!previous.updatedAt || (run.updatedAt ?? '') >= previous.updatedAt) {
        const critical = metricValue(run.metrics, 'security.critical');
        const high = metricValue(run.metrics, 'security.high');
        byGate.set(metric.kind, {
          ...previous,
          value: metricValue(run.metrics, metric.name) ?? previous.value,
          baseline: metricBaseline(run.metrics, metric.name) ?? previous.baseline,
          ...(metric.kind === 'security' && critical !== undefined && high !== undefined
            ? { security: { critical, high }, value: critical }
            : {}),
          unit: metric.unit,
          updatedAt: run.updatedAt,
          runId: run.id,
        });
      }
    }
  }

  return GATE_KINDS.map((kind) => byGate.get(kind)).filter(
    (observation): observation is GateObservation => Boolean(observation),
  );
}

function statusRank(status: CiStatus): number {
  return { skip: 0, pass: 1, pending: 2, warn: 3, fail: 4 }[status];
}

interface BudgetVerdict {
  status?: CiStatus;
  value?: number;
  baseline?: number;
  unit?: string;
  delta?: number;
  deltaLabel?: string;
  budget?: GateBudget;
  reasons: string[];
}

function compareBudget(
  kind: GateKind,
  observation: GateObservation,
  policy: CiGatePolicy,
): BudgetVerdict {
  const value = observation.value ?? observation.security?.critical;
  const baseline = observation.baseline;
  if (value === undefined || !Number.isFinite(value)) {
    return { reasons: [`No ${kind} measurement was reported for these runs.`] };
  }

  const rounded = (n: number) => Math.round(n * 100) / 100;
  const signed = (n: number, unit: string) => `${n >= 0 ? '+' : ''}${rounded(n)}${unit}`;

  switch (kind) {
    case 'coverage': {
      const delta = baseline === undefined ? undefined : rounded(value - baseline);
      return {
        value,
        baseline,
        unit: '%',
        delta,
        deltaLabel: delta === undefined ? undefined : signed(delta, ' pp'),
        budget: { label: 'Minimum line coverage', target: policy.coverageMinPct, unit: '%' },
        reasons:
          value >= policy.coverageMinPct
            ? [`Coverage ${rounded(value)}% meets the ${policy.coverageMinPct}% floor.`]
            : [
                `Coverage ${rounded(value)}% is below the ${policy.coverageMinPct}% floor.`,
                ...(delta !== undefined ? [`Change vs baseline: ${signed(delta, ' pp')}.`] : []),
              ],
        ...(value < policy.coverageMinPct
          ? {
              status: (delta !== undefined && delta >= -policy.coverageDeltaTolerancePct
                ? 'warn'
                : 'fail') as CiStatus,
            }
          : {}),
      };
    }
    case 'mutation': {
      const delta = baseline === undefined ? undefined : rounded(value - baseline);
      return {
        value,
        baseline,
        unit: '%',
        delta,
        deltaLabel: delta === undefined ? undefined : signed(delta, ' pp'),
        budget: { label: 'Minimum mutation score', target: policy.mutationMinPct, unit: '%' },
        reasons: [`Mutation score ${rounded(value)}% (floor ${policy.mutationMinPct}%).`],
        ...(value < policy.mutationMinPct ? { status: 'fail' as CiStatus } : {}),
      };
    }
    case 'perf': {
      const delta =
        baseline !== undefined && baseline > 0 ? rounded(((value - baseline) / baseline) * 100) : undefined;
      return {
        value,
        baseline,
        unit: 'ms',
        delta,
        deltaLabel: delta === undefined ? undefined : signed(delta, '%'),
        budget: {
          label: 'Maximum p95 duration',
          target: policy.perfMaxMs,
          unit: 'ms',
          tolerance: policy.perfDeltaTolerancePct,
        },
        reasons: [
          `p95 ${rounded(value)}ms vs ${policy.perfMaxMs}ms budget.`,
          ...(delta !== undefined ? [`Change vs baseline: ${signed(delta, '%')}.`] : []),
        ],
        ...(value > policy.perfMaxMs
          ? {
              status: (delta !== undefined && delta <= policy.perfDeltaTolerancePct
                ? 'warn'
                : 'fail') as CiStatus,
            }
          : {}),
      };
    }
    case 'visual': {
      const delta = baseline === undefined ? undefined : rounded(value - baseline);
      return {
        value,
        baseline,
        unit: '%',
        delta,
        deltaLabel: delta === undefined ? undefined : signed(delta, ' pp'),
        budget: {
          label: 'Maximum pixel diff',
          target: policy.visualDiffMaxPct,
          unit: '%',
          tolerance: policy.visualDeltaTolerancePct,
        },
        reasons: [
          `Visual diff ${rounded(value)}% vs ${policy.visualDiffMaxPct}% budget.`,
          ...(delta !== undefined ? [`Change vs baseline: ${signed(delta, ' pp')}.`] : []),
        ],
        ...(value > policy.visualDiffMaxPct
          ? {
              status: (delta !== undefined && delta <= policy.visualDeltaTolerancePct
                ? 'warn'
                : 'fail') as CiStatus,
            }
          : {}),
      };
    }
    case 'security': {
      const critical = observation.security?.critical ?? value ?? 0;
      const high = observation.security?.high ?? 0;
      return {
        value: critical,
        unit: 'critical CVEs',
        budget: {
          label: 'Critical / high vulnerabilities',
          target: policy.maxCriticalVulns,
          unit: 'critical',
        },
        reasons: [
          `${rounded(critical)} critical (max ${policy.maxCriticalVulns}), ${rounded(high)} high (max ${policy.maxHighVulns}).`,
        ],
        status:
          critical > policy.maxCriticalVulns || high > policy.maxHighVulns ? 'fail' : undefined,
      };
    }
    default:
      return { reasons: [observation.message ?? 'Execution status only; no numeric budget.'] };
  }
}

/** Evaluates one gate observation into a display-ready card. */
export function evaluateGate(
  observation: GateObservation,
  policy: CiGatePolicy = DEFAULT_GATE_POLICY,
): GateCard {
  const verdict = compareBudget(observation.kind, observation, policy);
  const status: CiStatus =
    observation.status === 'fail' || verdict.status === 'fail'
      ? 'fail'
      : observation.status === 'warn' || verdict.status === 'warn'
        ? 'warn'
        : observation.status === 'pending'
          ? 'pending'
          : verdict.status === 'skip' || observation.status === 'skip'
            ? 'skip'
            : 'pass';

  const links: GateLink[] = [];
  if (observation.detailsUrl) links.push({ label: 'View logs', url: observation.detailsUrl });
  for (const artifact of observation.artifacts) {
    const safe = sanitizeUrl(artifact.url);
    if (safe) links.push({ label: artifact.name, url: safe });
  }

  return {
    kind: observation.kind,
    label: GATE_LABELS[observation.kind],
    status,
    required: observation.kind !== 'mutation' && observation.kind !== 'visual',
    headline: verdict.value === undefined ? status : `${verdict.value}${verdict.unit === '%' ? '%' : ''}`,
    detail: verdict.reasons[0] ?? 'No evidence available.',
    value: verdict.value,
    baseline: verdict.baseline,
    unit: verdict.unit,
    delta: verdict.delta,
    deltaLabel: verdict.deltaLabel,
    budget: verdict.budget,
    reasons: [...verdict.reasons, ...(observation.message ? [observation.message] : [])],
    links,
    runId: observation.runId,
    updatedAt: observation.updatedAt,
  };
}

/** Evaluates all eight gates; missing gates become explicit `skip` cards. */
export function evaluateGates(
  observations: readonly GateObservation[],
  policy: CiGatePolicy = DEFAULT_GATE_POLICY,
  evaluatedAt = '1970-01-01T00:00:00.000Z',
): GateEvaluation {
  const byKind = new Map(observations.map((observation) => [observation.kind, observation]));
  const cards = GATE_KINDS.map((kind) => {
    const observation = byKind.get(kind);
    if (!observation) {
      return {
        kind,
        label: GATE_LABELS[kind],
        status: 'skip' as CiStatus,
        required: kind !== 'mutation' && kind !== 'visual',
        headline: '—',
        detail: 'No evidence in the selected runs.',
        reasons: ['No job, check or metric reported for this gate.'],
        links: [],
      };
    }
    return evaluateGate(observation, policy);
  });
  const status = rollupStatus(cards.map((card) => card.status));
  return {
    cards,
    status,
    blockers: cards.filter((card) => card.status === 'fail'),
    warnings: cards.filter((card) => card.status === 'warn'),
    evaluatedAt,
  };
}

/** Display helper used by cards and the shareable status report. */
export function formatGateValue(card: GateCard): string {
  if (card.value === undefined) return card.headline;
  if (card.unit === '%') return `${card.value}%`;
  if (card.unit === 'ms') return `${card.value} ms`;
  return `${card.value} ${card.unit ?? ''}`.trim();
}
