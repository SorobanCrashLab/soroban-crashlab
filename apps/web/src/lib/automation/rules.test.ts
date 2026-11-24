import { describe, expect, it } from 'vitest';
import {
  createWorkflowRule,
  SAMPLE_EVENTS,
  simulateWorkflowRule,
  updateWorkflowRule,
  workflowRuleInputSchema,
} from './rules';

const createdAt = '2026-01-01T00:00:00.000Z';

function makeRule() {
  const parsed = workflowRuleInputSchema.parse({
    name: 'Notify on critical crashes',
    trigger: 'crash.created',
    conditions: [{ field: 'severity', operator: 'equals', value: 'critical' }],
    actions: [{ type: 'notify', value: 'On-call team' }],
  });
  return createWorkflowRule(parsed, 'rule-1', createdAt, 'test-actor');
}

describe('workflow rule model', () => {
  it('only plans actions when the trigger and every condition match', () => {
    const rule = makeRule();
    const matched = simulateWorkflowRule(rule, SAMPLE_EVENTS[0]);
    const unmatched = simulateWorkflowRule(rule, SAMPLE_EVENTS[1]);

    expect(matched).toMatchObject({
      matched: true,
      actionsPlanned: rule.actions,
      sideEffectsPerformed: false,
    });
    expect(unmatched).toMatchObject({
      matched: false,
      actionsPlanned: [],
      sideEffectsPerformed: false,
    });
  });

  it('records an immutable previous snapshot when changing a rule', () => {
    const rule = makeRule();
    const updated = updateWorkflowRule(
      rule,
      { status: 'enabled', name: 'Notify on urgent crashes' },
      '2026-01-02T00:00:00.000Z',
      'maintainer',
    );

    expect(updated.version).toBe(2);
    expect(updated.updatedBy).toBe('maintainer');
    expect(updated.versions).toEqual([{
      version: 1,
      savedAt: createdAt,
      actor: 'test-actor',
      snapshot: expect.objectContaining({ name: rule.name, status: 'draft' }),
    }]);
    expect(rule.name).toBe('Notify on critical crashes');
  });

  it('evaluates event-type and numeric conditions deterministically', () => {
    const input = workflowRuleInputSchema.parse({
      name: 'Large crash bursts',
      trigger: 'crash.created',
      conditions: [
        { field: 'eventType', operator: 'equals', value: 'crash.created' },
        { field: 'count', operator: 'greater-than', value: 5 },
      ],
      actions: [{ type: 'tag', value: 'high-volume' }],
    });
    const rule = createWorkflowRule(input, 'rule-2', createdAt, 'test-actor');

    expect(simulateWorkflowRule(rule, SAMPLE_EVENTS[0]).matched).toBe(true);
    expect(simulateWorkflowRule(rule, SAMPLE_EVENTS[1]).matched).toBe(false);
  });

  it('rejects numeric comparisons on non-numeric fields and excessive actions', () => {
    const invalidCondition = workflowRuleInputSchema.safeParse({
      name: 'Invalid condition',
      trigger: 'crash.created',
      conditions: [{ field: 'severity', operator: 'greater-than', value: 3 }],
      actions: [{ type: 'notify', value: 'On-call team' }],
    });
    const excessiveActions = workflowRuleInputSchema.safeParse({
      name: 'Too many actions',
      trigger: 'crash.created',
      conditions: [{ field: 'severity', operator: 'equals', value: 'critical' }],
      actions: Array.from({ length: 6 }, () => ({ type: 'notify', value: 'On-call team' })),
    });

    expect(invalidCondition.success).toBe(false);
    expect(excessiveActions.success).toBe(false);
  });

  it('provides a sample event for every supported trigger', () => {
    const sampleTriggers = new Set(SAMPLE_EVENTS.map((event) => event.type));
    expect(sampleTriggers).toEqual(new Set(['crash.created', 'regression.detected', 'campaign.threshold', 'webhook.failed']));
  });
});
