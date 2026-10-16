/**
 * OIDC claims → local role (#1893). Policy: docs/adr/0009-oidc-role-mapping.md.
 *
 * Mapping is explicit. There is no default role: an identity whose claims
 * match no rule is denied, never silently provisioned — least of all as a
 * maintainer. When several rules match, the highest role wins.
 */

import { z } from 'zod';
import type { UserRole } from '../storage/role-store';
import type { IdTokenClaims } from './oidc-token';

export const RoleMappingSchema = z
  .object({
    /** Claim holding a string or string[] (e.g. `groups`, `roles`). */
    claim: z.string().min(1),
    rules: z
      .array(z.object({ value: z.string().min(1), role: z.enum(['analyst', 'maintainer']) }))
      .min(1),
    requireVerifiedEmail: z.boolean().default(false),
  })
  .strict();

export type RoleMapping = z.infer<typeof RoleMappingSchema>;

export type RoleMappingResult =
  | { allowed: true; role: UserRole; matched: string[] }
  | { allowed: false; reason: string };

const RANK: Record<UserRole, number> = { analyst: 1, maintainer: 2 };

/** Parses `OIDC_ROLE_MAPPING`. Unknown keys (e.g. a `default`) are rejected. */
export function parseRoleMapping(raw: string | undefined): RoleMapping {
  if (!raw) throw new Error('OIDC_ROLE_MAPPING is not configured');
  return RoleMappingSchema.parse(JSON.parse(raw));
}

export function mapClaimsToRole(claims: IdTokenClaims, mapping: RoleMapping): RoleMappingResult {
  if (mapping.requireVerifiedEmail && claims.email_verified !== true) {
    return { allowed: false, reason: 'email is not verified' };
  }

  const raw = claims[mapping.claim];
  const values = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : typeof raw === 'string' ? [raw] : [];

  const matched = mapping.rules.filter((rule) => values.includes(rule.value));
  if (matched.length === 0) return { allowed: false, reason: `no mapping rule matches claim "${mapping.claim}"` };

  const role = matched.reduce<UserRole>((best, rule) => (RANK[rule.role] > RANK[best] ? rule.role : best), 'analyst');
  return { allowed: true, role, matched: matched.map((rule) => rule.value) };
}
