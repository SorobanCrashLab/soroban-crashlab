/**
 * JWT -> Yjs permissions mapping (#2192).
 *
 * Maps RBAC roles to Yjs document permissions. Only triage:write role
 * users can edit; others get read-only access.
 */

import type { UserRole } from '@/lib/storage/role-store';

export interface YjsPermissions {
  read: boolean;
  write: boolean;
}

export function mapRbacToYjsPermissions(role: UserRole): YjsPermissions {
  if (role === 'maintainer') {
    return { read: true, write: true };
  }
  if (role === 'analyst') {
    return { read: true, write: true };
  }
  return { read: true, write: false };
}

export interface TriageSession {
  authenticated: boolean;
  permissions: YjsPermissions;
  principal?: string;
}

export async function validateTriageSession(request: Request): Promise<TriageSession> {
  // In production, this would call resolvePrincipal(request) from @/lib/rbac.
  // For the mock, we check for session cookies or tokens.
  const cookieHeader = request.headers.get('cookie') ?? '';
  const hasSession = cookieHeader.includes('crashlab-session') || cookieHeader.includes('github-session');

  if (hasSession) {
    return {
      authenticated: true,
      permissions: { read: true, write: true },
      principal: 'github:session-user',
    };
  }

  // Unauthenticated users get read-only access.
  return {
    authenticated: false,
    permissions: { read: true, write: false },
  };
}
