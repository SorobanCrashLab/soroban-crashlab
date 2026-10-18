import { NextRequest } from 'next/server';
import { errorResponse, successResponse } from '@/lib/api-response-utils';
import { codedErrorResponse } from '@/lib/error-codes';
import { getAuditLog } from '@/lib/audit/audit-sink';
import type { AuditAction } from '@/lib/audit/audit-log';
import { verifyAuditIntegrity } from '@/lib/audit/audit-checkpoint';
import { getAuditCheckpointKey, getAuditCheckpointStore, resolveAuditViewer } from '@/lib/audit/audit-access';
import { AuditCursorMismatchError, auditCursorScope, queryAuditEntries } from '@/lib/audit/audit-query';

/**
 * GET /api/audit (#1895, #1834)
 *
 * Query the audit log for the caller's org: `actor`, `action`, `target`,
 * `since`, `until`, keyset `cursor` and `limit`. The cursor is opaque,
 * versioned and bound to the org + filter set; replaying it against a
 * different filter is rejected with 400 CURSOR_MISMATCH. The response carries
 * the chain + checkpoint verification so the UI can show integrity in its header.
 */
export async function GET(request: NextRequest) {
  const viewer = await resolveAuditViewer(request);
  if (!viewer.ok) return errorResponse(viewer.message, viewer.status);

  const params = request.nextUrl.searchParams;
  const entries = getAuditLog().list();
  const query = {
    actor: params.get('actor') ?? undefined,
    action: (params.get('action') as AuditAction | null) ?? undefined,
    target: params.get('target') ?? undefined,
    since: params.get('since') ?? undefined,
    until: params.get('until') ?? undefined,
  };
  try {
    const page = queryAuditEntries(
      entries,
      viewer.orgId,
      query,
      {
        cursor: params.get('cursor'),
        limit: Number(params.get('limit') ?? 50) || 50,
        scope: auditCursorScope(viewer.orgId, query),
      },
    );
    return successResponse({
      orgId: viewer.orgId,
      ...page,
      integrity: verifyAuditIntegrity(entries, getAuditCheckpointStore().latest(), getAuditCheckpointKey()),
    });
  } catch (error) {
    if (error instanceof AuditCursorMismatchError) {
      return codedErrorResponse('CURSOR_MISMATCH');
    }
    return errorResponse('Invalid audit query.', 400);
  }
}
