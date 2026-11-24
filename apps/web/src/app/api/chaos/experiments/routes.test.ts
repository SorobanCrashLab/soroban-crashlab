import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { describePrincipal } from '@/lib/rbac';
import { matchRouteCatalogEntry } from '@/lib/route-catalog';
import { modelTelemetry } from '@/features/chaos/lib/monitor';
import { ChaosStore, createSimulatedExecutor, resetChaosStore } from '@/features/chaos/lib/server';
import { findExperimentTemplate } from '@/features/chaos/lib/templates';
import { GET as controlGet, POST as controlPost } from './[id]/control/route';
import { GET, POST } from './route';

vi.mock('@/lib/rbac', () => ({
  checkRbacPermission: vi.fn(async () => null),
  describePrincipal: vi.fn(),
}));

const as = (subject: string, role: 'analyst' | 'maintainer', authenticated = true) =>
  vi.mocked(describePrincipal).mockResolvedValue({
    principal: { identityType: 'github', identityValue: subject, subject: `github:${subject}`, authenticated },
    role,
    satisfies: () => true,
  });

const NOW = Date.parse('2026-11-24T15:00:00Z'); // Tuesday, inside every maintenance window
let executor: ReturnType<typeof createSimulatedExecutor>;

const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const list = () => GET(new NextRequest('http://localhost/api/chaos/experiments'));
const save = (body: unknown) => POST(new NextRequest('http://localhost/api/chaos/experiments', json(body)));
const control = (id: string, body: unknown) =>
  controlPost(new NextRequest(`http://localhost/api/chaos/experiments/${id}/control`, json(body)), { params: Promise.resolve({ id }) });
const live = (id: string, query = '') =>
  controlGet(new NextRequest(`http://localhost/api/chaos/experiments/${id}/control${query}`), { params: Promise.resolve({ id }) });

describe('chaos experiment routes', () => {
  beforeEach(() => {
    executor = createSimulatedExecutor();
    resetChaosStore(new ChaosStore(executor, modelTelemetry, () => NOW));
    as('alice', 'analyst');
  });

  it('registers both routes', () => {
    expect(matchRouteCatalogEntry('POST', '/api/chaos/experiments')?.requiredCapability?.role).toBe('analyst');
    expect(matchRouteCatalogEntry('POST', '/api/chaos/experiments/exp-1/control')?.path).toBe('/api/chaos/experiments/[id]/control');
  });

  it('lists seeded experiments with templates, inventory and simulated executor', async () => {
    const body = (await (await list()).json()) as { data: { executor: string; experiments: Array<{ id: string; status: string }>; templates: unknown[] } };
    expect(body.data.executor).toBe('simulated');
    expect(body.data.templates.length).toBeGreaterThan(0);
    expect(body.data.experiments.find((entry) => entry.id === 'exp-demo-error-burst')?.status).toBe('halted');
  });

  it('dry-runs, saves and versions definitions; rejects anonymous and invalid input', async () => {
    const definition = findExperimentTemplate('rpc-latency-spike')!.definition;
    const dry = (await (await save({ action: 'dry-run', definition })).json()) as { data: { readyToSubmit: boolean; impact: { blastRadiusPct: number } } };
    expect(dry.data.readyToSubmit).toBe(true);
    expect(dry.data.impact.blastRadiusPct).toBeGreaterThan(0);
    expect((await save({ action: 'save', definition: { ...definition, haltRules: [] } })).status).toBe(422);
    const created = await save({ action: 'save', definition });
    expect(created.status).toBe(201);
    const { data } = (await created.json()) as { data: { experiment: { id: string; version: number } } };
    const updated = (await (await save({ action: 'save', id: data.experiment.id, definition: { ...definition, durationSec: 400 } })).json()) as {
      data: { experiment: { version: number } };
    };
    expect(updated.data.experiment.version).toBe(2);
    as('anon', 'analyst', false);
    expect((await save({ action: 'save', definition })).status).toBe(403);
  });

  it('runs the approve → confirm → start → emergency abort path end to end', async () => {
    const definition = findExperimentTemplate('rpc-latency-spike')!.definition;
    const { data } = (await (await save({ action: 'save', definition })).json()) as { data: { experiment: { id: string } } };
    const id = data.experiment.id;
    expect((await control(id, { action: 'start', confirmation: definition.name })).status).toBe(409);
    expect(((await (await control(id, { action: 'submit' })).json()) as { data: { experiment: { status: string } } }).data.experiment.status).toBe(
      'pending-approval',
    );
    expect((await control(id, { action: 'approve' })).status).toBe(403);
    as('bob', 'maintainer');
    expect((await control(id, { action: 'approve', note: 'ok' })).status).toBe(200);
    const refused = await control(id, { action: 'start', confirmation: 'nope' });
    expect(refused.status).toBe(422);
    const started = await control(id, { action: 'start', confirmation: definition.name });
    expect(started.status).toBe(200);
    expect(executor.log).toContain(`inject ${id}`);

    const state = (await (await live(id)).json()) as { data: { experiment: { status: string }; samples: unknown[]; allowedActions: string[] } };
    expect(state.data.experiment.status).toBe('running');
    expect(state.data.allowedActions).toEqual(['stop', 'abort']);

    as('alice', 'analyst');
    expect((await control(id, { action: 'abort' })).status).toBe(422);
    const aborted = (await (await control(id, { action: 'abort', reason: 'latency alarms' })).json()) as { data: { experiment: { status: string } } };
    expect(aborted.data.experiment.status).toBe('aborted');
    const again = (await (await control(id, { action: 'abort', reason: 'retry' })).json()) as { data: { changed: boolean } };
    expect(again.data.changed).toBe(false);
    expect(executor.log.filter((entry) => entry === `revoke ${id}`)).toHaveLength(2);
  });

  it('serves analysis and markdown reports for ended experiments', async () => {
    const report = await live('exp-demo-error-burst', '?format=markdown');
    expect(report.headers.get('content-type')).toContain('text/markdown');
    expect(await report.text()).toContain('verdict **refuted**');
    const draft = await live('exp-demo-rpc-latency', '?format=markdown');
    expect(draft.status).toBe(409);
    expect((await live('missing')).status).toBe(404);
  });

  it('emergency-stops every active experiment at once', async () => {
    const definition = findExperimentTemplate('runner-cpu-pressure')!.definition;
    const { data } = (await (await save({ action: 'save', definition })).json()) as { data: { experiment: { id: string } } };
    await control(data.experiment.id, { action: 'submit' });
    await control(data.experiment.id, { action: 'start', confirmation: definition.name });
    expect((await save({ action: 'abort-all', reason: ' ' })).status).toBe(422);
    const stopped = (await (await save({ action: 'abort-all', reason: 'incident INC-1' })).json()) as { data: { aborted: string[] } };
    expect(stopped.data.aborted).toEqual([data.experiment.id]);
  });
});
