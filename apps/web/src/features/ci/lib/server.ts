/**
 * Server-only helpers for the CI API routes (#2314).
 *
 * Authorization runs through the existing RBAC helpers; the resolved role only
 * narrows the payload (see `filterSnapshotForPermissions`). Tokens used by the
 * GitHub adapter stay in server environment variables and never enter a
 * response, cache key or log line.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { successResponse } from '@/lib/api-response-utils';
import { computeETag } from '@/lib/fixture-caching';
import { checkRbacPermission, describePrincipal } from '@/lib/rbac';
import { ciCacheControl } from './freshness';
import type { CiRole, CiPermissions } from './permissions';
import { permissionsForRole } from './permissions';
import { deterministicMockProvider } from './mock-provider';
import { createGitHubActionsAdapter, createGitHubRestClient } from './github-adapter';
import type { CiProvider } from './provider';

export interface CiRequestContext {
  role: CiRole;
  subject: string;
  permissions: CiPermissions;
}

export type CiAuthorization =
  | { ok: true; context: CiRequestContext }
  | { ok: false; response: NextResponse };

export async function authorizeCiRequest(request: NextRequest): Promise<CiAuthorization> {
  // GET is not role-gated by the catalog, but the central check is still the
  // single source of truth if that policy changes.
  const denial = await checkRbacPermission(request);
  if (denial) return { ok: false, response: denial };

  const { principal, role } = await describePrincipal(request);
  const ciRole: CiRole = !principal.authenticated
    ? 'anonymous'
    : role === 'maintainer'
      ? 'maintainer'
      : 'analyst';
  return {
    ok: true,
    context: {
      role: ciRole,
      subject: principal.subject,
      permissions: permissionsForRole(ciRole),
    },
  };
}

/** Deterministic default; the GitHub adapter is opt-in and server-side only. */
export function getCiProvider(): CiProvider {
  if (process.env.CRASHLAB_CI_PROVIDER !== 'github') return deterministicMockProvider;
  const token = process.env.CRASHLAB_CI_GITHUB_TOKEN;
  const [owner, repo] = (
    process.env.CRASHLAB_CI_REPOSITORY ?? 'SorobanCrashLab/soroban-crashlab'
  ).split('/');
  const client = createGitHubRestClient({
    owner: owner || 'SorobanCrashLab',
    repo: repo || 'soroban-crashlab',
    ...(token ? { token } : {}),
  });
  return createGitHubActionsAdapter(client, `${owner}/${repo}`);
}

/** Success envelope with ETag and stale-while-revalidate headers. */
export function ciSuccess(request: NextRequest, data: unknown, total?: number): NextResponse {
  const fingerprint = JSON.stringify({ data, total });
  const etag = computeETag(fingerprint);
  const cacheControl = ciCacheControl();
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { 'Cache-Control': cacheControl, ETag: etag },
    });
  }
  const response = successResponse(data, { total });
  response.headers.set('Cache-Control', cacheControl);
  response.headers.set('ETag', etag);
  return response;
}
