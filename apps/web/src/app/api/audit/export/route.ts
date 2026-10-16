import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-response-utils';
import { getAuditLog } from '@/lib/audit/audit-sink';
import type { AuditAction } from '@/lib/audit/audit-log';
import { resolveAuditViewer } from '@/lib/audit/audit-access';
import { exportAuditEntries } from '@/lib/audit/audit-query';

/**
 * GET /api/audit/export?format=csv|json (#1895)
 *
 * Compliance export of the caller's org only, with the same filters as the
 * query endpoint. Entry hashes are included so the export can be re-verified.
 */
export async function GET(request: NextRequest) {
  const viewer = await resolveAuditViewer(request);
  if (!viewer.ok) return errorResponse(viewer.message, viewer.status);

  const params = request.nextUrl.searchParams;
  const format = params.get('format') === 'json' ? 'json' : 'csv';
  const file = exportAuditEntries(getAuditLog().list(), viewer.orgId, format, {
    actor: params.get('actor') ?? undefined,
    action: (params.get('action') as AuditAction | null) ?? undefined,
    target: params.get('target') ?? undefined,
    since: params.get('since') ?? undefined,
    until: params.get('until') ?? undefined,
  });

  return new NextResponse(file.body, {
    headers: {
      'Content-Type': `${file.contentType}; charset=utf-8`,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
