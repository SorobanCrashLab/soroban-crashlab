import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { describePrincipal } from '@/lib/rbac';
import { matchRouteCatalogEntry } from '@/lib/route-catalog';
import { resetArtifactStore } from '@/features/artifacts/storage-manager/lib/server';
import { GET as browse } from './browse/route';
import { GET as holdsGet, POST as holdsPost } from './holds/route';
import { GET as lineage } from './lineage/route';
import { GET as metadata, POST as metadataPost } from './metadata/route';
import { GET as retentionGet, POST as retentionPost } from './retention/route';

const files = new Map<string, Buffer>();

vi.mock('@/lib/rbac', () => ({
  checkRbacPermission: vi.fn(async () => null),
  describePrincipal: vi.fn(),
}));

vi.mock('@/lib/storage/artifact-repository', () => ({
  selectArtifactRepository: () => ({
    list: async () =>
      [...files.entries()].map(([id, buffer]) => ({ id, name: id, createdAt: '2025-01-01T00:00:00.000Z', sizeBytes: buffer.length })),
    get: async (id: string) =>
      files.has(id)
        ? { metadata: { id, name: id, createdAt: '2025-01-01T00:00:00.000Z', sizeBytes: files.get(id)!.length }, buffer: files.get(id)! }
        : null,
    put: async () => {
      throw new Error('not used');
    },
    delete: async (id: string) => files.delete(id),
  }),
}));

type Role = 'analyst' | 'maintainer';
const as = (role: Role, subject = `github:${role}`, authenticated = true) =>
  vi.mocked(describePrincipal).mockResolvedValue({
    principal: { identityType: 'github', identityValue: subject, subject, authenticated },
    role,
    satisfies: () => true,
  });

