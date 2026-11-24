import { NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse, successResponse } from '@/lib/api-response-utils';
import { checkRbacPermission } from '@/lib/rbac';
import { readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import { preflight } from '@/features/chaos/lib/guardrails';
import { INVENTORY, MAINTENANCE_WINDOWS } from '@/features/chaos/lib/inventory';
import { allowedActions, applyControl } from '@/features/chaos/lib/lifecycle';
import { definitionFingerprint, parseDefinition } from '@/features/chaos/lib/model';
import { auditControl, chaosActor, getChaosStore } from '@/features/chaos/lib/server';
import { EXPERIMENT_TEMPLATES } from '@/features/chaos/lib/templates';

export const dynamic = 'force-dynamic';

function noStore<T extends Response>(response: T): T {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/**
 * GET /api/chaos/experiments (#2340) — experiments (advanced to now),
 * templates, target inventory and maintenance windows.
 */
export const GET = withRouteErrorHandling(
  'GET /api/chaos/experiments',
  async (request: NextRequest) => {
    const denial = await checkRbacPermission(request);
    if (denial) return denial;
    const actor = await chaosActor(request);
    const store = getChaosStore();
    const experiments = store.list().map((record) => ({
      id: record.id,
      name: record.definition.name,
      status: record.status,
      version: record.version,
      fingerprint: definitionFingerprint(record.definition),
      targets: record.definition.targets,
      createdBy: record.createdBy,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      allowedActions: allowedActions(record, actor),
    }));
    return noStore(
      successResponse(
        {
          viewer: actor,
          executor: store.executor.mode,
          experiments,
          templates: EXPERIMENT_TEMPLATES,
          inventory: INVENTORY,
          maintenanceWindows: MAINTENANCE_WINDOWS,
        },
        { total: experiments.length },
      ),
    );
  },
  'Unable to list chaos experiments.',
);

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), id: z.string().max(40).optional(), definition: z.unknown() }).strict(),
  z.object({ action: z.literal('dry-run'), definition: z.unknown() }).strict(),
  z.object({ action: z.literal('abort-all'), reason: z.string().max(500) }).strict(),
]);

/**
 * POST /api/chaos/experiments (#2340)
 *
 * - `save`: create, or save a new version of a draft/rejected experiment
 * - `dry-run`: impact estimate + preflight for an unsaved definition
 * - `abort-all`: emergency stop for every non-terminal experiment
 */
export const POST = withRouteErrorHandling(
  'POST /api/chaos/experiments',
  async (request: NextRequest) => {
    const denial = await checkRbacPermission(request);
    if (denial) return denial;
    const actor = await chaosActor(request);
    if (actor.role === 'anonymous') return errorResponse('Sign in to design or control experiments.', 403);
    const read = await readJsonBody(request);
    if ('error' in read) return read.error;
    const body = bodySchema.safeParse(read.body);
    if (!body.success) return errorResponse(body.error.issues.map((issue) => issue.message).join('; '), 422);
    const store = getChaosStore();

    if (body.data.action === 'abort-all') {
      const reason = body.data.reason.trim();
      if (!reason) return errorResponse('An emergency stop needs a reason.', 422);
      const aborted: string[] = [];
      for (const record of store.list()) {
        if (!['pending-approval', 'approved', 'running'].includes(record.status)) continue;
        const result = applyControl(record, { action: 'abort', reason: `Emergency stop: ${reason}` }, actor, { now: store.now(), others: [] });
        if (result.ok) {
          store.executor.revoke(result.record);
          store.put(result.record);
          aborted.push(record.id);
        }
      }
      auditControl(actor, 'all', 'abort-all', { reason, aborted });
      return noStore(successResponse({ aborted }, { total: aborted.length }));
    }

    const parsed = parseDefinition(body.data.definition);
    if (!parsed.ok) return errorResponse(`Invalid experiment: ${parsed.errors.join('; ')}`, 422);

    if (body.data.action === 'dry-run') {
      const result = preflight(parsed.definition, { now: store.now(), others: store.list(), approvals: 0 });
      return noStore(successResponse({ fingerprint: definitionFingerprint(parsed.definition), ...result }));
    }

    const saved = store.save(parsed.definition, actor, body.data.id);
    if (!saved.ok) return errorResponse(saved.error, saved.status);
    return noStore(successResponse({ experiment: saved.record }, { status: body.data.id ? 200 : 201 }));
  },
  'Unable to save the chaos experiment.',
);
