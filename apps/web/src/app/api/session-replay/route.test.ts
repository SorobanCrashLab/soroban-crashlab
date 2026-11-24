import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { describePrincipal } from '@/lib/rbac';
import { matchRouteCatalogEntry } from '@/lib/route-catalog';
import { resetReplayStore } from '@/features/session-replay/lib/server';
import { GET, POST } from './route';

vi.mock('@/lib/rbac', () => ({
  checkRbacPermission: vi.fn(async () => null),
  describePrincipal: vi.fn(),
}));

const as = (role: 'analyst' | 'maintainer', authenticated = true) =>
  vi.mocked(describePrincipal).mockResolvedValue({
    principal: { identityType: 'github', identityValue: role, subject: `github:${role}`, authenticated },
    role,
    satisfies: () => true,
  });

const get = (query = '') => new NextRequest(`http://localhost/api/session-replay${query}`);
const post = (body: unknown) =>
  new NextRequest('http://localhost/api/session-replay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const meta = {
  id: 'rs-route-test-1',
  startedAt: new Date().toISOString(),
  userAgent: 'Chrome',
  viewport: { width: 1280, height: 800 },
  entryRoute: '/triage',
  environment: 'test',
  release: null,
  consent: 'granted',
  sampleRate: 1,
};

describe('/api/session-replay', () => {
  beforeEach(() => {
    resetReplayStore();
    as('analyst', false);
  });

  it('is registered in the route catalog', () => {
    expect(matchRouteCatalogEntry('GET', '/api/session-replay')).not.toBeNull();
    expect(matchRouteCatalogEntry('POST', '/api/session-replay')?.rateLimitClass).toBe('lenient');
  });

  it('ingests batches with server-side scrubbing and ignores duplicate sequence numbers', async () => {
    const batch = {
      kind: 'ingest',
      session: meta,
      seq: 1,
      events: [
        { type: 'navigation', t: 0, route: '/triage?token=abc', from: null, kind: 'load' },
        { type: 'console', t: 10, level: 'error', message: 'failed for dev@example.com' },
      ],
    };
    const first = await POST(post(batch));
    expect(first.status).toBe(202);
    expect(((await first.json()) as { data: { accepted: number } }).data.accepted).toBe(2);
    expect(((await (await POST(post(batch))).json()) as { data: { duplicate: boolean } }).data.duplicate).toBe(true);
    expect((await POST(post({ ...batch, events: [{ type: 'evil', t: 0 }] }))).status).toBe(422);

    // Anonymous callers cannot read captured sessions, and cannot tell they exist.
    expect((await GET(get(`?id=${meta.id}`))).status).toBe(404);
    as('analyst');
    const response = await GET(get(`?id=${meta.id}`));
    const body = (await response.json()) as { data: { session: { events: Array<{ route?: string; message?: string }> }; access: string } };
    expect(body.data.access).toBe('role');
    expect(body.data.session.events[0].route).toBe('/triage?token=[REDACTED]');
    expect(body.data.session.events[1].message).toBe('failed for [email]');
  });

  it('lists demo sessions for everyone and captured ones for signed-in users', async () => {
    await POST(post({ kind: 'ingest', session: meta, seq: 1, events: [{ type: 'mark', t: 1, label: 'x' }] }));
    const anonymous = (await (await GET(get())).json()) as { data: { sessions: Array<{ id: string; source: string }> } };
    expect(anonymous.data.sessions.every((session) => session.source === 'demo')).toBe(true);
    as('analyst');
    const signedIn = (await (await GET(get())).json()) as { data: { sessions: Array<{ id: string }> } };
    expect(signedIn.data.sessions.some((session) => session.id === meta.id)).toBe(true);
    const journeys = (await (await GET(get('?view=journeys'))).json()) as { data: { report: { funnels: Array<{ id: string }> } } };
    expect(journeys.data.report.funnels.map((funnel) => funnel.id)).toEqual(['triage', 'campaign-setup', 'run-investigation']);
  });

  it('mints maintainer-only, time-bounded share links that grant read access', async () => {
    await POST(post({ kind: 'ingest', session: meta, seq: 1, events: [{ type: 'mark', t: 1, label: 'x' }] }));
    as('analyst');
    expect((await POST(post({ kind: 'share', sessionId: meta.id }))).status).toBe(403);
    as('maintainer');
    const shared = (await (await POST(post({ kind: 'share', sessionId: meta.id, ttlMinutes: 30 }))).json()) as {
      data: { url: string; expiresAt: string };
    };
    const token = new URL(shared.data.url, 'http://localhost').searchParams.get('share')!;
    as('analyst', false);
    expect((await GET(get(`?id=${meta.id}&share=${encodeURIComponent(token)}`))).status).toBe(200);
    expect((await GET(get(`?id=${meta.id}&share=${encodeURIComponent(`${token}x`)}`))).status).toBe(404);
    expect((await POST(post({ kind: 'share', sessionId: meta.id, ttlMinutes: 1 }))).status).toBe(422);
  });

  it('exports bundles and links incidents', async () => {
    const bundle = await GET(get('?id=demo-triage-failure&format=bundle'));
    expect(bundle.headers.get('content-disposition')).toContain('replay-demo-triage-failure.json');
    expect(((await bundle.json()) as { schema: string }).schema).toBe('crashlab.replay-bundle/v1');
    expect((await POST(post({ kind: 'link', sessionId: 'demo-triage-failure', incident: 'INC-9' }))).status).toBe(403);
    as('analyst');
    const linked = (await (await POST(post({ kind: 'link', sessionId: 'demo-triage-failure', incident: 'INC-9' }))).json()) as {
      data: { incidentIds: string[] };
    };
    expect(linked.data.incidentIds).toContain('INC-9');
  });
});
