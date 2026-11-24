import { describe, expect, it } from 'vitest';
import { buildDemoCatalog, DEMO_ANCHOR, localArtifactToManaged } from './catalog';
import {
  DEFAULT_POLICIES,
  activeHoldsFor,
  applyTags,
  createHold,
  decideDeletion,
  metadataCsv,
  releaseHold,
  requestDeletion,
  simulateRetention,
} from './governance';
import { accessDecision, assessIntegrity, previewMode, safePreviewText } from './integrity';
import { buildLineage } from './lineage';
import type { LegalHold, ManagedArtifact } from './model';
import { projectArtifact, REDACTED } from './permissions';
import { browseArtifacts, browseQuerySchema, CursorMismatch, parseBrowseQuery } from './query';
import { backendStatuses, downloadLink } from './server';

const catalog = buildDemoCatalog();
const byId = new Map(catalog.map((artifact) => [artifact.id, artifact]));
const DAY = 86_400_000;

function artifact(overrides: Partial<ManagedArtifact> = {}): ManagedArtifact {
  return { ...catalog.find((candidate) => candidate.type === 'bundle')!, ...overrides };
}

function hold(overrides: Partial<LegalHold> = {}): LegalHold {
  return {
    id: 'h1',
    name: 'Case 1',
    kind: 'legal',
    reason: 'Preserve for counsel review.',
    scope: { campaignId: 'camp-auth-2026' },
    createdBy: 'github:a',
    createdAt: '2026-01-01T00:00:00Z',
    expiresAt: null,
    releasedAt: null,
    releasedBy: null,
    releaseJustification: null,
    ...overrides,
  };
}

describe('demo catalog', () => {
  it('is deterministic and spans every backend and type with lineage', () => {
    expect(buildDemoCatalog()).toEqual(catalog);
    expect(new Set(catalog.map((entry) => entry.backend))).toEqual(new Set(['local', 's3', 'minio']));
    expect(new Set(catalog.map((entry) => entry.type)).size).toBe(6);
    const report = catalog.find((entry) => entry.type === 'report')!;
    expect(report.lineage.map((parent) => parent.relation)).toEqual(['summarizes', 'summarizes']);
    expect(catalog.every((entry) => entry.source === 'demo')).toBe(true);
  });

  it('maps real repository files with unknown integrity', () => {
    const managed = localArtifactToManaged({ id: 'trace.json', name: 'trace.json', createdAt: '2026-01-01T00:00:00Z', sizeBytes: 10 });
    expect(managed).toMatchObject({ id: 'local:trace.json', type: 'reproducer', contentType: 'application/json', source: 'storage' });
    expect(assessIntegrity(managed).level).toBe('warning');
  });
});

