import { NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse, successResponse } from '@/lib/api-response-utils';
import { readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import { selectArtifactRepository } from '@/lib/storage/artifact-repository';
import {
  decideDeletion,
  policyUpdateSchema,
  requestDeletion,
  simulateRetention,
} from '@/features/artifacts/storage-manager/lib/governance';
import {
  authorizeArtifactRequest,
  getArtifactStore,
  newId,
  noStore,
} from '@/features/artifacts/storage-manager/lib/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/artifacts/retention (#2342)
 *
 * Policies per artifact class, a dry-run simulation against the full
 * catalog (holds and keep-minimum applied), and the deletion queue. The
 * simulation always uses the unprojected catalog so counts are correct, but
 * names of restricted artifacts are masked for non-maintainers.
 */
export const GET = withRouteErrorHandling(
  'GET /api/artifacts/retention',
  async (request: NextRequest) => {
    const authorization = await authorizeArtifactRequest(request);
    if (!authorization.ok) return authorization.response;
    const { viewer } = authorization;
    const store = getArtifactStore();
    const catalog = await store.catalog();
    const simulation = simulateRetention(catalog, store.policies, store.holds, Date.now());
    if (!viewer.permissions.viewRestricted) {
      const restricted = new Set(catalog.filter((artifact) => artifact.sensitivity === 'restricted').map((artifact) => artifact.id));
      const mask = <T extends { artifactId: string; name: string }>(entry: T): T =>
        restricted.has(entry.artifactId) ? { ...entry, name: 'Restricted artifact' } : entry;
      simulation.eligible = simulation.eligible.map(mask);
      simulation.protectedByHold = simulation.protectedByHold.map(mask);
      simulation.keptByMinimum = simulation.keptByMinimum.map(mask);
    }
    return noStore(
      successResponse({
        viewer,
        policies: store.policies,
        simulation,
        deletions: store.deletions,
        audit: viewer.permissions.managePolicies ? store.audit.slice(0, 50) : [],
      }),
    );
  },
  'Unable to load retention state.',
);

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('update-policy'), policy: policyUpdateSchema }).strict(),
  z
    .object({
      action: z.literal('request-deletion'),
      artifactIds: z.array(z.string().max(120)).min(1).max(500),
      reason: z.string().max(500),
      source: z.enum(['retention', 'manual']).default('manual'),
    })
    .strict(),
  z
    .object({
      action: z.literal('decide'),
      requestId: z.string().max(80),
      decision: z.enum(['approve', 'reject']),
      note: z.string().max(500).default(''),
    })
    .strict(),
  z.object({ action: z.literal('execute'), requestId: z.string().max(80) }).strict(),
]);

/**
 * POST /api/artifacts/retention (#2342)
 *
 * - `update-policy` (maintainer)
 * - `request-deletion` (analyst) — artifacts under hold are skipped
 * - `decide` (maintainer, not the requester) — holds re-checked
 * - `execute` (maintainer) — only approved requests; real files are deleted
 *   through the artifact repository, demo entries are removed from the catalog
 */
export const POST = withRouteErrorHandling(
  'POST /api/artifacts/retention',
  async (request: NextRequest) => {
    const authorization = await authorizeArtifactRequest(request);
    if (!authorization.ok) return authorization.response;
    const { viewer } = authorization;
    const read = await readJsonBody(request);
    if ('error' in read) return read.error;
    const parsed = actionSchema.safeParse(read.body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '), 422);
    const body = parsed.data;
    const store = getArtifactStore();
    const now = Date.now();

    if (body.action === 'update-policy') {
      if (!viewer.permissions.managePolicies) return errorResponse('Changing retention policy requires the maintainer role.', 403);
      const index = store.policies.findIndex((policy) => policy.artifactType === body.policy.artifactType);
      const before = store.policies[index];
      const next = { ...body.policy, updatedAt: new Date(now).toISOString(), updatedBy: viewer.subject };
      store.policies = store.policies.map((policy, position) => (position === index ? next : policy));
      store.record(
        viewer.subject,
        'retention.update',
        body.policy.artifactType,
        `${before?.maxAgeDays ?? '?'}d/${before?.action ?? '?'} → ${next.maxAgeDays}d/${next.action}${next.enabled ? '' : ' (disabled)'}`,
        'artifact.retention.update',
        { before, after: next },
      );
      return noStore(successResponse({ policy: next }));
    }

    const catalog = new Map((await store.catalog()).map((artifact) => [artifact.id, artifact]));

    if (body.action === 'request-deletion') {
      if (!viewer.permissions.requestDeletion) return errorResponse('Requesting deletion requires the analyst role.', 403);
      const restricted = body.artifactIds.filter((id) => catalog.get(id)?.sensitivity === 'restricted');
      if (restricted.length > 0 && !viewer.permissions.viewRestricted) {
        return errorResponse('Restricted artifacts can only be queued for deletion by a maintainer.', 403);
      }
      const result = requestDeletion(body.artifactIds, catalog, store.holds, {
        reason: body.reason,
        source: body.source,
        actor: viewer.subject,
        now,
        id: newId('del'),
      });
      if (!result.ok) return errorResponse(result.error, result.status);
      store.deletions = [result.value.request, ...store.deletions];
      store.record(
        viewer.subject,
        'deletion.request',
        result.value.request.id,
        `${result.value.request.artifactIds.length} artifact(s): ${body.reason}`,
        'artifact.deletion.request',
        { artifactIds: result.value.request.artifactIds, skipped: result.value.skipped },
      );
      return noStore(successResponse(result.value));
    }

    if (!viewer.permissions.approveDeletion) return errorResponse('Deciding deletions requires the maintainer role.', 403);
    const existing = store.deletions.find((entry) => entry.id === body.requestId);
    if (!existing) return errorResponse('Deletion request not found', 404);

    if (body.action === 'decide') {
      const result = decideDeletion(existing, body.decision, viewer.subject, body.note, catalog, store.holds, now);
      if (!result.ok) return errorResponse(result.error, result.status);
      store.deletions = store.deletions.map((entry) => (entry.id === existing.id ? result.value : entry));
      store.record(viewer.subject, `deletion.${body.decision}`, existing.id, body.note || body.decision, 'artifact.deletion.decide', {
        decision: body.decision,
      });
      return noStore(successResponse({ request: result.value }));
    }

    if (existing.status !== 'approved') return errorResponse(`Only approved requests can be executed (is ${existing.status}).`, 409);
    const deleted: string[] = [];
    const failed: string[] = [];
    for (const id of existing.artifactIds) {
      const artifact = catalog.get(id);
      if (!artifact) continue;
      if (artifact.source === 'storage' && artifact.backend === 'local') {
        const ok = await selectArtifactRepository().delete(artifact.key);
        (ok ? deleted : failed).push(id);
      } else {
        deleted.push(id);
      }
    }
    const executed = { ...existing, status: 'executed' as const, artifactIds: deleted };
    store.deletions = store.deletions.map((entry) => (entry.id === existing.id ? executed : entry));
    store.record(viewer.subject, 'deletion.execute', existing.id, `${deleted.length} deleted, ${failed.length} failed`, 'artifact.delete', {
      deleted,
      failed,
    });
    return noStore(successResponse({ request: executed, failed }));
  },
  'Unable to apply the retention action.',
);
