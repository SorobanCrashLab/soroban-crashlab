import { describe, expect, it } from 'vitest';
import { analysisMarkdown, analyzeExperiment } from './analysis';
import { estimateImpact, preflight, requiredApprovals } from './guardrails';
import { inMaintenanceWindow } from './inventory';
import { advance, allowedActions, applyControl, type Actor } from './lifecycle';
import { canonicalDefinition, definitionFingerprint, parseDefinition, type ExperimentDefinition, type ExperimentRecord } from './model';
import { evaluateHaltRules, modelTelemetry, type TelemetrySample } from './monitor';
import { ChaosStore, createSimulatedExecutor } from './server';
import { EXPERIMENT_TEMPLATES, findExperimentTemplate } from './templates';

// Tuesday 2026-11-24 15:00 UTC: inside the prod window, inside staging hours.
const IN_WINDOW = Date.parse('2026-11-24T15:00:00Z');
// Saturday: outside staging and prod windows.
const WEEKEND = Date.parse('2026-11-28T15:00:00Z');

const alice: Actor = { subject: 'github:alice', role: 'analyst' };
const bob: Actor = { subject: 'github:bob', role: 'maintainer' };
const carol: Actor = { subject: 'github:carol', role: 'maintainer' };

const rpc = findExperimentTemplate('rpc-latency-spike')!.definition;
const cpu = findExperimentTemplate('runner-cpu-pressure')!.definition;
const burst = findExperimentTemplate('integration-error-burst')!.definition;

function record(definition: ExperimentDefinition, overrides: Partial<ExperimentRecord> = {}): ExperimentRecord {
  return {
    id: 'exp-test',
    definition,
    version: 1,
    versions: [],
    status: 'draft',
    createdBy: alice.subject,
    createdAt: new Date(IN_WINDOW).toISOString(),
    approvals: [],
    startedAt: null,
    endedAt: null,
    endReason: null,
    haltedBy: null,
    events: [],
    ...overrides,
  };
}

describe('definition validation and fingerprints', () => {
  it('accepts every template and rejects unsafe or malformed definitions', () => {
    for (const template of EXPERIMENT_TEMPLATES) expect(parseDefinition(template.definition).ok).toBe(true);
    expect(parseDefinition({ ...rpc, haltRules: [] }).ok).toBe(false);
    expect(parseDefinition({ ...rpc, faults: [{ type: 'latency', latencyMs: 100, jitterMs: 500 }] })).toMatchObject({ ok: false });
    expect(parseDefinition({ ...rpc, faults: [{ type: 'error', errorRate: 0 }] }).ok).toBe(false);
    expect(parseDefinition({ ...rpc, targets: [rpc.targets[0], rpc.targets[0]] }).ok).toBe(false);
    expect(parseDefinition({ ...rpc, durationSec: 5 }).ok).toBe(false);
  });

  it('fingerprints are stable under reordering of set-like fields', () => {
    const reordered: ExperimentDefinition = {
      ...rpc,
      guardrails: { ...rpc.guardrails, environmentAllowlist: [...rpc.guardrails.environmentAllowlist].reverse() },
      tags: [...rpc.tags].reverse(),
    };
    expect(definitionFingerprint(reordered)).toBe(definitionFingerprint(rpc));
    expect(canonicalDefinition(rpc)).toBe(canonicalDefinition(JSON.parse(JSON.stringify(rpc))));
    expect(definitionFingerprint({ ...rpc, durationSec: 301 })).not.toBe(definitionFingerprint(rpc));
  });
});

describe('impact and guardrails', () => {
  it('estimates blast radius including dependents', () => {
    const impact = estimateImpact(rpc);
    expect(impact.dependents).toEqual(['campaign:camp-replay-regression', 'runner:runner-staging-1']);
    expect(impact.environments).toEqual(['staging']);
    expect(impact.blastRadiusPct).toBeGreaterThan(40);
    expect(impact.expectedLatencyDeltaMs).toBe(900);
  });

  it('passes every template at an in-window time with approvals met', () => {
    for (const template of EXPERIMENT_TEMPLATES) {
      const result = preflight(template.definition, { now: IN_WINDOW, others: [], approvals: 3 });
      expect(result.checks.filter((check) => check.status === 'fail'), template.id).toEqual([]);
    }
  });

  it('fails on allowlist, blast radius, maintenance window, approvals and overlap', () => {
    const tight: ExperimentDefinition = { ...rpc, guardrails: { ...rpc.guardrails, maxBlastRadiusPct: 1, environmentAllowlist: ['dev'] } };
    const failed = preflight(tight, { now: WEEKEND, others: [], approvals: 0 }).checks.filter((check) => check.status === 'fail').map((check) => check.id);
    expect(failed).toEqual(['environment', 'blast-radius', 'maintenance-window', 'approvals']);
    const running = record(rpc, { id: 'other', status: 'running' });
    const overlap = preflight(rpc, { now: IN_WINDOW, others: [running], approvals: 1 });
    expect(overlap.checks.find((check) => check.id === 'overlap')!.status).toBe('fail');
    expect(overlap.readyToStart).toBe(false);
    const prod: ExperimentDefinition = { ...cpu, targets: [{ kind: 'runner', id: 'runner-prod-1' }], guardrails: { ...cpu.guardrails, environmentAllowlist: ['prod'], requiredApprovals: 0 } };
    expect(requiredApprovals(prod)).toBe(2);
    expect(inMaintenanceWindow('prod', IN_WINDOW)).toBe(true);
    expect(inMaintenanceWindow('prod', WEEKEND)).toBe(false);
  });
});