describe('integrity and access', () => {
  it('blocks quarantined, infected or tampered artifacts', () => {
    const trusted = artifact({
      checksumMatches: true,
      checksums: { sha256: 'a'.repeat(64) },
      signature: { status: 'verified', keyId: 'k', signedAt: null },
      scan: { status: 'clean', engine: 'clamav', scannedAt: null, findings: [] },
      quarantine: { active: false, reason: null, since: null },
      provenance: { builder: 'gha', slsaLevel: 3, sourceCommit: null, attestationUrl: 'https://x', sbomUrl: null },
    });
    expect(assessIntegrity(trusted).level).toBe('trusted');
    expect(assessIntegrity({ ...trusted, checksumMatches: false }).level).toBe('blocked');
    expect(assessIntegrity({ ...trusted, signature: { status: 'invalid', keyId: 'k', signedAt: null } }).level).toBe('blocked');
    expect(assessIntegrity({ ...trusted, quarantine: { active: true, reason: 'x', since: null } }).reasons[0]).toMatch(/Quarantine/);
    expect(assessIntegrity({ ...trusted, signature: { status: 'unsigned', keyId: null, signedAt: null } }).level).toBe('warning');
  });

  it('never renders active content and redacts previews', () => {
    expect(previewMode('text/html')).toBe('text');
    expect(previewMode('image/svg+xml')).toBe('text');
    expect(previewMode('image/png')).toBe('image');
    expect(previewMode('application/json; charset=utf-8')).toBe('json');
    expect(previewMode('application/zip')).toBe('none');
    expect(safePreviewText('{"api_key":"sk_live_abcdefgh1234"}').text).not.toContain('sk_live');
    expect(safePreviewText('x'.repeat(70_000)).truncated).toBe(true);
  });

  it('gates downloads by role, sensitivity, integrity and source', () => {
    const real = { ...localArtifactToManaged({ id: 'a.txt', name: 'a.txt', createdAt: '2026-01-01T00:00:00Z', sizeBytes: 1 }) };
    expect(accessDecision(real, 'anonymous').canDownload).toBe(false);
    expect(accessDecision(real, 'analyst')).toMatchObject({ canDownload: true, canPreview: true, previewMode: 'text' });
    expect(accessDecision({ ...real, sensitivity: 'restricted' }, 'analyst').reason).toMatch(/maintainer/);
    expect(accessDecision({ ...real, quarantine: { active: true, reason: 'bad', since: null } }, 'maintainer').reason).toMatch(/Blocked/);
    expect(accessDecision(artifact(), 'maintainer').reason).toMatch(/Demo catalog/);
  });

  it('masks restricted metadata for analysts and hides it from anonymous viewers', () => {
    const restricted = artifact({ sensitivity: 'restricted', tags: ['secret'] });
    expect(projectArtifact(restricted, 'anonymous')).toBeNull();
    expect(projectArtifact(restricted, 'analyst')).toMatchObject({ name: 'Restricted artifact', key: REDACTED, tags: [], redacted: true });
    expect(projectArtifact(restricted, 'maintainer')).toBe(restricted);
  });
});

describe('browse query', () => {
  const parse = (query: string) => {
    const parsed = parseBrowseQuery(new URLSearchParams(query));
    if (!parsed.ok) throw new Error(parsed.errors.join(';'));
    return parsed.query;
  };

  it('filters, facets and pages with stable ordering', () => {
    const first = browseArtifacts(catalog, parse('backend=s3&limit=10'));
    expect(first.items).toHaveLength(10);
    expect(first.items.every((item) => item.backend === 's3')).toBe(true);
    expect(first.facets.backend).toEqual({ s3: first.total });
    const second = browseArtifacts(catalog, parse(`backend=s3&limit=10&cursor=${first.nextCursor}`));
    expect(second.items[0].id).not.toBe(first.items[0].id);
    const dates = [...first.items, ...second.items].map((item) => Date.parse(item.createdAt));
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
    const all = browseArtifacts(catalog, parse('limit=100'));
    expect(Object.values(all.facets.integrity).reduce((a, b) => a + b, 0)).toBe(all.total);
  });

  it('supports type, run, tag, size, date, text and integrity filters', () => {
    expect(browseArtifacts(catalog, parse('type=report&tag=pr')).items.every((item) => item.type === 'report' && item.tags.includes('pr'))).toBe(true);
    expect(browseArtifacts(catalog, parse('run=run-1001')).items.every((item) => item.runId === 'run-1001')).toBe(true);
    expect(browseArtifacts(catalog, parse('minSize=2000000')).items.every((item) => item.sizeBytes >= 2_000_000)).toBe(true);
    const to = new Date(DEMO_ANCHOR - 300 * DAY).toISOString();
    expect(browseArtifacts(catalog, parse(`to=${to}`)).items.every((item) => Date.parse(item.createdAt) <= Date.parse(to))).toBe(true);
    expect(browseArtifacts(catalog, parse('q=art-0001')).total).toBe(1);
    expect(browseArtifacts(catalog, parse('integrity=blocked')).items.every((item) => item.trust === 'blocked')).toBe(true);
  });

  it('rejects cursors replayed against different filters and bad params', () => {
    const page = browseArtifacts(catalog, parse('backend=s3&limit=5'));
    expect(() => browseArtifacts(catalog, parse(`backend=minio&limit=5&cursor=${page.nextCursor}`))).toThrow(CursorMismatch);
    expect(() => browseArtifacts(catalog, parse('cursor=garbage'))).toThrow(CursorMismatch);
    expect(parseBrowseQuery(new URLSearchParams('limit=1000')).ok).toBe(false);
    expect(parseBrowseQuery(new URLSearchParams('evil=1')).ok).toBe(false);
    expect(browseQuerySchema.parse({}).limit).toBe(25);
  });
});

