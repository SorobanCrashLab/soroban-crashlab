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
  return new NextRequest(`http://localhost/api/ci/gates${query}`);
}

const principalAs = (role: 'anonymous' | 'analyst' | 'maintainer', authenticated = true) => ({
  principal: {
    identityType: 'github' as const,
    identityValue: 'tester',
    subject: 'github:tester',
    authenticated,
  },
  role,
  satisfies: () => true,
});

describe('GET /api/ci/gates', () => {
  beforeEach(() => {
    vi.mocked(checkRbacPermission).mockResolvedValue(null);
    vi.mocked(describePrincipal).mockResolvedValue(principalAs('maintainer'));
  });

  it('evaluates all eight gates and returns correlations with evidence', async () => {
    const response = await GET(request('?view=pr&pr=2314'));
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      total: number;
      data: {
        evaluation: {
          cards: Array<{ kind: string; status: string; links: Array<{ label: string }> }>;
          blockers: Array<{ kind: string }>;
        };
        correlations: Array<{ id: string; confidence: number; evidence: string[] }>;
        generatedAt: string;
      };
    };

    expect(body.total).toBe(8);
    expect(body.data.evaluation.cards).toHaveLength(8);
    expect(body.data.evaluation.blockers.some((card) => card.kind === 'e2e')).toBe(true);
    expect(body.data.correlations.length).toBeGreaterThan(0);
    expect(body.data.correlations[0].evidence.length).toBeGreaterThan(0);
    expect(body.data.generatedAt).toBe('2026-11-23T09:00:00.000Z');
    expect(response.headers.get('Cache-Control')).toContain('stale-while-revalidate=300');
  });

  it('uses rerun history to find flakes', async () => {
    const response = await GET(request('?view=flakes'));
    const body = (await response.json()) as {
      data: { flakes: Array<{ name: string; score: number; isFlaky: boolean }> };
    };

    expect(body.data.flakes.length).toBeGreaterThan(0);
    expect(body.data.flakes[0].isFlaky).toBe(true);
    expect(body.data.flakes[0].name).toContain('checkout.spec');
  });

  it('removes gate links for anonymous viewers', async () => {
    vi.mocked(describePrincipal).mockResolvedValueOnce(principalAs('anonymous', false));
    const response = await GET(request('?view=pr'));
    const body = (await response.json()) as {
      data: {
        role: string;
        permissions: { canViewLogs: boolean; canViewInternal: boolean };
      };
    };

    expect(body.data.role).toBe('anonymous');
    expect(body.data.permissions.canViewLogs).toBe(false);
    expect(body.data.permissions.canViewInternal).toBe(false);
  });

  it('handles conditional requests', async () => {
    const first = await GET(request('?view=branch&branch=main'));
    const etag = first.headers.get('ETag');
    expect(etag).toBeTruthy();

    const second = await GET(
      new NextRequest('http://localhost/api/ci/gates?view=branch&branch=main', {
        headers: { 'if-none-match': etag ?? '' },
      }),
    );
    expect(second.status).toBe(304);
  });

  it('rejects an unknown gate name', async () => {
    const response = await GET(request('?gate=not-a-gate'));
    expect(response.status).toBe(422);
  });

  it('propagates an RBAC denial', async () => {
    vi.mocked(checkRbacPermission).mockResolvedValueOnce(new NextResponse(null, { status: 403 }));
    const response = await GET(request());
    expect(response.status).toBe(403);
  });
});
