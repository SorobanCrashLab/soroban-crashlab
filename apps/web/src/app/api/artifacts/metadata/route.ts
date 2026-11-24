import { NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse, successResponse } from '@/lib/api-response-utils';
import { readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import { selectArtifactRepository } from '@/lib/storage/artifact-repository';
import { activeHoldsFor, applyTags } from '@/features/artifacts/storage-manager/lib/governance';
import { accessDecision, assessIntegrity, safePreviewText } from '@/features/artifacts/storage-manager/lib/integrity';
import { projectArtifact } from '@/features/artifacts/storage-manager/lib/permissions';
import {
  authorizeArtifactRequest,
  downloadLink,
  getArtifactStore,
  noStore,
} from '@/features/artifacts/storage-manager/lib/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/artifacts/metadata?id=[&verify=1][&preview=1] (#2342)
 *
 * Full metadata, integrity assessment, access decision, covering holds and
 * pending deletion requests for one artifact. `verify=1` re-hashes stored
 * bytes; `preview=1` returns a redacted, size-capped text preview. Download
 * links are only issued when the access decision allows it, and expire.
 */
export const GET = withRouteErrorHandling(
  'GET /api/artifacts/metadata',
  async (request: NextRequest) => {
    const authorization = await authorizeArtifactRequest(request);
    if (!authorization.ok) return authorization.response;
    const { viewer } = authorization;
    const params = request.nextUrl.searchParams;
    const id = params.get('id');
    if (!id) return errorResponse('id is required', 400);

    const store = getArtifactStore();
    let artifact = await store.get(id);
    const projected = artifact ? projectArtifact(artifact, viewer.role) : null;
    if (!artifact || !projected) return errorResponse('Artifact not found', 404);

    if (params.get('verify') === '1' && viewer.permissions.download) {
      artifact = await store.verifyLocal(artifact);
    }
    const visible = projectArtifact(artifact, viewer.role)!;
    const integrity = assessIntegrity(artifact);
    const access = accessDecision(artifact, viewer.role);
    const now = Date.now();

    let preview: { mode: string; text: string; truncated: boolean } | null = null;
    if (params.get('preview') === '1' && access.canPreview && (access.previewMode === 'text' || access.previewMode === 'json')) {
      const stored = artifact.backend === 'local' ? await selectArtifactRepository().get(artifact.key) : null;
      if (stored) {
        const { text, truncated } = safePreviewText(stored.buffer.toString('utf8'));
        preview = { mode: access.previewMode, text, truncated };
      }
    }

    return noStore(
      successResponse({
        viewer,
        artifact: visible,
        integrity,
        access,
        download: access.canDownload ? downloadLink(artifact) : null,
        holds: activeHoldsFor(artifact, store.holds, now).map(({ id: holdId, name, kind }) => ({ id: holdId, name, kind })),
        deletionRequests: store.deletions.filter((entry) => entry.artifactIds.includes(artifact!.id)),
        preview,
      }),
    );
  },
  'Unable to load artifact metadata.',
);

const bulkSchema = z
  .object({
    action: z.literal('tag'),
    ids: z.array(z.string().max(120)).min(1).max(200),
    add: z.array(z.string().max(40)).max(10).default([]),
    remove: z.array(z.string().max(40)).max(10).default([]),
  })
  .strict();

/**
 * POST /api/artifacts/metadata (#2342) — bulk tag. Restricted artifacts are
 * skipped for non-maintainers; every change is audited.
 */
export const POST = withRouteErrorHandling(
  'POST /api/artifacts/metadata',
  async (request: NextRequest) => {
    const authorization = await authorizeArtifactRequest(request);
    if (!authorization.ok) return authorization.response;
    const { viewer } = authorization;
    if (!viewer.permissions.tag) return errorResponse('Tagging requires the analyst role.', 403);
    const read = await readJsonBody(request);
    if ('error' in read) return read.error;
    const parsed = bulkSchema.safeParse(read.body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((issue) => issue.message).join('; '), 422);
    if (parsed.data.add.length === 0 && parsed.data.remove.length === 0) return errorResponse('Nothing to change.', 422);

    const store = getArtifactStore();
    const catalog = new Map((await store.catalog()).map((artifact) => [artifact.id, artifact]));
    const updated: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    for (const id of new Set(parsed.data.ids)) {
      const artifact = catalog.get(id);
      if (!artifact) skipped.push({ id, reason: 'not found' });
      else if (artifact.sensitivity === 'restricted' && !viewer.permissions.viewRestricted) skipped.push({ id, reason: 'restricted' });
      else {
        store.update(applyTags(artifact, parsed.data.add, parsed.data.remove));
        updated.push(id);
      }
    }
    if (updated.length > 0) {
      store.record(
        viewer.subject,
        'bulk.tag',
        updated.length === 1 ? updated[0] : `${updated.length} artifacts`,
        `+[${parsed.data.add.join(', ')}] -[${parsed.data.remove.join(', ')}]`,
        'artifact.tag',
        { ids: updated, add: parsed.data.add, remove: parsed.data.remove },
      );
    }
    return noStore(successResponse({ updated, skipped }, { total: updated.length }));
  },
  'Unable to update artifact metadata.',
);