describe('lifecycle safety', () => {
  const context = { now: IN_WINDOW, others: [] };

  it('requires approvals from other maintainers and explicit confirmation to start', () => {
    let current = record(rpc);
    const submitted = applyControl(current, { action: 'submit' }, alice, context);
    expect(submitted.ok && submitted.record.status).toBe('pending-approval');
    if (!submitted.ok) return;
    current = submitted.record;
    expect(allowedActions(current, alice)).toEqual(['abort']);
    expect(applyControl(current, { action: 'approve' }, alice, context)).toMatchObject({ ok: false, status: 403 });
    expect(applyControl(current, { action: 'approve' }, { ...alice, role: 'maintainer' }, context)).toMatchObject({ ok: false, status: 403 });
    const approved = applyControl(current, { action: 'approve', note: 'lgtm' }, bob, context);
    expect(approved.ok && approved.record.status).toBe('approved');
    if (!approved.ok) return;
    current = approved.record;
    // Staging needs a maintainer to start, and the typed name.
    expect(applyControl(current, { action: 'start', confirmation: rpc.name }, alice, context)).toMatchObject({ ok: false, status: 403 });
    expect(applyControl(current, { action: 'start', confirmation: 'yes' }, bob, context)).toMatchObject({ ok: false, status: 422 });
    expect(applyControl(current, { action: 'start', confirmation: rpc.name }, bob, { now: WEEKEND, others: [] })).toMatchObject({ ok: false, status: 422 });
    const started = applyControl(current, { action: 'start', confirmation: rpc.name }, bob, context);
    expect(started.ok && started.record.status).toBe('running');
  });

  it('requires two distinct maintainer approvals for production', () => {
    const prod: ExperimentDefinition = {
      ...cpu,
      targets: [{ kind: 'runner', id: 'runner-prod-1' }],
      durationSec: 120,
      guardrails: { ...cpu.guardrails, environmentAllowlist: ['prod'], requiredApprovals: 0, maxBlastRadiusPct: 20 },
    };
    const submitted = applyControl(record(prod), { action: 'submit' }, alice, context);
    expect(submitted.ok && submitted.record.status).toBe('pending-approval');
    if (!submitted.ok) return;
    const first = applyControl(submitted.record, { action: 'approve' }, bob, context);
    expect(first.ok && first.record.status).toBe('pending-approval');
    if (!first.ok) return;
    expect(applyControl(first.record, { action: 'approve' }, bob, context)).toMatchObject({ ok: false, status: 409 });
    const second = applyControl(first.record, { action: 'approve' }, carol, context);
    expect(second.ok && second.record.status).toBe('approved');
    if (!second.ok) return;
    expect(allowedActions(second.record, alice)).toEqual(['abort']);
    expect(applyControl(second.record, { action: 'start', confirmation: prod.name }, carol, context).ok).toBe(true);
  });

  it('auto-approves dev experiments needing no approvals and lets analysts start them', () => {
    const submitted = applyControl(record(cpu), { action: 'submit' }, alice, context);
    expect(submitted.ok && submitted.record.status).toBe('approved');
    if (!submitted.ok) return;
    expect(allowedActions(submitted.record, alice)).toEqual(['start', 'abort']);
    const started = applyControl(submitted.record, { action: 'start', confirmation: cpu.name }, alice, context);
    expect(started.ok && started.record.startedAt).toBe(new Date(IN_WINDOW).toISOString());
  });

  it('makes abort a reasoned, idempotent emergency stop', () => {
    const running = record(cpu, { status: 'running', startedAt: new Date(IN_WINDOW).toISOString() });
    expect(applyControl(running, { action: 'abort' }, alice, context)).toMatchObject({ ok: false, status: 422 });
    const aborted = applyControl(running, { action: 'abort', reason: 'error spike' }, alice, context);
    expect(aborted.ok && aborted.record.status).toBe('aborted');
    if (!aborted.ok) return;
    expect(applyControl(aborted.record, { action: 'abort', reason: 'again' }, alice, context)).toMatchObject({ ok: true, changed: false });
    expect(applyControl(running, { action: 'abort', reason: 'x' }, { subject: 'anon', role: 'anonymous' }, context)).toMatchObject({ ok: false, status: 403 });
    expect(allowedActions(running, { subject: 'anon', role: 'anonymous' })).toEqual([]);
  });
});

