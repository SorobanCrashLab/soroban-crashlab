/**
 * GET /api/logs/search - structured log search with DSL, facets, histogram
 * and cursor pagination (#075).
 *
 * Query params:
 *   q=<dsl>            from/to=<epoch ms>    cursor=<opaque offset>
 *   limit=<1..500>     sort=asc|desc         facet=field:value (repeatable)
 *   histFrom/histTo=<epoch ms>               sample=<0..1>
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRouteErrorHandling, jsonError } from '@/lib/route-handler';
import { accessFromHeaders } from '@/lib/correlation/store';
import { redactLogEvents } from '@/lib/logs/redaction';
import {
  eventAt,
  indexRangeForWindow,
  LOG_DATASET_SIZE,
  timestampForIndex,
} from '@/lib/logs/dataset';
import { matchesQuery } from '@/features/logs/query-engine/dsl/evaluate';
import { parseQuery } from '@/features/logs/query-engine/dsl/parser';
import { serializeNode } from '@/features/logs/query-engine/dsl/serializer';
import type { FacetResult, HistogramBucket, LogEvent } from '@/lib/logs/types';

const FACET_FIELDS = ['level', 'source', 'contract', 'run_id', 'campaign_id', 'trace_id', 'error_code'];
const MAX_SCAN = 60_000;
const HISTOGRAM_BUCKETS = 60;

function parseCursor(value: string | null): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 36);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, LOG_DATASET_SIZE) : 0;
}

function facetValue(event: LogEvent, field: string): string | undefined {
  switch (field) {
    case 'level': return event.level;
    case 'source': return event.source;
    case 'contract': return event.contract;
    case 'run_id': return event.run_id;
    case 'campaign_id': return event.campaign_id;
    case 'trace_id': return event.trace_id;
    case 'error_code': return event.error_code;
    default: return undefined;
  }
}

export const GET = withRouteErrorHandling(
  'GET /api/logs/search',
  async (request: NextRequest) => {
    const started = Date.now();
    const params = request.nextUrl.searchParams;
    const source = params.get('q') ?? '';
    const parsed = parseQuery(source);
    if (!parsed.valid) {
      return NextResponse.json(
        { error: 'Invalid query', diagnostics: parsed.diagnostics },
        { status: 400 },
      );
    }

    const now = timestampForIndex(0);
    const from = Number(params.get('from') ?? now - 86_400_000);
    const to = Number(params.get('to') ?? now);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
      return jsonError('A valid time window is required (from < to).', 400);
    }

    const limit = Math.max(1, Math.min(500, Number(params.get('limit') ?? 200) || 200));
    const sort = params.get('sort') === 'asc' ? 'asc' : 'desc';
    const cursor = parseCursor(params.get('cursor'));
    const sample = Math.max(0, Math.min(1, Number(params.get('sample') ?? 1) || 1));
    const activeFacets = params.getAll('facet').reduce<Record<string, string[]>>((acc, entry) => {
      const separator = entry.indexOf(':');
      if (separator <= 0) return acc;
      const field = entry.slice(0, separator);
      const value = entry.slice(separator + 1);
      if (!FACET_FIELDS.includes(field)) return acc;
      acc[field] = [...(acc[field] ?? []), value];
      return acc;
    }, {});

    const histFrom = Number(params.get('histFrom') ?? from);
    const histTo = Number(params.get('histTo') ?? to);
    const histogramEnabled = Number.isFinite(histFrom) && Number.isFinite(histTo) && histTo > histFrom;

    const window = indexRangeForWindow(from, to);
    const direction = sort === 'asc' ? 1 : -1;
    const startIndex = direction === 1 ? window.start : window.end;

    const matched: LogEvent[] = [];
    const facetCounts = new Map<string, Map<string, number>>();
    const buckets: HistogramBucket[] = Array.from({ length: HISTOGRAM_BUCKETS }, (_, index) => ({
      timestamp: histFrom + ((histTo - histFrom) / HISTOGRAM_BUCKETS) * index,
      count: 0,
      levels: {},
    }));
    let scanned = 0;
    let partial = false;
    let skippedForCursor = 0;
    let totalMatches = 0;

    for (
      let index = startIndex;
      direction === 1 ? index <= window.end : index >= window.start;
      index += direction
    ) {
      if (scanned >= MAX_SCAN) {
        partial = true;
        break;
      }
      scanned += 1;
      const event = eventAt(index);
      if (!matchesQuery(event, parsed.ast)) continue;
      const facetMismatch = Object.entries(activeFacets).some(([field, values]) => {
        const actual = facetValue(event, field);
        return !actual || !values.includes(actual);
      });
      if (facetMismatch) continue;

      totalMatches += 1;

      if (histogramEnabled && event.timestamp >= histFrom && event.timestamp < histTo) {
        const bucketIndex = Math.min(
          HISTOGRAM_BUCKETS - 1,
          Math.floor(((event.timestamp - histFrom) / (histTo - histFrom)) * HISTOGRAM_BUCKETS),
        );
        const bucket = buckets[bucketIndex];
        bucket.count += 1;
        bucket.levels[event.level] = (bucket.levels[event.level] ?? 0) + 1;
      }

      for (const field of FACET_FIELDS) {
        const value = facetValue(event, field);
        if (!value) continue;
        const counts = facetCounts.get(field) ?? new Map<string, number>();
        counts.set(value, (counts.get(value) ?? 0) + 1);
        facetCounts.set(field, counts);
      }

      if (sample < 1 && event.id.length > 0 && (Number.parseInt(event.id.slice(4), 10) % 1000) / 1000 >= sample) {
        continue;
      }

      skippedForCursor += 1;
      if (skippedForCursor <= cursor) continue;
      if (matched.length <= limit) matched.push(event);
    }

    const access = accessFromHeaders(request.headers);
    // The correlation access context is the server-side source of truth for
    // restricted visibility; map it onto the log redaction policy.
    const events = redactLogEvents(matched.slice(0, limit), {
      canSeeSensitive: access.canSeeRestricted,
    });
    const hasMore = matched.length > limit;
    const nextCursor = hasMore ? (cursor + events.length).toString(36) : null;

    const facets: FacetResult[] = FACET_FIELDS.map((field) => ({
      field,
      values: [...(facetCounts.get(field) ?? new Map<string, number>()).entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
        .slice(0, 40),
    }));

    return NextResponse.json({
      events,
      nextCursor,
      facets,
      histogram: histogramEnabled ? buckets : [],
      stats: {
        total: totalMatches,
        scanned,
        tookMs: Date.now() - started,
        partial,
      },
      canonicalQuery: serializeNode(parsed.ast),
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  },
);
