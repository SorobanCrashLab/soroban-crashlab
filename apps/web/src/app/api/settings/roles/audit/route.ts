import { NextRequest, NextResponse } from 'next/server';
import { checkRbacPermission } from '../../../../../lib/rbac';
import { listAuditLogs } from '../../../../../lib/storage/role-store';

export async function GET(request: NextRequest) {
  const rbacError = await checkRbacPermission(request);
  if (rbacError) return rbacError;

  const logs = await listAuditLogs(100);

  return NextResponse.json({
    logs,
  });
}
