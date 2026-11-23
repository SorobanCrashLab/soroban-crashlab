import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkRbacPermission, describePrincipal } from '@/lib/rbac';
import { GET } from './route';

vi.mock('@/lib/rbac', () => ({
  checkRbacPermission: vi.fn(async () => null),
  describePrincipal: vi.fn(async () => ({
    principal: {
      identityType: 'github',
      identityValue: 'tester',
      subject: 'github:tester',
      authenticated: true,
    },
    role: 'maintainer',
    satisfies: () => true,
  })),
}));

function request(query = '') {
  return new NextRequest(`http://localhost/api/ci/runs${query}`);
}

const principalAs = (role: 'analyst' | 'maintainer') => ({
  principal: {
    identityType: 'github' as const,
    identityValue: 'tester',
    subject: 'github:tester',
    authenticated: true,
  },
  role,
  satisfies: () => true,
});

describe('GET /api/ci/runs', () => {
  beforeEach(() => {
    vi.mocked(checkRbacPermission).mockResolvedValue(null);
    vi.mocked(describePrincipal).mockResolvedValue(principalAs('maintainer'));
  });

  it('returns the standard envelope, permission metadata and cache headers', async () => {
    const response = await GET(request('?view=pr&pr=2314'));
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      data: {
        runs: Array<{ id: string; permissions: unknown; jobs: Array<{ artifacts: Array<{ id: string }> }> }>;
        permissions: { canViewInternal: boolean };
        query: { view: string; pr?: number };
      };
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.data.runs).toHaveLength(1);
    expect(body.data.runs[0].id).toBe('gh-run-9001');
    expect(body.data.query).toMatchObject({ view: 'pr', pr: 2314 });
    expect(body.data.permissions.canViewInternal).toBe(true);
    expect(body.data.runs[0].jobs.flatMap((job) => job.artifacts).map((item) => item.id)).toContain(
      'art-trace-1',
    );
    expect(response.headers.get('Cache-Control')).toBe(
      'private, max-age=30, stale-while-revalidate=300',
    );
    expect(response.headers.get('ETag')).toMatch(/^"[\da-f]{64}"$/);
  });

  it('returns 304 for an unchanged ETag', async () => {
    const first = await GET(request('?view=pr'));
    const etag = first.headers.get('ETag');
    expect(etag).toBeTruthy();

    const second = await GET(
      new NextRequest('http://localhost/api/ci/runs?view=pr', {
        headers: { 'if-none-match': etag ?? '' },
      }),
    );
    expect(second.status).toBe(304);
    expect(second.headers.get('ETag')).toBe(etag);
  });

  it('rejects malformed queries with the error envelope', async () => {
    const response = await GET(request('?limit=0'));
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('Invalid CI query');
  });

  it('strips internal artifacts for analysts', async () => {
    vi.mocked(describePrincipal).mockResolvedValueOnce(principalAs('analyst'));
    const response = await GET(request('?view=pr&pr=2314'));
    const body = (await response.json()) as {
      data: {
        permissions: { canViewInternal: boolean };
        runs: Array<{ jobs: Array<{ artifacts: Array<{ id: string }> }> }>;
      };
    };

    expect(body.data.permissions.canViewInternal).toBe(false);
    const artifactIds = body.data.runs[0].jobs.flatMap((job) => job.artifacts).map((item) => item.id);
    expect(artifactIds).not.toContain('art-trace-1');
    expect(artifactIds).toContain('art-junit-1');
  });

  it('propagates an RBAC denial', async () => {
    vi.mocked(checkRbacPermission).mockResolvedValueOnce(new NextResponse(null, { status: 403 }));
    const response = await GET(request());
    expect(response.status).toBe(403);
  });
});
