import { NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse, successResponse } from '@/lib/api-response-utils';
import { checkRbacPermission } from '@/lib/rbac';
import { readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import { LIMITS, replayEventSchema, sessionMetaSchema } from '@/features/session-replay/capture/schema';
import { buildBundle } from '@/features/session-replay/lib/bundle';
import { journeyReport } from '@/features/session-replay/lib/journey';
import {
  SHARE_TTL_MINUTES,
  auditReplay,
  canView,
  createShareToken,
  getReplayStore,
  replayViewer,
  retentionDays,
} from '@/features/session-replay/lib/server';

export const dynamic = 'force-dynamic';

function noStore<T extends Response>(response: T): T {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/**
 * GET /api/session-replay (#2341)
 *
 * - no params: session summaries (captured sessions only for signed-in users)
 * - `?view=journeys`: funnels and top paths over the visible sessions
 * - `?id=…[&share=token]`: one session — signed-in users, or anyone holding a
 *   valid time-bounded share token; demo sessions are open
 * - `?id=…&format=bundle`: redacted reproduction bundle (audited export)
 */
export const GET = withRouteErrorHandling(
  'GET /api/session-replay',
  async (request: NextRequest) => {
    const denial = await checkRbacPermission(request);
    if (denial) return denial;
    const viewer = await replayViewer(request);
    const params = request.nextUrl.searchParams;
    const store = getReplayStore();
    const id = params.get('id');

    if (!id) {
      if (params.get('view') === 'journeys') {
        return noStore(successResponse({ viewer, report: journeyReport(store.all(viewer.canViewCaptured)) }));
      }
      const sessions = store.list(viewer.canViewCaptured);
      return noStore(successResponse({ viewer, sessions, retentionDays: retentionDays() }, { total: sessions.length }));
    }

    const session = store.get(id);
    const access = session ? canView(viewer, session, params.get('share')) : null;
    // Same response for "missing" and "not allowed": ids are not enumerable.
    if (!session || !access) return noStore(errorResponse('Session not found', 404));

    if (params.get('format') === 'bundle') {
      if (session.source !== 'demo') auditReplay('replay.export', viewer, id, { access });
      const response = new Response(JSON.stringify(buildBundle(session), null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="replay-${id}.json"`,
          'X-Content-Type-Options': 'nosniff',
        },
      });
      return noStore(response);
    }
    if (session.source !== 'demo') auditReplay('replay.view', viewer, id, { access });
    return noStore(successResponse({ viewer, session, access }));
  },
  'Unable to load session replay data.',
);

const postSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('ingest'),
      session: sessionMetaSchema,
      seq: z.number().int().min(1),
      droppedEvents: z.number().int().min(0).max(1_000_000).default(0),
      events: z.array(replayEventSchema).max(LIMITS.eventsPerBatch),
    })
    .strict(),
  z
    .object({
      kind: z.literal('share'),
      sessionId: z.string().max(64),
      ttlMinutes: z.number().int().min(SHARE_TTL_MINUTES.min).max(SHARE_TTL_MINUTES.max).default(SHARE_TTL_MINUTES.default),
    })
    .strict(),
  z
    .object({
      kind: z.literal('link'),
      sessionId: z.string().max(64),
      issue: z.string().url().max(500).optional(),
      incident: z.string().regex(/^[A-Z]+-\d{1,8}$/).optional(),
    })
    .strict(),
]);

/**
 * POST /api/session-replay (#2341)
 *
 * - `ingest`: capture batches from consenting, sampled browsers. Re-validated
 *   and re-scrubbed server-side; duplicate sequence numbers are ignored.
 * - `share`: mint a time-bounded share link (maintainer, audited).
 * - `link`: attach an issue URL or incident id (signed-in users).
 */
export const POST = withRouteErrorHandling(
  'POST /api/session-replay',
  async (request: NextRequest) => {
    const denial = await checkRbacPermission(request);
    if (denial) return denial;
    const read = await readJsonBody(request);
    if ('error' in read) return read.error;
    const parsed = postSchema.safeParse(read.body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '), 422);
    }
    const body = parsed.data;
    const store = getReplayStore();

    if (body.kind === 'ingest') {
      const result = store.ingest(body.session, body.seq, body.events, body.droppedEvents);
      return noStore(successResponse(result, { status: 202 }));
    }

    const viewer = await replayViewer(request);
    const session = store.get(body.sessionId);
    if (!session || !canView(viewer, session, null)) return errorResponse('Session not found', 404);

    if (body.kind === 'share') {
      if (!viewer.canShare) return errorResponse('Sharing replays requires the maintainer role.', 403);
      const { token, expiresAt } = createShareToken(session.id, body.ttlMinutes);
      auditReplay('replay.share', viewer, session.id, { expiresAt, ttlMinutes: body.ttlMinutes });
      return noStore(
        successResponse({
          url: `/support/session-replay/${encodeURIComponent(session.id)}?share=${encodeURIComponent(token)}`,
          expiresAt,
        }),
      );
    }

    if (!viewer.canViewCaptured) return errorResponse('Linking replays requires signing in.', 403);
    if (!body.issue && !body.incident) return errorResponse('Provide an issue URL or incident id.', 422);
    const updated = store.link(session.id, { issue: body.issue, incident: body.incident });
    return noStore(successResponse({ issueLinks: updated?.issueLinks ?? [], incidentIds: updated?.incidentIds ?? [] }));
  },
  'Unable to process the session replay request.',
);
