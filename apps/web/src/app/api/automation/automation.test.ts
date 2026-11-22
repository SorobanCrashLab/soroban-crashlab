import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { InMemoryRecordDriver, setRecordDriver } from '@/lib/storage/record-driver';
import { GET as getExecutions } from './executions/route';
import { GET as getRule, PATCH as patchRule, DELETE as deleteRule } from './rules/[ruleId]/route';
import { GET as getRules, POST as createRule } from './rules/route';
import { POST as simulate } from './simulate/route';
import { GET as getTriggers } from './triggers/route';

const ruleInput = {
  name: 'Notify on critical crashes',
  trigger: 'crash.created',
  conditions: [{ field: 'severity', operator: 'equals', value: 'critical' }],
  actions: [{ type: 'notify', value: 'On-call team' }],
};

function request(path: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
}

describe('/api/automation', () => {
  beforeEach(() => {
    setRecordDriver(new InMemoryRecordDriver());
  });

  it('creates, versions, simulates, lists, and deletes a rule without side effects', async () => {
    const createdResponse = await createRule(request('/api/automation/rules', 'POST', ruleInput));
    expect(createdResponse.status).toBe(201);
    const createdBody = await createdResponse.json() as { data: { rule: { id: string; version: number } } };
    const { id } = createdBody.data.rule;
    expect(createdBody.data.rule.version).toBe(1);

    const updatedResponse = await patchRule(
      request(`/api/automation/rules/${id}`, 'PATCH', { status: 'enabled' }),
      { params: Promise.resolve({ ruleId: id }) },
    );
    expect(updatedResponse.status).toBe(200);
    const updatedBody = await updatedResponse.json() as { data: { rule: { version: number; status: string } } };
    expect(updatedBody.data.rule).toMatchObject({ version: 2, status: 'enabled' });

    const simulationResponse = await simulate(
      request('/api/automation/simulate', 'POST', { ruleId: id, eventId: 'critical-crash' }),
    );
    expect(simulationResponse.status).toBe(200);
    const simulationBody = await simulationResponse.json() as { data: { result: { matched: boolean; sideEffectsPerformed: boolean } } };
    expect(simulationBody.data.result).toMatchObject({ matched: true, sideEffectsPerformed: false });

    const executions = await getExecutions(request('/api/automation/executions'));
    const executionBody = await executions.json() as { data: { executions: unknown[] } };
    expect(executionBody.data.executions).toHaveLength(1);
    expect((await getExecutions(request('/api/automation/executions?limit=invalid'))).status).toBe(400);

    const listed = await getRules(request('/api/automation/rules'));
    expect((await listed.json()).data.rules).toHaveLength(1);
    expect((await getTriggers()).status).toBe(200);

    expect((await deleteRule(
      request(`/api/automation/rules/${id}`, 'DELETE'),
      { params: Promise.resolve({ ruleId: id }) },
    )).status).toBe(200);
    expect((await getRule(
      request(`/api/automation/rules/${id}`),
      { params: Promise.resolve({ ruleId: id }) },
    )).status).toBe(404);
  });

  it('rejects invalid rule fields instead of storing an unusable rule', async () => {
    const response = await createRule(request('/api/automation/rules', 'POST', {
      ...ruleInput,
      conditions: [{ field: 'severity', operator: 'greater-than', value: 4 }],
    }));

    expect(response.status).toBe(422);
    expect((await getRules(request('/api/automation/rules'))).status).toBe(200);
    const body = await (await getRules(request('/api/automation/rules'))).json();
    expect(body.data.rules).toEqual([]);
  });
});
