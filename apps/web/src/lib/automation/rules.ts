import { z } from 'zod';

export const MAX_WORKFLOW_RULES = 100;
export const MAX_RULE_CONDITIONS = 10;
export const MAX_RULE_ACTIONS = 5;
export const MAX_RULE_VERSIONS = 20;

export const WORKFLOW_TRIGGERS = [
  { id: 'crash.created', label: 'New crash reported' },
  { id: 'regression.detected', label: 'Regression detected' },
  { id: 'campaign.threshold', label: 'Campaign threshold reached' },
  { id: 'webhook.failed', label: 'Integration delivery failed' },
] as const;

export const CONDITION_FIELDS = ['eventType', 'severity', 'project', 'count'] as const;
export const CONDITION_OPERATORS = ['equals', 'not-equals', 'greater-than', 'less-than'] as const;
export const ACTION_TYPES = ['tag', 'notify', 'create-ticket', 'pause-campaign', 'run-replay'] as const;
export const RULE_STATUSES = ['draft', 'enabled', 'paused'] as const;

export type WorkflowTrigger = (typeof WORKFLOW_TRIGGERS)[number]['id'];
export type ConditionField = (typeof CONDITION_FIELDS)[number];
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];
export type WorkflowActionType = (typeof ACTION_TYPES)[number];
export type WorkflowRuleStatus = (typeof RULE_STATUSES)[number];

const conditionSchema = z.object({
  field: z.enum(CONDITION_FIELDS),
  operator: z.enum(CONDITION_OPERATORS),
  value: z.union([z.string().trim().min(1).max(120), z.number().finite()]),
}).superRefine((condition, context) => {
  const expectsNumber = condition.field === 'count';
  if (expectsNumber !== (typeof condition.value === 'number')) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: expectsNumber ? 'The count field requires a numeric value.' : 'This field requires a text value.',
    });
  }
  if (
    ['greater-than', 'less-than'].includes(condition.operator) &&
    (condition.field !== 'count' || typeof condition.value !== 'number')
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Numeric comparisons require the count field and a numeric value.',
    });
  }
});

const actionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  value: z.string().trim().min(1).max(120),
});

export const workflowRuleInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  trigger: z.enum(WORKFLOW_TRIGGERS.map(({ id }) => id) as [WorkflowTrigger, ...WorkflowTrigger[]]),
  conditions: z.array(conditionSchema).min(1).max(MAX_RULE_CONDITIONS),
  actions: z.array(actionSchema).min(1).max(MAX_RULE_ACTIONS),
});

export const workflowRulePatchSchema = workflowRuleInputSchema.partial().extend({
  status: z.enum(RULE_STATUSES).optional(),
});

export type WorkflowCondition = z.infer<typeof conditionSchema>;
export type WorkflowAction = z.infer<typeof actionSchema>;
export type WorkflowRuleInput = z.infer<typeof workflowRuleInputSchema>;
export type WorkflowRulePatch = z.infer<typeof workflowRulePatchSchema>;

export const workflowRuleSnapshotSchema = workflowRuleInputSchema.extend({
  status: z.enum(RULE_STATUSES),
});
export const workflowRuleVersionSchema = z.object({
  version: z.number().int().positive(),
  savedAt: z.string().datetime(),
  actor: z.string().min(1),
  snapshot: workflowRuleSnapshotSchema,
});
export const workflowRuleSchema = workflowRuleSnapshotSchema.extend({
  id: z.string().min(1),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
  versions: z.array(workflowRuleVersionSchema).max(MAX_RULE_VERSIONS),
});

export type WorkflowRuleSnapshot = z.infer<typeof workflowRuleSnapshotSchema>;
export type WorkflowRuleVersion = z.infer<typeof workflowRuleVersionSchema>;
export type WorkflowRule = z.infer<typeof workflowRuleSchema>;

