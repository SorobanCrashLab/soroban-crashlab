import { NextRequest } from 'next/server';
import { errorResponse, successResponse } from '@/lib/api-response-utils';
import { getAuditLog } from '@/lib/audit/audit-sink';
import { createCheckpoint } from '@/lib/audit/audit-checkpoint';
import { getAuditCheckpointKey, getAuditCheckpointStore, resolveAuditViewer } from '@/lib/audit/audit-access';

/**
 * POST /api/audit/checkpoint (#1895)
 *
 * Signs the current chain head and stores it apart from the log. Run
 * periodically (cron) so verification can detect rewrites and truncation.
 */
export async function POST(request: NextRequest) {
  const viewer = await resolveAuditViewer(request);
  if (!viewer.ok) return errorResponse(viewer.message, viewer.status);

  const key = getAuditCheckpointKey();
  if (!key) return errorResponse('CRASHLAB_AUDIT_CHECKPOINT_KEY is not configured.', 503);

  const checkpoint = createCheckpoint(getAuditLog().list(), key);
  if (!checkpoint) return successResponse({ checkpoint: null });
  getAuditCheckpointStore().save(checkpoint);
  return successResponse({ checkpoint: { sequence: checkpoint.sequence, headHash: checkpoint.headHash, signedAt: checkpoint.signedAt } });
}
