import { NextRequest, NextResponse } from 'next/server';
import { describePrincipal, isGitHubSessionEnabled } from '../../../../../lib/rbac';
import { countMaintainers } from '../../../../../lib/storage/role-store';

/**
 * GET /api/settings/roles/me
 *
 * Reports the caller's resolved identity and effective role, read through the
 * same lookup the server authorizes with. The role shown here is not anything
 * the client supplied: it is whatever the store holds for the credential this
 * request presented, which is the point of showing it on the settings page.
 */
export async function GET(request: NextRequest) {
  const { principal, role, satisfies } = await describePrincipal(request);

  return NextResponse.json({
    principal: {
      identityType: principal.identityType,
      identityValue: principal.identityValue,
      subject: principal.subject,
      authenticated: principal.authenticated,
    },
    role,
    capabilities: {
      canAnnotate: satisfies('analyst'),
      canAdminister: satisfies('maintainer'),
    },
    maintainerCount: await countMaintainers(),
    gitHubSessionsEnabled: isGitHubSessionEnabled(),
  });
}