const get = (path: string) => new NextRequest(`http://localhost${path}`);
const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe('artifact storage manager routes', () => {
  beforeEach(() => {
    resetArtifactStore();
    files.clear();
    files.set('notes.json', Buffer.from(JSON.stringify({ password: 'hunter2', run: 'run-1000' })));
    as('analyst');
  });

  it('registers every route ahead of the [id] wildcard', () => {
    for (const [method, path] of [
      ['GET', '/api/artifacts/browse'],
      ['GET', '/api/artifacts/metadata'],
      ['POST', '/api/artifacts/metadata'],
      ['GET', '/api/artifacts/lineage'],
      ['GET', '/api/artifacts/retention'],
      ['POST', '/api/artifacts/retention'],
      ['GET', '/api/artifacts/holds'],
      ['POST', '/api/artifacts/holds'],
    ] as const) {
      expect(matchRouteCatalogEntry(method, path)?.path).toBe(path);
    }
    expect(matchRouteCatalogEntry('POST', '/api/artifacts/holds')?.requiredCapability?.role).toBe('maintainer');
  });

  it('browses real and demo artifacts with backend health and pagination', async () => {
    const response = await browse(get('/api/artifacts/browse?limit=5'));
    expect(response.status).toBe(200);
    const body = await json<{ data: { items: Array<{ id: string }>; total: number; nextCursor: string; backends: Array<{ backend: string }> } }>(response);
    expect(body.data.items).toHaveLength(5);
    expect(body.data.backends.map((backend) => backend.backend)).toEqual(['local', 's3', 'minio']);
    const local = await json<{ data: { items: Array<{ id: string; source: string }> } }>(await browse(get('/api/artifacts/browse?q=notes')));
    expect(local.data.items).toEqual([expect.objectContaining({ id: 'local:notes.json', source: 'storage' })]);
    const next = await browse(get(`/api/artifacts/browse?limit=5&cursor=${body.data.nextCursor}`));
    expect(next.status).toBe(200);
    expect((await browse(get(`/api/artifacts/browse?limit=5&backend=s3&cursor=${body.data.nextCursor}`))).status).toBe(400);
    expect((await browse(get('/api/artifacts/browse?limit=0'))).status).toBe(422);
  });

  it('hides restricted artifacts from anonymous callers and masks them for analysts', async () => {
    as('analyst', 'anon', false);
    const anonymous = await json<{ data: { items: Array<{ sensitivity: string }> } }>(await browse(get('/api/artifacts/browse?sensitivity=restricted')));
    expect(anonymous.data.items).toHaveLength(0);
    as('analyst');
    const analyst = await json<{ data: { items: Array<{ name: string; redacted?: boolean }> } }>(await browse(get('/api/artifacts/browse?sensitivity=restricted')));
    expect(analyst.data.items.length).toBeGreaterThan(0);
    expect(analyst.data.items.every((item) => item.name === 'Restricted artifact' && item.redacted)).toBe(true);
  });

  it('returns integrity, access, redacted preview and checksum verification for stored files', async () => {
    const response = await metadata(get('/api/artifacts/metadata?id=local:notes.json&preview=1&verify=1'));
    const body = await json<{
      data: {
        access: { canDownload: boolean };
        download: { href: string; method: string };
        preview: { text: string };
        artifact: { checksumMatches: boolean; checksums: { sha256: string } };
      };
    }>(response);
    expect(body.data.access.canDownload).toBe(true);
    expect(body.data.download).toEqual({ href: '/api/artifacts/notes.json', method: 'proxy', expiresAt: null });
    expect(body.data.preview.text).not.toContain('hunter2');
    expect(body.data.artifact.checksumMatches).toBe(true);
    expect(body.data.artifact.checksums.sha256).toMatch(/^[0-9a-f]{64}$/);

    files.set('notes.json', Buffer.from('tampered'));
    const tampered = await json<{ data: { integrity: { level: string }; download: unknown } }>(
      await metadata(get('/api/artifacts/metadata?id=local:notes.json&verify=1')),
    );
    expect(tampered.data.integrity.level).toBe('blocked');
    expect(tampered.data.download).toBeNull();
    expect((await metadata(get('/api/artifacts/metadata?id=missing'))).status).toBe(404);
  });

  it('bulk-tags and builds lineage graphs', async () => {
    const tagged = await json<{ data: { updated: string[]; skipped: unknown[] } }>(
      await metadataPost(post('/api/artifacts/metadata', { action: 'tag', ids: ['art-0001', 'nope'], add: ['triaged'] })),
    );
    expect(tagged.data.updated).toEqual(['art-0001']);
    const after = await json<{ data: { artifact: { tags: string[] } } }>(await metadata(get('/api/artifacts/metadata?id=art-0001')));
    expect(after.data.artifact.tags).toContain('triaged');
    const graph = await json<{ data: { graph: { nodes: unknown[] } } }>(await lineage(get('/api/artifacts/lineage?id=art-0003&depth=3')));
    expect(graph.data.graph.nodes.length).toBeGreaterThan(3);
    expect((await lineage(get('/api/artifacts/lineage'))).status).toBe(400);
  });

  it('runs the governed deletion workflow end to end', async () => {
    const policy = { artifactType: 'log', maxAgeDays: 10, action: 'delete', keepMinimum: 0, enabled: true };
    expect((await retentionPost(post('/api/artifacts/retention', { action: 'update-policy', policy }))).status).toBe(403);
    as('maintainer');
    expect((await retentionPost(post('/api/artifacts/retention', { action: 'update-policy', policy }))).status).toBe(200);
    const state = await json<{ data: { simulation: { eligible: unknown[] }; audit: Array<{ action: string }> } }>(
      await retentionGet(get('/api/artifacts/retention')),
    );
    expect(state.data.simulation.eligible.length).toBeGreaterThan(0);
    expect(state.data.audit[0].action).toBe('retention.update');

    as('analyst', 'github:alice');
    const requested = await json<{ data: { request: { id: string } } }>(
      await retentionPost(post('/api/artifacts/retention', { action: 'request-deletion', artifactIds: ['local:notes.json'], reason: 'stale upload' })),
    );
    const id = requested.data.request.id;
    expect((await retentionPost(post('/api/artifacts/retention', { action: 'decide', requestId: id, decision: 'approve' }))).status).toBe(403);
    as('maintainer', 'github:alice');
    expect((await retentionPost(post('/api/artifacts/retention', { action: 'decide', requestId: id, decision: 'approve' }))).status).toBe(403);
    as('maintainer', 'github:bob');
    expect((await retentionPost(post('/api/artifacts/retention', { action: 'execute', requestId: id }))).status).toBe(409);
    expect((await retentionPost(post('/api/artifacts/retention', { action: 'decide', requestId: id, decision: 'approve' }))).status).toBe(200);
    expect((await retentionPost(post('/api/artifacts/retention', { action: 'execute', requestId: id }))).status).toBe(200);
    expect(files.has('notes.json')).toBe(false);
  });

  it('creates and releases holds with justification, blocking deletion requests meanwhile', async () => {
    const create = { action: 'create', name: 'Counsel', kind: 'legal', reason: 'Preserve for counsel review', scope: { artifactIds: ['local:notes.json'] } };
    expect((await holdsPost(post('/api/artifacts/holds', create))).status).toBe(403);
    as('maintainer');
    const created = await json<{ data: { hold: { id: string } } }>(await holdsPost(post('/api/artifacts/holds', create)));
    const list = await json<{ data: { holds: Array<{ id: string; active: boolean; coveredArtifacts: number }> } }>(
      await holdsGet(get('/api/artifacts/holds')),
    );
    expect(list.data.holds.find((hold) => hold.id === created.data.hold.id)).toMatchObject({ active: true, coveredArtifacts: 1 });
    expect(
      (await retentionPost(post('/api/artifacts/retention', { action: 'request-deletion', artifactIds: ['local:notes.json'], reason: 'cleanup' }))).status,
    ).toBe(409);
    expect((await holdsPost(post('/api/artifacts/holds', { action: 'release', holdId: created.data.hold.id, justification: 'done' }))).status).toBe(422);
    expect(
      (
        await holdsPost(
          post('/api/artifacts/holds', { action: 'release', holdId: created.data.hold.id, justification: 'Counsel confirmed matter closed.' }),
        )
      ).status,
    ).toBe(200);
    expect((await holdsPost(post('/api/artifacts/holds', { ...create, scope: {} }))).status).toBe(422);
  });
});
