/**
 * Who may read the audit log, and which org's slice they see (#1895).
 *
 * Reading audit history is a maintainer action. The org comes from the
 * caller's memberships — the `x-crashlab-org` header can choose between orgs
 * the caller belongs to, never reach one it does not. Denials are audited.
 */

import type { NextRequest } from 'next/server';
import { requestedTenantFromHeaders } from '../api-scope-enforcer';
import { describePrincipal } from '../rbac';
import { loadMembershipDirectory } from '../tenancy/membership-runtime';
import { auditTenantDenial } from '../tenancy/tenant-scope';
import { createInMemoryCheckpointStore, type CheckpointStore } from './audit-checkpoint';
import { recordAuditEvent } from './audit-sink';

export type AuditViewer = { ok: true; orgId: string; subject: string } | { ok: false; status: 401 | 403; message: string };

export async function resolveAuditViewer(request: NextRequest): Promise<AuditViewer> {
  const { principal, role, satisfies } = await describePrincipal(request);
  if (!principal.authenticated) return { ok: false, status: 401, message: 'Authentication required.' };
  if (!satisfies('maintainer')) return { ok: false, status: 403, message: 'Audit log access requires the maintainer role.' };

  const directory = loadMembershipDirectory(principal, role);
  const orgs = [...new Set(directory.membershipsFor(principal.subject).map((m) => m.orgId))];
  const requested = requestedTenantFromHeaders(request.headers).orgId;

  const orgId = requested ? orgs.find((org) => org === requested) : orgs.length === 1 ? orgs[0] : undefined;
  if (!orgId) {
    auditTenantDenial(recordAuditEvent, principal.subject, `audit:${requested ?? '?'}`, requested ? 'not_a_member' : 'ambiguous_org');
    return { ok: false, status: 403, message: 'Access to this organisation is denied.' };
  }
  return { ok: true, orgId, subject: principal.subject };
}

export function getAuditCheckpointKey(): string | undefined {
  return process.env.CRASHLAB_AUDIT_CHECKPOINT_KEY?.trim() || undefined;
}

const globalForCheckpoints = globalThis as unknown as { crashlabAuditCheckpoints?: CheckpointStore };

/** Kept apart from the audit store, so a write to one cannot cover tracks in the other. */
export function getAuditCheckpointStore(): CheckpointStore {
  globalForCheckpoints.crashlabAuditCheckpoints ??= createInMemoryCheckpointStore();
  return globalForCheckpoints.crashlabAuditCheckpoints;
}
