/**
 * Post-experiment analysis and reports (#2340): timeline, metric summary,
 * hypothesis verdict, findings and follow-up actions linked to incidents,
 * runbooks, runs and logs (#067/#075/#062/#080). Deterministic for a given
 * record + samples, so exported reports are reproducible.
 */

import { definitionFingerprint, describeFault, describeHaltRule, type ExperimentRecord } from './model';
import { breaches, type TelemetrySample } from './monitor';

export interface MetricSummary {
  metric: 'errorRate' | 'p95LatencyMs' | 'cpuPct' | 'dataQuality' | 'sloBurnRate';
  label: string;
  baseline: number;
  peak: number;
  final: number;
}

export interface FollowUp {
  label: string;
  href: string;
}

export interface ExperimentAnalysis {
  id: string;
  name: string;
  version: number;
  fingerprint: string;
  status: ExperimentRecord['status'];
  verdict: 'supported' | 'refuted' | 'inconclusive';
  verdictDetail: string;
  durationMs: number;
  metrics: MetricSummary[];
  findings: string[];
  followUps: FollowUp[];
  timeline: Array<{ at: string; actor: string; action: string; detail: string }>;
  totals: { affectedRuns: number; injectedFaults: number };
}

const METRICS: Array<{ metric: MetricSummary['metric']; label: string; higherIsWorse: boolean }> = [
  { metric: 'errorRate', label: 'Error rate', higherIsWorse: true },
  { metric: 'p95LatencyMs', label: 'p95 latency (ms)', higherIsWorse: true },
  { metric: 'cpuPct', label: 'CPU %', higherIsWorse: true },
  { metric: 'dataQuality', label: 'Data quality', higherIsWorse: false },
  { metric: 'sloBurnRate', label: 'SLO burn rate', higherIsWorse: true },
];

export function analyzeExperiment(record: ExperimentRecord, samples: readonly TelemetrySample[]): ExperimentAnalysis {
  const metrics = METRICS.map(({ metric, label, higherIsWorse }) => {
    const values = samples.map((sample) => sample[metric]);
    return {
      metric,
      label,
      baseline: values[0] ?? 0,
      peak: values.length === 0 ? 0 : higherIsWorse ? Math.max(...values) : Math.min(...values),
      final: values[values.length - 1] ?? 0,
    };
  });
  const last = samples[samples.length - 1];
  const findings: string[] = [];
  const nearMisses = record.definition.haltRules.filter((rule) => samples.some((sample) => breaches(sample, rule)));

  let verdict: ExperimentAnalysis['verdict'];
  let verdictDetail: string;
  if (record.status === 'halted' && record.haltedBy) {
    verdict = 'refuted';
    verdictDetail = `Halted automatically: ${describeHaltRule(record.haltedBy)}.`;
    findings.push(`The system did not tolerate ${record.definition.faults.map(describeFault).join(' + ')} on ${record.definition.targets.map((target) => target.id).join(', ')}.`);
  } else if (record.status === 'completed' && samples.length > 0 && (last?.t ?? 0) >= record.definition.durationSec * 1_000 * 0.9) {
    verdict = nearMisses.length > 0 ? 'inconclusive' : 'supported';
    verdictDetail =
      nearMisses.length > 0
        ? `Ran to completion, but ${nearMisses.map(describeHaltRule).join('; ')} breached briefly.`
        : `Ran to completion with no halt rule breached. Hypothesis held: ${record.definition.hypothesis}`;
  } else {
    verdict = 'inconclusive';
    verdictDetail = record.status === 'aborted' ? `Aborted before completion (${record.endReason ?? 'no reason'}).` : 'Stopped before enough data was collected.';
  }

  const error = metrics.find((metric) => metric.metric === 'errorRate')!;
  const latency = metrics.find((metric) => metric.metric === 'p95LatencyMs')!;
  if (error.peak > error.baseline * 2 && error.peak > 0.02) findings.push(`Error rate rose from ${error.baseline} to a peak of ${error.peak}.`);
  if (latency.peak > latency.baseline * 1.5) findings.push(`p95 latency rose from ${latency.baseline} ms to ${latency.peak} ms.`);
  if (samples.some((sample) => sample.incidentOpened)) findings.push('A simulated incident trigger fired (sustained error rate above 25%).');
  if (findings.length === 0) findings.push('No significant degradation beyond the injected fault was observed.');

  const tag = record.definition.faults[0]?.type ?? 'chaos';
  const followUps: FollowUp[] = [
    { label: 'Correlated logs', href: `/logs?q=${encodeURIComponent(`chaos_experiment:${record.id}`)}` },
    ...record.definition.targets
      .filter((target) => target.kind === 'campaign')
      .map((target) => ({ label: `Runs in ${target.id}`, href: `/campaigns/${encodeURIComponent(target.id)}` })),
    { label: `Runbooks for ${tag}`, href: `/runbooks?q=${encodeURIComponent(tag)}` },
  ];
  if (verdict !== 'supported') {
    followUps.unshift({ label: 'Open an incident', href: `/incidents?new=1&source=chaos&experiment=${encodeURIComponent(record.id)}` });
    followUps.push({ label: 'Flag release readiness', href: `/releases?blocker=${encodeURIComponent(`chaos:${record.id}`)}` });
  }

  return {
    id: record.id,
    name: record.definition.name,
    version: record.version,
    fingerprint: definitionFingerprint(record.definition),
    status: record.status,
    verdict,
    verdictDetail,
    durationMs: last?.t ?? 0,
    metrics,
    findings,
    followUps,
    timeline: record.events,
    totals: { affectedRuns: last?.affectedRuns ?? 0, injectedFaults: last?.injectedFaults ?? 0 },
  };
}

export function analysisMarkdown(analysis: ExperimentAnalysis, record: ExperimentRecord): string {
  return [
    `# Chaos experiment report: ${analysis.name}`,
    '',
    `- Experiment: \`${analysis.id}\` v${analysis.version} (definition \`${analysis.fingerprint}\`)`,
    `- Status: **${analysis.status}** · verdict **${analysis.verdict}**`,
    `- Hypothesis: ${record.definition.hypothesis}`,
    `- Faults: ${record.definition.faults.map(describeFault).join('; ')}`,
    `- Targets: ${record.definition.targets.map((target) => `${target.kind}:${target.id}`).join(', ')}`,
    `- Halt rules: ${record.definition.haltRules.map(describeHaltRule).join('; ')}`,
    `- Affected runs ≈ ${analysis.totals.affectedRuns}; injected faults ≈ ${analysis.totals.injectedFaults}`,
    '',
    `## Verdict`,
    analysis.verdictDetail,
    '',
    '## Metrics',
    '| Metric | Baseline | Peak | Final |',
    '|---|---|---|---|',
    ...analysis.metrics.map((metric) => `| ${metric.label} | ${metric.baseline} | ${metric.peak} | ${metric.final} |`),
    '',
    '## Findings',
    ...analysis.findings.map((finding) => `- ${finding}`),
    '',
    '## Follow-ups',
    ...analysis.followUps.map((followUp) => `- [${followUp.label}](${followUp.href})`),
    '',
    '## Timeline',
    ...analysis.timeline.map((event) => `- ${event.at} · ${event.actor} · ${event.action}: ${event.detail}`),
    '',
  ].join('\n');
}
