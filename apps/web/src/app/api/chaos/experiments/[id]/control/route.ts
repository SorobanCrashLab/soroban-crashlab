import { NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse, successResponse } from '@/lib/api-response-utils';
import { checkRbacPermission } from '@/lib/rbac';
import { readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import { analysisMarkdown, analyzeExperiment } from '@/features/chaos/lib/analysis';
import { preflight } from '@/features/chaos/lib/guardrails';
import { allowedActions, applyControl } from '@/features/chaos/lib/lifecycle';
import { TERMINAL_STATUSES } from '@/features/chaos/lib/model';
import { auditControl, chaosActor, getChaosStore } from '@/features/chaos/lib/server';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function noStore<T extends Response>(response: T): T {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/**
 * GET /api/chaos/experiments/[id]/control (#2340)
 *
 * Live state: the record (advanced to now), preflight + impact, telemetry
 * samples, allowed actions for the caller, and — once the experiment has
 * ended — the analysis. `?format=markdown` downloads the report.
 */
export const GET = withRouteErrorHandling(
  'GET /api/chaos/experiments/[id]/control',
  async (request: NextRequest, { params }: Params) => {
    const denial = await checkRbacPermission(request);
    if (denial) return denial;
    const { id } = await params;
    const actor = await chaosActor(request);
    const store = getChaosStore();
    const record = store.get(id);
    if (!record) return errorResponse('Experiment not found', 404);
    const samples = store.samples.get(id) ?? [];
    const ended = TERMINAL_STATUSES.includes(record.status);
    const analysis = ended || record.status === 'running' ? analyzeExperiment(record, samples) : null;

    if (request.nextUrl.searchParams.get('format') === 'markdown') {
      if (!analysis) return errorResponse('The report is available once the experiment has started.', 409);
      return noStore(
        new Response(analysisMarkdown(analysis, record), {
          headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Content-Disposition': `attachment; filename="chaos-${id}-v${record.version}.md"`,
          },
        }),
      );
    }

    return noStore(
      successResponse({
        viewer: actor,
        executor: store.executor.mode,
        experiment: record,
        preflight: preflight(record.definition, { now: store.now(), others: store.list(), approvals: record.approvals.length, selfId: id }),
        samples,
        analysis,
        allowedActions: allowedActions(record, actor),
        serverTime: new Date(store.now()).toISOString(),
      }),
    );
  },
  'Unable to load the experiment.',
);

const controlSchema = z
  .object({
    action: z.enum(['submit', 'approve', 'reject', 'start', 'stop', 'abort']),
    confirmation: z.string().max(120).optional(),
    reason: z.string().max(500).optional(),
    note: z.string().max(500).optional(),
  })
  .strict();

/**
 * POST /api/chaos/experiments/[id]/control (#2340) — lifecycle actions.
 * Start requires a passing preflight and the experiment name as
 * confirmation; abort is idempotent and always re-signals the executor.
 */
export const POST = withRouteErrorHandling(
  'POST /api/chaos/experiments/[id]/control',
  async (request: NextRequest, { params }: Params) => {
    const denial = await checkRbacPermission(request);
    if (denial) return denial;
    const { id } = await params;
    const actor = await chaosActor(request);
    const read = await readJsonBody(request);
    if ('error' in read) return read.error;
    const parsed = controlSchema.safeParse(read.body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((issue) => issue.message).join('; '), 422);

    const store = getChaosStore();
    const record = store.get(id);
    if (!record) return errorResponse('Experiment not found', 404);
    const result = applyControl(record, parsed.data, actor, { now: store.now(), others: store.list() });

    if (parsed.data.action === 'abort' && result.ok) {
      // Emergency stop: re-signal even when the record was already aborted
      // (idempotent retry), but never for a rejected request.
      store.executor.revoke(result.record);
    }
    if (!result.ok) {
      return noStore(
        Response.json({ error: result.error, ...(result.preflight ? { preflight: result.preflight } : {}) }, { status: result.status }),
      );
    }
    if (parsed.data.action === 'start') {
      const injected = store.executor.inject(result.record);
      if (!injected.ok) return errorResponse(`Executor refused to inject: ${injected.detail}`, 502);
    }
    if (parsed.data.action === 'stop') store.executor.revoke(result.record);
    if (result.changed) {
      store.put(result.record);
      auditControl(actor, id, parsed.data.action, {
        status: result.record.status,
        version: result.record.version,
        reason: parsed.data.reason ?? parsed.data.note ?? null,
      });
    }
    return noStore(
      successResponse({ experiment: result.record, changed: result.changed, allowedActions: allowedActions(result.record, actor), executor: store.executor.mode }),
    );
  },
  'Unable to apply the control action.',
);
