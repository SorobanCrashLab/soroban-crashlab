/**
 * Runbook engine (#2301): template validation, conditional step resolution,
 * guarded execution transitions, RBAC, automation approval gates and
 * staleness. Everything is pure and returns new objects so it is easy to test
 * and to persist.
 */

import type {
  AutomationAction,
  EvidenceItem,
  EvidenceKind,
  ExecutionContext,
  RunbookExecution,
  RunbookRole,
  RunbookStep,
  RunbookTemplate,
  StepState,
} from './model';

export const STALE_AFTER_DAYS = 90;
const ROLE_RANK: Record<RunbookRole, number> = { viewer: 0, responder: 1, maintainer: 2 };

export class RunbookError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'RunbookError';
  }
}

export function hasRole(actual: RunbookRole, required: RunbookRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

/** Returns a list of problems; empty means the template is valid. */
export function validateTemplate(t: Pick<RunbookTemplate, 'title' | 'steps'>): string[] {
  const problems: string[] = [];
  if (!t.title.trim()) problems.push('Title is required');
  if (t.steps.length === 0) problems.push('At least one step is required');
  const seen = new Map<string, RunbookStep>();
  t.steps.forEach((step, index) => {
    if (!step.id.trim()) problems.push(`Step ${index + 1} needs an id`);
    if (seen.has(step.id)) problems.push(`Duplicate step id "${step.id}"`);
    if (!step.title.trim()) problems.push(`Step "${step.id}" needs a title`);
    if (step.kind === 'decision' && (!step.options || step.options.length < 2)) {
      problems.push(`Decision step "${step.id}" needs at least two options`);
    }
    if (step.kind === 'automation' && !step.automation) {
      problems.push(`Automation step "${step.id}" needs an action`);
    }
    if (step.condition) {
      const target = seen.get(step.condition.stepId);
      if (!target) problems.push(`Step "${step.id}" depends on unknown or later step "${step.condition.stepId}"`);
      else if (target.kind !== 'decision') problems.push(`Step "${step.id}" conditions on "${target.id}", which is not a decision step`);
      else if (!target.options?.includes(step.condition.equals)) {
        problems.push(`Step "${step.id}" expects outcome "${step.condition.equals}" that "${target.id}" does not offer`);
      }
    }
    seen.set(step.id, step);
  });
  return problems;
}

export function isStale(template: Pick<RunbookTemplate, 'updatedAt'>, now: Date = new Date()): boolean {
  const ageDays = (now.getTime() - Date.parse(template.updatedAt)) / 86_400_000;
  return ageDays > STALE_AFTER_DAYS;
}

export function freshnessLabel(template: Pick<RunbookTemplate, 'updatedAt'>, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - Date.parse(template.updatedAt)) / 86_400_000);
  return isStale(template, now) ? `Stale (${days}d since review)` : days <= 0 ? 'Updated today' : `Updated ${days}d ago`;
}

/** Steps that apply to this execution, after resolving decision outcomes. */
export function applicableSteps(template: RunbookTemplate, execution: RunbookExecution): RunbookStep[] {
  return template.steps.filter((step) => {
    if (!step.condition) return true;
    return execution.steps[step.condition.stepId]?.outcome === step.condition.equals;
  });
}

/** First applicable step that is not completed/skipped, i.e. the one to work on next. */
export function currentStep(template: RunbookTemplate, execution: RunbookExecution): RunbookStep | null {
  return (
    applicableSteps(template, execution).find((s) => {
      const st = execution.steps[s.id]?.status;
      return st !== 'completed' && st !== 'skipped';
    }) ?? null
  );
}

export function startExecution(
  template: RunbookTemplate,
  context: ExecutionContext,
  actor: string,
  now: Date = new Date(),
  id: string = `exec-${now.getTime().toString(36)}`,
): RunbookExecution {
  if (template.status !== 'approved') {
    throw new RunbookError('NOT_APPROVED', 'Only approved runbook versions can be executed');
  }
  const at = now.toISOString();
  const steps: Record<string, StepState> = {};
  for (const s of template.steps) steps[s.id] = { status: 'pending', notes: '', evidence: [] };
  return {
    id,
    templateId: template.id,
    templateVersion: template.version,
    context,
    status: 'in_progress',
    steps,
    audit: [{ at, actor, type: 'started', detail: `${context.source}${context.refId ? `:${context.refId}` : ''}` }],
    startedAt: at,
  };
}

function stepOf(template: RunbookTemplate, stepId: string): RunbookStep {
  const step = template.steps.find((s) => s.id === stepId);
  if (!step) throw new RunbookError('UNKNOWN_STEP', `Unknown step ${stepId}`);
  return step;
}

