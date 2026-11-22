import * as assert from 'node:assert/strict';
import {
  RunbookError,
  addEvidence,
  approveStep,
  approveTemplate,
  blockStep,
  completeStep,
  currentStep,
  dryRunAutomation,
  isStale,
  requestApproval,
  reviseTemplate,
  startExecution,
  suggestTemplates,
  summarizeExecution,
  validateTemplate,
} from './engine';
import type { RunbookTemplate } from './model';

const NOW = new Date('2026-06-01T00:00:00Z');

const template: RunbookTemplate = {
  id: 'rb-1',
  title: 'Crash spike',
  failureType: 'crash_spike',
  service: 'runner',
  workspace: 'default',
  version: 1,
  status: 'approved',
  updatedAt: '2026-05-20T00:00:00Z',
  steps: [
    { id: 'triage', title: 'Collect logs', instructions: '', kind: 'manual', requiredEvidence: ['log'] },
    { id: 'cause', title: 'Is it a regression?', instructions: '', kind: 'decision', options: ['regression', 'flaky'] },
    { id: 'rollback', title: 'Pause campaign', instructions: '', kind: 'automation', role: 'responder', condition: { stepId: 'cause', equals: 'regression' }, automation: { action: 'pause_campaign', requiresApproval: true } },
    { id: 'rerun', title: 'Re-run', instructions: '', kind: 'automation', condition: { stepId: 'cause', equals: 'flaky' }, automation: { action: 'rerun', requiresApproval: false } },
  ],
};

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof RunbookError ? e.code : 'OTHER';
  }
  return undefined;
}

// Validation.
assert.deepEqual(validateTemplate(template), []);
assert.ok(validateTemplate({ title: '', steps: [] }).length >= 2);
assert.ok(validateTemplate({ title: 'x', steps: [{ ...template.steps[2] }, template.steps[1]] }).some((p) => p.includes('unknown or later')));
assert.ok(validateTemplate({ title: 'x', steps: [{ id: 'd', title: 'd', instructions: '', kind: 'decision', options: ['a'] }] }).some((p) => p.includes('two options')));

// Only approved templates run.
assert.equal(code(() => startExecution({ ...template, status: 'draft' }, { source: 'manual' }, 'a', NOW)), 'NOT_APPROVED');

// Evidence gate, decision outcome, conditional steps, approval gate.
let ex = startExecution(template, { source: 'incident', refId: 'inc-9' }, 'alice', NOW, 'e1');
assert.equal(currentStep(template, ex)?.id, 'triage');
assert.equal(code(() => completeStep(template, ex, 'triage', 'alice', 'responder', {}, NOW)), 'EVIDENCE_REQUIRED');
ex = addEvidence(template, ex, 'triage', { kind: 'log', label: 'runner.log', ref: 'logs/1', addedBy: 'alice' }, NOW);
ex = completeStep(template, ex, 'triage', 'alice', 'responder', {}, NOW);
assert.equal(currentStep(template, ex)?.id, 'cause');
assert.equal(code(() => completeStep(template, ex, 'cause', 'alice', 'responder', { outcome: 'nope' }, NOW)), 'OUTCOME_REQUIRED');
ex = completeStep(template, ex, 'cause', 'alice', 'responder', { outcome: 'regression' }, NOW);
assert.equal(currentStep(template, ex)?.id, 'rollback');
assert.equal(code(() => completeStep(template, ex, 'rerun', 'alice', 'responder', {}, NOW)), 'NOT_APPLICABLE');
assert.equal(code(() => completeStep(template, ex, 'rollback', 'alice', 'responder', {}, NOW)), 'APPROVAL_REQUIRED');

// Dry run does not change step state but is audited.
const dry = dryRunAutomation(template, ex, 'rollback', 'alice', NOW);
assert.ok(dry.preview.includes('pause the active campaign'));
assert.equal(dry.execution.steps.rollback.status, 'pending');
assert.equal(dry.execution.audit.at(-1)?.type, 'automation_dry_run');

ex = requestApproval(template, ex, 'rollback', 'alice', NOW);
assert.equal(code(() => approveStep(template, ex, 'rollback', 'alice', 'maintainer', NOW)), 'SELF_APPROVAL');
assert.equal(code(() => approveStep(template, ex, 'rollback', 'bob', 'responder', NOW)), 'FORBIDDEN');
ex = approveStep(template, ex, 'rollback', 'bob', 'maintainer', NOW);
ex = completeStep(template, ex, 'rollback', 'alice', 'responder', {}, NOW);
assert.equal(ex.status, 'completed');
const summary = summarizeExecution(template, ex);
assert.equal(summary.stepsCompleted, 3);
assert.equal(summary.stepsTotal, 3);
assert.equal(summary.evidenceCount, 1);
assert.equal(code(() => blockStep(template, ex, 'rollback', 'a', 'x', NOW)), 'EXECUTION_CLOSED');

// Viewers cannot complete steps.
const fresh = startExecution(template, { source: 'manual' }, 'v', NOW);
assert.equal(code(() => completeStep(template, fresh, 'triage', 'v', 'viewer', {}, NOW)), 'FORBIDDEN');

// Governance and freshness.
const v2 = reviseTemplate(template, { title: 'Crash spike v2' }, NOW);
assert.equal(v2.version, 2);
assert.equal(v2.status, 'draft');
assert.equal(code(() => approveTemplate(v2, 'x', 'responder', NOW)), 'FORBIDDEN');
assert.equal(approveTemplate(v2, 'm', 'maintainer', NOW).status, 'approved');
assert.equal(isStale({ updatedAt: '2025-01-01T00:00:00Z' }, NOW), true);
assert.equal(isStale(template, NOW), false);

// Suggestions are deterministic and favour approved, matching templates.
const other: RunbookTemplate = { ...template, id: 'rb-2', title: 'Other', failureType: 'timeout', status: 'draft' };
assert.deepEqual(suggestTemplates([other, template], { failureType: 'crash_spike' }, NOW).map((t) => t.id), ['rb-1', 'rb-2']);

console.log('runbook engine: all tests passed');