describe('retention and holds', () => {
  const now = DEMO_ANCHOR;

  it('dry-runs policies with holds and keep-minimum applied', () => {
    const simulation = simulateRetention(catalog, DEFAULT_POLICIES, [hold()], now);
    expect(simulation.eligible.length).toBeGreaterThan(0);
    expect(simulation.protectedByHold.every((entry) => byId.get(entry.artifactId)!.campaignId === 'camp-auth-2026')).toBe(true);
    expect(simulation.eligible.some((entry) => byId.get(entry.artifactId)!.campaignId === 'camp-auth-2026')).toBe(false);
    expect(simulation.bytesReclaimable).toBe(simulation.eligible.reduce((sum, entry) => sum + entry.sizeBytes, 0));
    expect(simulateRetention(catalog, DEFAULT_POLICIES, [hold()], now)).toEqual(simulation);
    const disabled = DEFAULT_POLICIES.map((policy) => ({ ...policy, enabled: false }));
    expect(simulateRetention(catalog, disabled, [], now).eligible).toEqual([]);
  });

  it('treats released and expired holds as inactive', () => {
    const target = catalog.find((entry) => entry.campaignId === 'camp-auth-2026')!;
    expect(activeHoldsFor(target, [hold()], now)).toHaveLength(1);
    expect(activeHoldsFor(target, [hold({ releasedAt: '2026-02-01T00:00:00Z' })], now)).toHaveLength(0);
    expect(activeHoldsFor(target, [hold({ kind: 'compliance', expiresAt: new Date(now - 1).toISOString() })], now)).toHaveLength(0);
  });

  it('validates hold creation and release governance', () => {
    const input = { name: 'Case', kind: 'legal' as const, reason: 'Counsel requested', scope: { runId: 'run-1000' } };
    expect(createHold(input, 'a', now, 'h').ok).toBe(true);
    expect(createHold({ ...input, expiresAt: new Date(now + DAY).toISOString() }, 'a', now, 'h').ok).toBe(false);
    expect(createHold({ ...input, kind: 'compliance', expiresAt: new Date(now - DAY).toISOString() }, 'a', now, 'h').ok).toBe(false);
    const short = releaseHold(hold(), 'b', 'done', now);
    expect(short.ok).toBe(false);
    const released = releaseHold(hold(), 'b', 'Counsel confirmed the matter is closed.', now);
    expect(released.ok && released.value.releasedBy).toBe('b');
    if (released.ok) expect(releaseHold(released.value, 'b', 'again and again and again', now).ok).toBe(false);
  });

  it('requires a second approver and re-checks holds at decision time', () => {
    const target = catalog.find((entry) => entry.campaignId === 'camp-token-fuzz')!;
    const requested = requestDeletion([target.id, 'missing'], byId, [], { reason: 'cleanup', source: 'manual', actor: 'alice', now, id: 'd1' });
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;
    expect(requested.value.skipped).toEqual([{ id: 'missing', reason: 'not found' }]);
    const request = requested.value.request;
    expect(decideDeletion(request, 'approve', 'alice', '', byId, [], now).ok).toBe(false);
    const lateHold = hold({ scope: { artifactIds: [target.id] } });
    const blocked = decideDeletion(request, 'approve', 'bob', '', byId, [lateHold], now);
    expect(!blocked.ok && blocked.status).toBe(409);
    const approved = decideDeletion(request, 'approve', 'bob', 'ok', byId, [], now);
    expect(approved.ok && approved.value.status).toBe('approved');
    if (approved.ok) expect(decideDeletion(approved.value, 'reject', 'carol', '', byId, [], now).ok).toBe(false);
    expect(requestDeletion([target.id], byId, [lateHold], { reason: 'cleanup', source: 'manual', actor: 'a', now, id: 'd2' }).ok).toBe(false);
  });

  it('normalizes tags and guards CSV export', () => {
    expect(applyTags(artifact({ tags: ['a', 'b'] }), ['New Tag', 'a'], ['b']).tags).toEqual(['a', 'new-tag']);
    const csv = metadataCsv([artifact({ name: '=cmd()' })]);
    expect(csv.split('\n')[1]).toContain(`'=cmd()`);
  });
});

