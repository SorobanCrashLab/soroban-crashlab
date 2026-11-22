import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRecordDriver } from '@/lib/storage/record-driver';
import {
  createWorkflowRule,
  SAMPLE_EVENTS,
  simulateWorkflowRule,
  workflowRuleInputSchema,
} from './rules';
import { AutomationStore } from './store';

describe('AutomationStore', () => {
  let store: AutomationStore;

  beforeEach(() => {
    store = new AutomationStore(new InMemoryRecordDriver());
  });

  it('persists rules within a principal scope and isolates other principals', async () => {
    const input = workflowRuleInputSchema.parse({
      name: 'Notify on critical crashes',
      trigger: 'crash.created',
      conditions: [{ field: 'severity', operator: 'equals', value: 'critical' }],
      actions: [{ type: 'notify', value: 'On-call team' }],
    });
    const rule = createWorkflowRule(input, 'rule-a', '2026-01-01T00:00:00.000Z', 'alice');

    await store.saveRule('alice', rule, true);

    expect((await store.listRules('alice')).map(({ id }) => id)).toEqual(['rule-a']);
    expect(await store.listRules('bob')).toEqual([]);
    expect(await store.deleteRule('alice', rule.id)).toBe(true);
    expect(await store.getRule('alice', rule.id)).toBeNull();
  });

  it('records bounded dry-run execution history', async () => {
    const rule = createWorkflowRule(
      workflowRuleInputSchema.parse({
        name: 'Notify on critical crashes',
        trigger: 'crash.created',
        conditions: [{ field: 'severity', operator: 'equals', value: 'critical' }],
        actions: [{ type: 'notify', value: 'On-call team' }],
      }),
      'rule-a',
      '2026-01-01T00:00:00.000Z',
      'alice',
    );
    const result = simulateWorkflowRule(rule, SAMPLE_EVENTS[0]);

    await store.appendExecution('alice', result, 'alice');

    expect(await store.listExecutions('alice')).toMatchObject([
      { ruleId: 'rule-a', actor: 'alice', sideEffectsPerformed: false },
    ]);
    expect(await store.listExecutions('bob')).toEqual([]);
  });
});