function ensureActive(execution: RunbookExecution): void {
  if (execution.status !== 'in_progress') {
    throw new RunbookError('EXECUTION_CLOSED', `Execution is ${execution.status}`);
  }
}

function update(
  execution: RunbookExecution,
  stepId: string,
  patch: Partial<StepState>,
  event: RunbookExecution['audit'][number],
): RunbookExecution {
  return {
    ...execution,
    steps: { ...execution.steps, [stepId]: { ...execution.steps[stepId], ...patch } },
    audit: [...execution.audit, event],
  };
}

function guardRole(step: RunbookStep, role: RunbookRole): void {
  if (!hasRole(role, step.role ?? 'responder')) {
    throw new RunbookError('FORBIDDEN', `Step "${step.id}" requires the ${step.role ?? 'responder'} role`);
  }
}

export function missingEvidence(step: RunbookStep, state: StepState): EvidenceKind[] {
  const have = new Set(state.evidence.map((e) => e.kind));
  return (step.requiredEvidence ?? []).filter((k) => !have.has(k));
}

export function addEvidence(
  template: RunbookTemplate,
  execution: RunbookExecution,
  stepId: string,
  evidence: Omit<EvidenceItem, 'id' | 'addedAt'>,
  now: Date = new Date(),
): RunbookExecution {
  ensureActive(execution);
  stepOf(template, stepId);
  const at = now.toISOString();
  const item: EvidenceItem = { ...evidence, id: `ev-${execution.steps[stepId].evidence.length + 1}`, addedAt: at };
  return update(
    execution,
    stepId,
    { evidence: [...execution.steps[stepId].evidence, item] },
    { at, actor: evidence.addedBy, type: 'evidence_added', stepId, detail: `${evidence.kind}: ${evidence.label}` },
  );
}

export function completeStep(
  template: RunbookTemplate,
  execution: RunbookExecution,
  stepId: string,
  actor: string,
  role: RunbookRole,
  options: { outcome?: string; notes?: string } = {},
  now: Date = new Date(),
): RunbookExecution {
  ensureActive(execution);
  const step = stepOf(template, stepId);
  guardRole(step, role);
  if (!applicableSteps(template, execution).some((s) => s.id === stepId)) {
    throw new RunbookError('NOT_APPLICABLE', `Step "${stepId}" does not apply to this execution`);
  }
  const state = execution.steps[stepId];
  const missing = missingEvidence(step, state);
  if (missing.length) {
    throw new RunbookError('EVIDENCE_REQUIRED', `Missing required evidence: ${missing.join(', ')}`);
  }
  if (step.kind === 'decision' && !(options.outcome && step.options?.includes(options.outcome))) {
    throw new RunbookError('OUTCOME_REQUIRED', `Choose one of: ${(step.options ?? []).join(', ')}`);
  }
  if (step.kind === 'automation' && step.automation?.requiresApproval && !state.approval?.approvedBy) {
    throw new RunbookError('APPROVAL_REQUIRED', 'This automation step needs an approval before it can run');
  }
  const at = now.toISOString();
  let next = update(
    execution,
    stepId,
    {
      status: 'completed',
      completedAt: at,
      assignee: state.assignee ?? actor,
      notes: options.notes ?? state.notes,
      outcome: options.outcome ?? state.outcome,
    },
    { at, actor, type: step.kind === 'automation' ? 'automation_executed' : 'step_completed', stepId, detail: options.outcome },
  );
  if (!currentStep(template, next)) {
    next = { ...next, status: 'completed', completedAt: at, audit: [...next.audit, { at, actor, type: 'completed' }] };
  }
  return next;
}

export function blockStep(
  template: RunbookTemplate,
  execution: RunbookExecution,
  stepId: string,
  actor: string,
  reason: string,
  now: Date = new Date(),
): RunbookExecution {
  ensureActive(execution);
  stepOf(template, stepId);
  const at = now.toISOString();
  return update(execution, stepId, { status: 'blocked', blockedReason: reason }, { at, actor, type: 'step_blocked', stepId, detail: reason });
}

/** Describes what an automation would do, without doing it. Recorded in the audit log. */
export function dryRunAutomation(
  template: RunbookTemplate,
  execution: RunbookExecution,
  stepId: string,
  actor: string,
  now: Date = new Date(),
): { execution: RunbookExecution; preview: string } {
  ensureActive(execution);
  const step = stepOf(template, stepId);
  if (step.kind !== 'automation' || !step.automation) {
    throw new RunbookError('NOT_AUTOMATION', `Step "${stepId}" is not an automation step`);
  }
  const preview = describeAutomation(step.automation.action, execution.context);
  const at = now.toISOString();
  return {
    preview,
    execution: update(execution, stepId, {}, { at, actor, type: 'automation_dry_run', stepId, detail: preview }),
  };
}