describe('lineage', () => {
  it('walks ancestors and descendants and attaches owning entities', () => {
    const reproducer = catalog.find((entry) => entry.type === 'reproducer' && entry.crashId)!;
    const graph = buildLineage(catalog, reproducer.id, 2)!;
    const kinds = new Set(graph.nodes.map((node) => node.kind));
    expect(kinds).toEqual(new Set(['artifact', 'run', 'campaign', 'crash', 'report']));
    const types = graph.nodes.filter((node) => node.kind === 'artifact').map((node) => node.artifactType);
    expect(types).toEqual(expect.arrayContaining(['corpus', 'bundle', 'reproducer', 'report', 'trace']));
    expect(graph.nodes.find((node) => node.root)!.column).toBe(0);
    const ids = new Set(graph.nodes.map((node) => node.id));
    expect(graph.edges.every((edge) => ids.has(edge.from) && ids.has(edge.to))).toBe(true);
    expect(buildLineage(catalog, 'nope')).toBeNull();
    const shallow = buildLineage(catalog, reproducer.id, 1)!;
    expect(shallow.nodes.filter((node) => node.kind === 'artifact').length).toBeLessThan(types.length);
  });
});

describe('backends and download links', () => {
  it('reports unconfigured object stores and degraded integrity', () => {
    const statuses = backendStatuses(catalog, {});
    expect(statuses.find((status) => status.backend === 'local')!.configured).toBe(true);
    expect(statuses.find((status) => status.backend === 's3')).toMatchObject({ configured: false, health: 'unavailable' });
    const minio = backendStatuses(catalog, {
      CRASHLAB_STORAGE_DRIVER: 's3',
      CRASHLAB_S3_ENDPOINT: 'http://minio:9000',
      CRASHLAB_S3_REGION: 'us-east-1',
      CRASHLAB_S3_BUCKET: 'b',
      CRASHLAB_S3_ACCESS_KEY_ID: 'id',
      CRASHLAB_S3_SECRET_ACCESS_KEY: 'secret',
    });
    expect(minio.find((status) => status.backend === 'minio')!.configured).toBe(true);
  });

  it('issues proxy links for local files and expiring presigned links for object stores', () => {
    const local = localArtifactToManaged({ id: 'a b.txt', name: 'a b.txt', createdAt: '2026-01-01T00:00:00Z', sizeBytes: 1 });
    expect(downloadLink(local)).toEqual({ href: '/api/artifacts/a%20b.txt', method: 'proxy', expiresAt: null });
    expect(downloadLink(artifact())).toBeNull();
    const env = {
      CRASHLAB_STORAGE_DRIVER: 's3',
      CRASHLAB_S3_ENDPOINT: 'https://s3.us-east-1.amazonaws.com',
      CRASHLAB_S3_REGION: 'us-east-1',
      CRASHLAB_S3_BUCKET: 'bucket',
      CRASHLAB_S3_ACCESS_KEY_ID: 'AKID',
      CRASHLAB_S3_SECRET_ACCESS_KEY: 'topsecret',
    };
    const link = downloadLink({ ...local, backend: 's3', key: 'c/r/x.json' }, new Date('2026-01-01T00:00:00Z'), env)!;
    expect(link.method).toBe('presigned');
    expect(link.href).toContain('X-Amz-Expires=300');
    expect(link.href).not.toContain('topsecret');
    expect(link.expiresAt).toBe('2026-01-01T00:05:00.000Z');
  });
});
