import { NextRequest } from 'next/server';
import { errorResponse, successResponse } from '@/lib/api-response-utils';
import { getAuditLog } from '@/lib/audit/audit-sink';
import type { AuditAction } from '@/lib/audit/audit-log';
import { verifyAuditIntegrity } from '@/lib/audit/audit-checkpoint';
import { getAuditCheckpointKey, getAuditCheckpointStore, resolveAuditViewer } from '@/lib/audit/audit-access';
import { queryAuditEntries } from '@/lib/audit/audit-query';

/**
 * GET /api/audit (#1895)
 *
 * Query the audit log for the caller's org: `actor`, `action`, `target`,
 * `since`, `until`, keyset `cursor` and `limit`. The response carries the
 * chain + checkpoint verification so the UI can show integrity in its header.
 */
export async function GET(request: NextRequest) {
  const viewer = await resolveAuditViewer(request);
  if (!viewer.ok) return errorResponse(viewer.message, viewer.status);

  const params = request.nextUrl.searchParams;
  const entries = getAuditLog().list();
  try {
    const page = queryAuditEntries(
      entries,
      viewer.orgId,
      {
        actor: params.get('actor') ?? undefined,
        action: (params.get('action') as AuditAction | null) ?? undefined,
        target: params.get('target') ?? undefined,
        since: params.get('since') ?? undefined,
        until: params.get('until') ?? undefined,
      },
      { cursor: params.get('cursor'), limit: Number(params.get('limit') ?? 50) || 50 },
    );
    return successResponse({
      orgId: viewer.orgId,
      ...page,
      integrity: verifyAuditIntegrity(entries, getAuditCheckpointStore().latest(), getAuditCheckpointKey()),
    });
  } catch {
    return errorResponse('Invalid audit query.', 400);
  }
}
