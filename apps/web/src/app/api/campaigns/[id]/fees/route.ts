import { jsonError, withRouteErrorHandling } from '@/lib/route-handler';
import { withFixtureCaching } from '@/lib/fixture-caching';
import { selectRunStorageDriver } from '@/lib/storage';
import { isRedisConfigured } from '@/lib/redis';
import { errorResponse, status } from '@/lib/api-response-utils';
import { queryBudget, QUERY_BUDGETS } from '@/lib/database/query-budget';
import {
  aggregateCampaignFeeInsight,
  DEFAULT_HISTOGRAM_BUCKETS,
  DEFAULT_TOP_FIXTURES,
  MAX_HISTOGRAM_BUCKETS,
  MAX_TOP_FIXTURES,
  MAX_TREND_POINTS,
} from '@/app/resource-fee-insight-utils';
import type { ResourceThresholds } from '@/app/resource-fee-utils';

function parseIntParam(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === null || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseThreshold(
  params: URLSearchParams,
  key: string,
): number | undefined {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * GET /api/campaigns/[id]/fees
 *
 * Server-side fee/resource aggregation for one campaign:
 *   - cpu/memory/fee histograms with warn/critical markers
 *   - threshold-crossing counts
 *   - top-N expensive fixtures (links point at run detail)
 *   - a bounded trend series (downsampled above `trendPoints`, max 500)
 *
 * Query params: top (1-50), buckets (1-50), trendPoints (2-500).
 * Optional threshold overrides: cpuWarn, cpuCritical, memoryWarn,
 * memoryCritical, feeWarn, feeCritical.
 *
 * Pre-W5-A12 rows fall back to flat cpuInstructions/memoryBytes/
 * minResourceFee values; the payload exposes coverage so the UI can explain
 * which runs lack the fee envelope.
 */
export const GET = withRouteErrorHandling(
  'GET /api/campaigns/[id]/fees',
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const campaignId = id?.trim();

    if (!campaignId) {
      return jsonError('Campaign id is required.', 400);
    }

    const enableMock = process.env.NEXT_PUBLIC_ENABLE_MOCK_DATA !== 'false';
    if (!enableMock && !isRedisConfigured()) {
      return errorResponse('Mock data disabled and no backend configured', status.serviceUnavailable);
    }

    const url = new URL(request.url);
    const topN = parseIntParam(url.searchParams.get('top'), DEFAULT_TOP_FIXTURES, 1, MAX_TOP_FIXTURES);
    const bucketCount = parseIntParam(
      url.searchParams.get('buckets'),
      DEFAULT_HISTOGRAM_BUCKETS,
      1,
      MAX_HISTOGRAM_BUCKETS,
    );
    const maxTrendPoints = parseIntParam(
      url.searchParams.get('trendPoints'),
      MAX_TREND_POINTS,
      2,
      MAX_TREND_POINTS,
    );

    const thresholdOverrides: Partial<ResourceThresholds> = {};
    const cpuWarn = parseThreshold(url.searchParams, 'cpuWarn');
    const cpuCritical = parseThreshold(url.searchParams, 'cpuCritical');
    const memoryWarn = parseThreshold(url.searchParams, 'memoryWarn');
    const memoryCritical = parseThreshold(url.searchParams, 'memoryCritical');
    const feeWarn = parseThreshold(url.searchParams, 'feeWarn');
    const feeCritical = parseThreshold(url.searchParams, 'feeCritical');
    if (cpuWarn !== undefined) thresholdOverrides.cpuWarning = cpuWarn;
    if (cpuCritical !== undefined) thresholdOverrides.cpuCritical = cpuCritical;
    if (memoryWarn !== undefined) thresholdOverrides.memoryWarning = memoryWarn;
    if (memoryCritical !== undefined) thresholdOverrides.memoryCritical = memoryCritical;
    if (feeWarn !== undefined) thresholdOverrides.feeWarning = feeWarn;
    if (feeCritical !== undefined) thresholdOverrides.feeCritical = feeCritical;

    // W5-E13: one list call, aggregation in-process. The per-campaign budget
    // keeps a future N+1 regression loud instead of silently degrading.
    const budgetKey = `campaign-fee-insight:${campaignId}`;
    queryBudget.setBudget(budgetKey, QUERY_BUDGETS.CAMPAIGN_DASHBOARD);
    queryBudget.recordQuery(budgetKey);

    const driver = selectRunStorageDriver();
    const { runs } = await driver.listRuns();

    const data = aggregateCampaignFeeInsight(campaignId, runs, {
      topN,
      bucketCount,
      maxTrendPoints,
      thresholds: thresholdOverrides,
    });

    return withFixtureCaching(request, { data });
  },
);
