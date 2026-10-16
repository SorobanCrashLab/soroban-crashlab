/**
 * Org → project tenancy (#1894). Policy and threat analysis:
 * docs/adr/0010-org-project-tenancy.md.
 *
 * A `TenantScope` is the only key that opens tenant data. It is branded, so
 * the type system rejects a hand-built `{ orgId, projectId }`; the one way to
 * obtain one is `resolveTenantScope`, which checks the principal's membership
 * and audits every denial. Repository and storage helpers take the scope as a
 * required first parameter — there is no unscoped overload to forget about.
 */

import { randomBytes } from 'node:crypto';
import type { AuditEntryInput } from '../audit/audit-log';
import { recordAuditEvent } from '../audit/audit-sink';
import type { UserRole } from '../storage/role-store';
import { joinTenantKey, tenantKeyPrefix } from './storage-keys';

declare const tenantScopeBrand: unique symbol;

export interface TenantScope {
  readonly orgId: string;
  readonly projectId: string;
  /** Who the scope was resolved for — carried into deny audits downstream. */
  readonly principal: string;
  readonly role: UserRole;
  readonly [tenantScopeBrand]: true;
}

export interface Membership {
  principal: string;
  orgId: string;
  /** Projects in the org this membership reaches; `*` is every project. */
  projects: readonly string[] | '*';
  role: UserRole;
}

export interface MembershipDirectory {
  membershipsFor(principal: string): readonly Membership[];
}

export function createInMemoryMembershipDirectory(memberships: readonly Membership[]): MembershipDirectory {
  return { membershipsFor: (principal) => memberships.filter((m) => m.principal === principal) };
}

export class TenantAccessDeniedError extends Error {
  readonly status = 403;
  constructor(message = 'Access to this project is denied.') {
    super(message);
    this.name = 'TenantAccessDeniedError';
  }
}

export type TenantAuditSink = (input: AuditEntryInput) => void;

export function auditTenantDenial(
  sink: TenantAuditSink,
  principal: string,
  target: string,
  reason: string,
  metadata: Record<string, unknown> = {},
): void {
  sink({ action: 'tenant.access.denied', actor: principal, target, metadata: { reason, ...metadata } });
}

/**
 * Resolves the ambient scope for a request. The requested org/project come
 * from the caller (session claims, token claims or headers) and are only a
 * request: authority comes from the directory. Without a request, a principal
 * with exactly one reachable project gets it; anything ambiguous is denied.
 */
export function resolveTenantScope(
  principal: string,
  directory: MembershipDirectory,
  requested: { orgId?: string | null; projectId?: string | null } = {},
  audit: TenantAuditSink = recordAuditEvent,
): TenantScope {
  const memberships = directory.membershipsFor(principal);
  const target = `org/${requested.orgId ?? '?'}/project/${requested.projectId ?? '?'}`;

  const candidates = memberships.filter((m) => !requested.orgId || m.orgId === requested.orgId);
  let match: { membership: Membership; projectId: string } | undefined;

  if (requested.projectId) {
    const membership = candidates.find((m) => m.projects === '*' || m.projects.includes(requested.projectId!));
    if (membership) match = { membership, projectId: requested.projectId };
  } else {
    const reachable = candidates.flatMap((m) => (m.projects === '*' ? [] : m.projects.map((p) => ({ membership: m, projectId: p }))));
    if (reachable.length === 1 && candidates.every((m) => m.projects !== '*')) match = reachable[0];
  }

  if (!match) {
    auditTenantDenial(audit, principal, target, memberships.length === 0 ? 'no_membership' : 'not_a_member');
    throw new TenantAccessDeniedError();
  }

  // Validates both ids (throws on a malformed one) before the scope exists.
  tenantKeyPrefix(match.membership.orgId, match.projectId);
  return {
    orgId: match.membership.orgId,
    projectId: match.projectId,
    principal,
    role: match.membership.role,
  } as TenantScope;
}

/**
 * Trusted construction for system jobs (backfill, schedulers) that act for a
 * tenant without a principal. Call sites are few and grep-able by name.
 */
export function systemTenantScope(orgId: string, projectId: string): TenantScope {
  tenantKeyPrefix(orgId, projectId);
  return { orgId, projectId, principal: 'system', role: 'maintainer' } as TenantScope;
}

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** 128 random bits, base32 — not sequential, not guessable across tenants. */
export function newTenantId(prefix: string): string {
  if (!/^[a-z]{2,8}$/.test(prefix)) throw new Error(`invalid id prefix ${prefix}`);
  const bytes = randomBytes(16);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return `${prefix}_${out}`;
}

export function scopePrefix(scope: TenantScope): string {
  return tenantKeyPrefix(scope.orgId, scope.projectId);
}

/** Storage (KV / MinIO / S3) key for a tenant-owned object. */
export function scopedStorageKey(scope: TenantScope, relativeKey: string): string {
  return joinTenantKey(scopePrefix(scope), relativeKey);
}

/** Cache keys share the storage prefix so one tenant's cache can never answer another's lookup. */
export function scopedCacheKey(scope: TenantScope, relativeKey: string): string {
  return `cache/${scopedStorageKey(scope, relativeKey)}`;
}

export function isKeyInScope(scope: TenantScope, key: string): boolean {
  return key.startsWith(scopePrefix(scope)) || key.startsWith(`cache/${scopePrefix(scope)}`);
}
