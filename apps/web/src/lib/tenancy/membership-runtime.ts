/**
 * Process membership directory (#1894).
 *
 * `CRASHLAB_TENANCY_MEMBERSHIPS` holds a JSON array of memberships. Unset
 * means single-tenant mode: every *authenticated* principal is a member of the
 * default org (where the backfill puts existing data) with its RBAC role.
 * Anonymous principals are never members of anything.
 */

import { z } from 'zod';
import type { UserRole } from '../storage/role-store';
import { DEFAULT_ORG_ID, ORG_ID_PATTERN, PROJECT_ID_PATTERN } from './storage-keys';
import { createInMemoryMembershipDirectory, type Membership, type MembershipDirectory } from './tenant-scope';

const MembershipsSchema = z.array(
  z
    .object({
      principal: z.string().min(1),
      orgId: z.string().regex(ORG_ID_PATTERN),
      projects: z.union([z.literal('*'), z.array(z.string().regex(PROJECT_ID_PATTERN))]),
      role: z.enum(['analyst', 'maintainer']),
    })
    .strict(),
);

export function loadMembershipDirectory(
  principal: { subject: string; authenticated: boolean },
  role: UserRole,
  raw = process.env.CRASHLAB_TENANCY_MEMBERSHIPS,
): MembershipDirectory {
  if (raw?.trim()) return createInMemoryMembershipDirectory(MembershipsSchema.parse(JSON.parse(raw)) as Membership[]);
  if (!principal.authenticated) return createInMemoryMembershipDirectory([]);
  return createInMemoryMembershipDirectory([{ principal: principal.subject, orgId: DEFAULT_ORG_ID, projects: '*', role }]);
}