describe('monitoring, halt rules and analysis', () => {
  it('produces deterministic telemetry and fires debounced halt rules', () => {
    const samples = modelTelemetry.samples('exp-a', burst, 120_000);
    expect(modelTelemetry.samples('exp-a', burst, 120_000)).toEqual(samples);
    expect(samples).toHaveLength(13);
    const halt = evaluateHaltRules(samples, burst.haltRules);
    expect(halt?.rule.metric).toBe('slo_burn_rate');
    // Debounced: fires at the end of the first 2-sample breach streak, not on the first breach.
    const streakEnd = samples.findIndex((sample, index) => index > 0 && sample.sloBurnRate > 10 && samples[index - 1].sloBurnRate > 10);
    expect(halt?.sample.t).toBe(samples[streakEnd].t);
    expect(samples[streakEnd - 2]?.sloBurnRate ?? 0).toBeLessThanOrEqual(10);
    const flat: TelemetrySample[] = samples.map((sample) => ({ ...sample, sloBurnRate: 0, incidentOpened: false }));
    expect(evaluateHaltRules(flat, burst.haltRules)).toBeNull();
    const oneSpike = flat.map((sample, index) => (index === 3 ? { ...sample, sloBurnRate: 50 } : sample));
    expect(evaluateHaltRules(oneSpike, burst.haltRules)).toBeNull();
  });

  it('advances running experiments to halted or completed', () => {
    const startedAt = new Date(IN_WINDOW).toISOString();
    const halted = advance(record(burst, { status: 'running', startedAt }), modelTelemetry, IN_WINDOW + 600_000);
    const haltAt = evaluateHaltRules(modelTelemetry.samples('exp-test', burst, 600_000), burst.haltRules)!.sample.t;
    expect(halted.record).toMatchObject({ status: 'halted', endedAt: new Date(IN_WINDOW + haltAt).toISOString() });
    expect(halted.samples[halted.samples.length - 1].t).toBe(haltAt);
    expect(halted.record.haltedBy?.metric).toBe('slo_burn_rate');
    const done = advance(record(cpu, { status: 'running', startedAt }), modelTelemetry, IN_WINDOW + 600_000);
    expect(done.record).toMatchObject({ status: 'completed', endedAt: new Date(IN_WINDOW + 180_000).toISOString() });
    const midway = advance(record(cpu, { status: 'running', startedAt }), modelTelemetry, IN_WINDOW + 60_000);
    expect(midway.changed).toBe(false);
    expect(midway.samples).toHaveLength(7);
  });

  it('analyzes outcomes into verdicts, findings and follow-ups', () => {
    const startedAt = new Date(IN_WINDOW).toISOString();
    const halted = advance(record(burst, { status: 'running', startedAt }), modelTelemetry, IN_WINDOW + 600_000);
    const refuted = analyzeExperiment(halted.record, halted.samples);
    expect(refuted.verdict).toBe('refuted');
    expect(refuted.followUps[0].label).toBe('Open an incident');
    const done = advance(record(cpu, { status: 'running', startedAt }), modelTelemetry, IN_WINDOW + 600_000);
    const supported = analyzeExperiment(done.record, done.samples);
    expect(supported.verdict).toBe('supported');
    expect(supported.followUps.some((followUp) => followUp.label === 'Open an incident')).toBe(false);
    expect(analyzeExperiment(done.record, done.samples)).toEqual(supported);
    const markdown = analysisMarkdown(refuted, halted.record);
    expect(markdown).toContain('verdict **refuted**');
    expect(markdown).toContain('| Error rate |');
  });
});

describe('store', () => {
  it('versions drafts, locks started experiments and advances seeds', () => {
    let now = IN_WINDOW;
    const executor = createSimulatedExecutor();
    const store = new ChaosStore(executor, modelTelemetry, () => now);
    const statuses = Object.fromEntries(store.list().map((entry) => [entry.id, entry.status]));
    expect(statuses).toEqual({ 'exp-demo-error-burst': 'halted', 'exp-demo-cpu': 'completed', 'exp-demo-rpc-latency': 'draft' });
    expect(executor.log).toEqual(expect.arrayContaining(['revoke exp-demo-error-burst', 'revoke exp-demo-cpu']));
    const created = store.save(cpu, alice);
    expect(created.ok && created.record.version).toBe(1);
    if (!created.ok) return;
    const same = store.save(cpu, alice, created.record.id);
    expect(same.ok && same.record.version).toBe(1);
    const changed = store.save({ ...cpu, durationSec: 200 }, alice, created.record.id);
    expect(changed.ok && changed.record.versions.map((version) => version.version)).toEqual([1, 2]);
    expect(store.save(cpu, alice, 'exp-demo-cpu')).toMatchObject({ ok: false, status: 409 });
    now += 1;
  });
});