export function describeAutomation(action: AutomationAction, context: ExecutionContext): string {
  const target = context.refId ? ` for ${context.source} ${context.refId}` : '';
  switch (action) {
    case 'rerun':
      return `Would re-run the fuzzing campaign${target}`;
    case 'replay':
      return `Would replay the failing seed${target}`;
    case 'pause_campaign':
      return `Would pause the active campaign${target}`;
    case 'notify':
      return `Would notify the on-call channel${target}`;
    case 'create_issue':
      return `Would create a tracking issue${target}`;
  }
}

export function requestApproval(
  template: RunbookTemplate,
  execution: RunbookExecution,
  stepId: string,
  actor: string,
  now: Date = new Date(),
): RunbookExecution {
  ensureActive(execution);
  const step = stepOf(template, stepId);
  if (!step.automation?.requiresApproval) throw new RunbookError('NO_APPROVAL_NEEDED', 'Step does not require approval');
  const at = now.toISOString();
  return update(execution, stepId, { approval: { requestedBy: actor, at } }, { at, actor, type: 'approval_requested', stepId });
}

/** Approvers must be maintainers and cannot approve their own request. */
export function approveStep(
  template: RunbookTemplate,
  execution: RunbookExecution,
  stepId: string,
  actor: string,
  role: RunbookRole,
  now: Date = new Date(),
): RunbookExecution {
  ensureActive(execution);
  stepOf(template, stepId);
  const approval = execution.steps[stepId].approval;
  if (!approval) throw new RunbookError('NO_REQUEST', 'No approval has been requested for this step');
  if (!hasRole(role, 'maintainer')) throw new RunbookError('FORBIDDEN', 'Only maintainers can approve automation');
  if (approval.requestedBy === actor) throw new RunbookError('SELF_APPROVAL', 'You cannot approve your own request');
  const at = now.toISOString();
  return update(execution, stepId, { approval: { ...approval, approvedBy: actor } }, { at, actor, type: 'approved', stepId });
}

/** Post-execution summary suitable for a postmortem. */
export function summarizeExecution(template: RunbookTemplate, execution: RunbookExecution) {
  const applicable = applicableSteps(template, execution);
  const done = applicable.filter((s) => execution.steps[s.id].status === 'completed').length;
  const evidenceCount = Object.values(execution.steps).reduce((n, s) => n + s.evidence.length, 0);
  const durationMs = execution.completedAt ? Date.parse(execution.completedAt) - Date.parse(execution.startedAt) : null;
  return {
    runbook: `${template.title} v${execution.templateVersion}`,
    status: execution.status,
    stepsCompleted: done,
    stepsTotal: applicable.length,
    blocked: applicable.filter((s) => execution.steps[s.id].status === 'blocked').map((s) => s.id),
    evidenceCount,
    durationMs,
    timeline: execution.audit,
  };
}

/** Governance: edits create a new draft version that needs approval before use. */
export function reviseTemplate(
  template: RunbookTemplate,
  changes: Partial<Pick<RunbookTemplate, 'title' | 'steps' | 'failureType' | 'service'>>,
  now: Date = new Date(),
): RunbookTemplate {
  const next = { ...template, ...changes, version: template.version + 1, status: 'draft' as const, approvedBy: undefined, updatedAt: now.toISOString() };
  const problems = validateTemplate(next);
  if (problems.length) throw new RunbookError('INVALID_TEMPLATE', problems.join('; '));
  return next;
}

export function approveTemplate(template: RunbookTemplate, approver: string, role: RunbookRole, now: Date = new Date()): RunbookTemplate {
  if (!hasRole(role, 'maintainer')) throw new RunbookError('FORBIDDEN', 'Only maintainers can approve templates');
  if (template.status === 'approved') return template;
  return { ...template, status: 'approved', approvedBy: approver, updatedAt: now.toISOString() };
}

/** Rank templates for a launch context: same failure type first, then service match, then freshness. */
export function suggestTemplates(
  templates: RunbookTemplate[],
  query: { failureType?: string; service?: string },
  now: Date = new Date(),
): RunbookTemplate[] {
  const score = (t: RunbookTemplate) =>
    (t.status === 'approved' ? 100 : 0) +
    (query.failureType && t.failureType === query.failureType ? 10 : 0) +
    (query.service && t.service === query.service ? 5 : 0) -
    (isStale(t, now) ? 1 : 0);
  return templates.slice().sort((a, b) => score(b) - score(a) || a.title.localeCompare(b.title));
}
