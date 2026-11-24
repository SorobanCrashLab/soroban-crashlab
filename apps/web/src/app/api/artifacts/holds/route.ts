import { NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse, successResponse } from '@/lib/api-response-utils';
import { readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import {
  createHold,
  holdCovers,
  holdCreateSchema,
  isHoldActive,
  releaseHold,
} from '@/features/artifacts/storage-manager/lib/governance';
import {
  authorizeArtifactRequest,
  getArtifactStore,
  newId,
  noStore,
} from '@/features/artifacts/storage-manager/lib/server';

export const dynamic = 'force-dynamic';

/** GET /api/artifacts/holds (#2342) — every hold with its coverage. */
export const GET = withRouteErrorHandling(
  'GET /api/artifacts/holds',
  async (request: NextRequest) => {
    const authorization = await authorizeArtifactRequest(request);
    if (!authorization.ok) return authorization.response;
    const store = getArtifactStore();
    const catalog = await store.catalog();
    const now = Date.now();
    const holds = store.holds.map((hold) => ({
      ...hold,
      active: isHoldActive(hold, now),
      coveredArtifacts: catalog.filter((artifact) => holdCovers(hold, artifact)).length,
    }));
    return noStore(successResponse({ viewer: authorization.viewer, holds }, { total: holds.length }));
  },
  'Unable to load holds.',
);

const actionSchema = z.discriminatedUnion('action', [
  holdCreateSchema.extend({ action: z.literal('create') }).strict(),
  z.object({ action: z.literal('release'), holdId: z.string().max(80), justification: z.string().max(1000) }).strict(),
]);

/**
 * POST /api/artifacts/holds (#2342) — create or release a hold. Maintainer
 * only; releasing a legal hold requires a written justification, and both
 * actions are audited.
 */
export const POST = withRouteErrorHandling(
  'POST /api/artifacts/holds',
  async (request: NextRequest) => {
    const authorization = await authorizeArtifactRequest(request);
    if (!authorization.ok) return authorization.response;
    const { viewer } = authorization;
    if (!viewer.permissions.manageHolds) return errorResponse('Managing holds requires the maintainer role.', 403);
    const read = await readJsonBody(request);
    if ('error' in read) return read.error;
    const parsed = actionSchema.safeParse(read.body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '), 422);
    const store = getArtifactStore();
    const now = Date.now();

    if (parsed.data.action === 'create') {
      const { action: _action, ...input } = parsed.data;
      const result = createHold(input, viewer.subject, now, newId('hold'));
      if (!result.ok) return errorResponse(result.error, result.status);
      store.holds = [result.value, ...store.holds];
      store.record(viewer.subject, 'hold.create', result.value.id, `${result.value.kind}: ${result.value.name}`, 'artifact.hold.create', {
        scope: result.value.scope,
      });
      return noStore(successResponse({ hold: result.value }));
    }

    const { holdId, justification } = parsed.data;
    const hold = store.holds.find((candidate) => candidate.id === holdId);
    if (!hold) return errorResponse('Hold not found', 404);
    const result = releaseHold(hold, viewer.subject, justification, now);
    if (!result.ok) return errorResponse(result.error, result.status);
    store.holds = store.holds.map((candidate) => (candidate.id === holdId ? result.value : candidate));
    store.record(viewer.subject, 'hold.release', holdId, justification, 'artifact.hold.release', { kind: hold.kind });
    return noStore(successResponse({ hold: result.value }));
  },
  'Unable to apply the hold action.',
);
