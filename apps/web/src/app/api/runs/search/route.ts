import { successResponse } from '@/lib/api-response-utils';
import { withRouteErrorHandling } from '@/lib/route-handler';
import { sanitizeSearchQuery } from '@/lib/sanitize';
import { selectRunStorageDriver } from '@/lib/storage';
import { API_FETCH_TIMEOUT_MS } from '@/lib/timeouts';
import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_RESULTS,
  SEARCH_TRUNCATION_HINT,
} from '@/lib/search/ranker';
import { runTimestamp } from '@/lib/search/run-document';
import { getRunSearchIndex } from '@/lib/search/server-index';
import { searchRuns, usesGrammar } from '@/app/search/grammar/compiler';

const MAX_QUERY_LENGTH = 200;

export const GET = withRouteErrorHandling('GET /api/runs/search', async (request: Request) => {
  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get('q') ?? searchParams.get('query') ?? '';
  const query = sanitizeSearchQuery(rawQuery).slice(0, MAX_QUERY_LENGTH);
  const requestedLimit = Number.parseInt(searchParams.get('limit') ?? '', 10);
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, MAX_SEARCH_RESULTS)
      : DEFAULT_SEARCH_LIMIT;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) {
    try {
      const upstreamParams = new URLSearchParams(searchParams);
      upstreamParams.set('q', query);
      upstreamParams.set('limit', String(limit));
      const response = await fetch(`${apiUrl}/api/runs/search?${upstreamParams.toString()}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(API_FETCH_TIMEOUT_MS),
      });
      if (response.ok) {
        const data = (await response.json()) as { total?: number };
        return successResponse(data, {
          total: typeof data.total === 'number' ? data.total : undefined,
        });
      }
    } catch {}
  }

  const driver = selectRunStorageDriver();

  if (usesGrammar(query)) {
    const { runs: allRuns } = await driver.listRuns();
    const outcome = searchRuns(allRuns, query);
    const indexed = allRuns.length;
    const tookMs = Math.round((Date.now() - startedAt) * 100) / 100;

    if (outcome.error) {
      return successResponse(
        {
          results: [],
          total: 0,
          truncated: false,
          error: {
            message: outcome.error.message,
            position: outcome.error.position,
            expected: outcome.error.expected,
          },
          indexed,
          tookMs,
        },
        { total: 0 },
      );
    }

    const ordered = outcome.runs
      .slice()
      .sort((a, b) => (runTimestamp(b) ?? 0) - (runTimestamp(a) ?? 0));
    const truncated = ordered.length > limit;
    return successResponse(
      {
        results: ordered.slice(0, limit).map((run) => ({
          run,
          score: 1,
          matchedFields: [],
        })),
        total: ordered.length,
        truncated,
        hint: truncated ? SEARCH_TRUNCATION_HINT : undefined,
        indexed,
        tookMs,
      },
      { total: ordered.length },
    );
  }

  const index = await getRunSearchIndex(driver);
  const outcome = index.search(query, { limit });
  const runs = await Promise.all(
    outcome.hits.map((hit) => driver.getRun(hit.document.id)),
  );

  const results = outcome.hits.flatMap((hit, position) => {
    const run = runs[position];
    if (!run) return [];
    return [{ run, score: hit.score, matchedFields: hit.matchedFields }];
  });

  const tookMs = Math.round((Date.now() - startedAt) * 100) / 100;
  return successResponse(
    {
      results,
      total: outcome.total,
      truncated: outcome.truncated,
      hint: outcome.hint,
      indexed: index.size,
      tookMs,
    },
    { total: outcome.total },
  );
});