export const SAMPLE_EVENTS = [
  {
    id: 'critical-crash',
    label: 'Critical crash',
    type: 'crash.created',
    severity: 'critical',
    project: 'wallet-contract',
    count: 12,
  },
  {
    id: 'regression',
    label: 'New regression',
    type: 'regression.detected',
    severity: 'high',
    project: 'vault-contract',
    count: 3,
  },
  {
    id: 'campaign-threshold',
    label: 'Campaign threshold',
    type: 'campaign.threshold',
    severity: 'medium',
    project: 'pool-contract',
    count: 20,
  },
  {
    id: 'webhook-failure',
    label: 'Webhook delivery failure',
    type: 'webhook.failed',
    severity: 'medium',
    project: 'api-gateway',
    count: 1,
  },
] as const;

export type SampleWorkflowEvent = (typeof SAMPLE_EVENTS)[number];

export type SimulationResult = {
  matched: boolean;
  eventId: SampleWorkflowEvent['id'];
  ruleId: string;
  ruleVersion: number;
  actionsPlanned: WorkflowAction[];
  sideEffectsPerformed: false;
  explanation: string;
};

export function createWorkflowRule(
  input: WorkflowRuleInput,
  id: string,
  now: string,
  actor: string,
): WorkflowRule {
  return {
    ...input,
    id,
    status: 'draft',
    version: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    updatedBy: actor,
    versions: [],
  };
}

export function updateWorkflowRule(
  current: WorkflowRule,
  patch: WorkflowRulePatch,
  now: string,
  actor: string,
): WorkflowRule {
  const { status, ...inputPatch } = patch;
  const nextSnapshot: WorkflowRuleSnapshot = {
    name: inputPatch.name ?? current.name,
    trigger: inputPatch.trigger ?? current.trigger,
    conditions: inputPatch.conditions ?? current.conditions,
    actions: inputPatch.actions ?? current.actions,
    status: status ?? current.status,
  };
  const changed = JSON.stringify(nextSnapshot) !== JSON.stringify({
    name: current.name,
    trigger: current.trigger,
    conditions: current.conditions,
    actions: current.actions,
    status: current.status,
  });
  if (!changed) return current;

  const nextVersion = current.version + 1;
  const previousVersion: WorkflowRuleVersion = {
    version: current.version,
    savedAt: current.updatedAt,
    actor: current.updatedBy,
    snapshot: {
      name: current.name,
      trigger: current.trigger,
      conditions: current.conditions,
      actions: current.actions,
      status: current.status,
    },
  };

  return {
    ...nextSnapshot,
    id: current.id,
    version: nextVersion,
    createdAt: current.createdAt,
    updatedAt: now,
    createdBy: current.createdBy,
    updatedBy: actor,
    versions: [...current.versions, previousVersion].slice(-MAX_RULE_VERSIONS),
  };
}

function conditionMatches(condition: WorkflowCondition, event: SampleWorkflowEvent): boolean {
  const actual = condition.field === 'eventType' ? event.type : event[condition.field];
  if (condition.operator === 'equals') return actual === condition.value;
  if (condition.operator === 'not-equals') return actual !== condition.value;
  if (condition.field !== 'count' || typeof condition.value !== 'number') return false;
  return condition.operator === 'greater-than'
    ? event.count > condition.value
    : event.count < condition.value;
}

export function simulateWorkflowRule(
  rule: WorkflowRule,
  event: SampleWorkflowEvent,
): SimulationResult {
  const matched = event.type === rule.trigger && rule.conditions.every((condition) => conditionMatches(condition, event));
  return {
    matched,
    eventId: event.id,
    ruleId: rule.id,
    ruleVersion: rule.version,
    actionsPlanned: matched ? rule.actions : [],
    sideEffectsPerformed: false,
    explanation: matched
      ? 'The trigger and all conditions matched. Actions are shown as a dry-run plan only.'
      : 'The event did not satisfy the rule trigger and conditions.',
  };
}
