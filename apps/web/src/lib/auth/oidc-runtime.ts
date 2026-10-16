/**
 * Process-wide OIDC client (#1893): env config, the shared audit sink and the
 * persisted role store. Kept apart from oidc.ts so tests build their own
 * client against a stub IdP.
 */

import { recordAuditEvent } from '../audit/audit-sink';
import { assignRole, getRoleAssignment } from '../storage/role-store';
import { loadOidcConfig, OidcClient, SYSTEM_GRANTOR } from './oidc';

const globalForOidc = globalThis as unknown as { crashlabOidcClient?: OidcClient };

/** Throws when OIDC is not configured; routes turn that into a 503. */
export function getOidcClient(): OidcClient {
  globalForOidc.crashlabOidcClient ??= new OidcClient({
    config: loadOidcConfig(),
    audit: recordAuditEvent,
    grantRole: async (identity, role) => {
      const previous = await getRoleAssignment('oidc', identity);
      if (previous?.role !== role) {
        await assignRole({ identityType: 'oidc', identityValue: identity, role, performedBy: SYSTEM_GRANTOR });
      }
      return previous?.role;
    },
  });
  return globalForOidc.crashlabOidcClient;
}
