/**
 * GET /api/logs/tail - cursor-based live tail with rate/backpressure notices (#075).
 *
 * Query params: cursor=<sequence>, limit=<1..200>, sample=<0..1>, q=<dsl>
 * The cursor is a monotonic sequence number; each call returns events that
 * arrived after it. Clients must pause or reduce `limit` when they see a
 * `backpressure` notice.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRouteErrorHandling, jsonError } from '@/lib/route-handler';
import { accessFromHeaders } from '@/lib/correlation/store';
import { redactLogEvents } from '@/lib/logs/redaction';
import { eventAt } from '@/lib/logs/dataset';
import { parseQuery } from '@/features/logs/query-engine/dsl/parser';
import { matchesQuery } from '@/features/logs/query-engine/dsl/evaluate';
import type { LogEvent, TailNotice } from '@/lib/logs/types';

export const dynamic = 'force-dynamic';

const MAX_BATCH = 200;
const MAX_AVAILABLE = 500;

function liveEvent(sequence: number): LogEvent {
  const template = eventAt(10 + (sequence % 120));
  return {
    ...template,
    id: `live-${sequence}`,
    timestamp: Date.now() - (MAX_AVAILABLE - (sequence % MAX_AVAILABLE)) * 100,
    attributes: { ...template.attributes, sequence },
  };
}

export const GET = withRouteErrorHandling(
  'GET /api/logs/tail',
  async (request: NextRequest) => {
    const params = request.nextUrl.searchParams;
    const cursor = Math.max(0, Number.parseInt(params.get('cursor') ?? '0', 10) || 0);
    const requestedLimit = Math.max(1, Number.parseInt(params.get('limit') ?? '50', 10) || 50);
    const limit = Math.min(MAX_BATCH, requestedLimit);
    const sample = Math.max(0.01, Math.min(1, Number(params.get('sample') ?? '1') || 1));
    const source = params.get('q') ?? '';
    const parsed = parseQuery(source);
    if (!parsed.valid) {
      return NextResponse.json({ error: 'Invalid query', diagnostics: parsed.diagnostics }, { status: 400 });
    }
    if (requestedLimit > MAX_BATCH) {
      return jsonError(`limit must be <= ${MAX_BATCH}.`, 400);
    }

    const available = cursor === 0 ? 20 : Math.min(MAX_AVAILABLE, Math.max(1, 20 + (cursor % 37)));
    const notices: TailNotice[] = [];
    if (available > limit) {
      notices.push({
        kind: 'backpressure',
        count: available - limit,
        message: `Tail is ${available - limit} events behind; reduce the rate or pause inspection.`,
      });
    }

    const events: LogEvent[] = [];
    let sampled = 0;
    for (let sequence = cursor + 1; sequence <= cursor + available && events.length < limit; sequence += 1) {
      const event = liveEvent(sequence);
      if ((sequence % 100) / 100 >= sample) {
        sampled += 1;
        continue;
      }
      if (!matchesQuery(event, parsed.ast)) continue;
      events.push(event);
    }
    if (sampled > 0) {
      notices.push({ kind: 'sampled', count: sampled, message: `${sampled} events skipped by tail sampling.` });
    }
    if (events.length < limit && available > events.length + sampled) {
      notices.push({
        kind: 'dropped',
        count: available - events.length - sampled,
        message: 'Some events did not match the live tail query.',
      });
    }

    const access = accessFromHeaders(request.headers);
    return NextResponse.json({
      events: redactLogEvents(events, { canSeeSensitive: access.canSeeRestricted }),
      cursor: cursor + available,
      rate: Math.round((events.length / 5) * 10) / 10,
      notices,
      serverTime: Date.now(),
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  },
);
