import { NextRequest } from 'next/server';
import { successResponse } from '@/lib/api-response-utils';
import {
  CAMPAIGN_CLASSES,
  DEFAULT_QUOTA_SCOPE,
  effectiveLimit,
  readQuotaLimits,
  RESOURCE_UNITS_PER_SEED,
} from '@/lib/capacity/quotas';
import { getCapacityLedger } from '@/lib/capacity/usage-ledger';
import { formatWindow, isWindowOpen, readSchedulingWindows } from '@/lib/capacity/windows';
import { codedErrorResponse } from '@/lib/error-codes';
import { withRouteErrorHandling } from '@/lib/route-handler';

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_WINDOW_HOURS = 24;
const MAX_WINDOW_HOURS = 24 * 35;

/**
 * GET /api/capacity?windowHours=24 — capacity report for the global scope (#1904).
 *
 * Limits (and each class's share after priority headroom), current usage,
 * scheduling windows, utilization (busy-worker-hours / capacity-worker-hours)
 * over the last `windowHours`, and cost attribution (seeds × resource units)
 * per project and class. Read-only, served like the other dashboard reads.
 */
export const GET = withRouteErrorHandling('GET /api/capacity', async (request: NextRequest) => {
  const rawHours = request.nextUrl.searchParams.get('windowHours');
  let windowHours = DEFAULT_WINDOW_HOURS;
  if (rawHours !== null) {
    if (!/^[1-9][0-9]{0,3}$/.test(rawHours) || Number(rawHours) > MAX_WINDOW_HOURS) {
      return codedErrorResponse('VALIDATION_ERROR', `Query "windowHours" must be an integer from 1 to ${MAX_WINDOW_HOURS}.`);
    }
    windowHours = Number(rawHours);
  }

  const scope = DEFAULT_QUOTA_SCOPE;
  const limits = readQuotaLimits();
  const { windows, errors: windowErrors } = readSchedulingWindows();
  const ledger = getCapacityLedger();
  const now = new Date();
  const to = now.getTime();
  const from = to - windowHours * HOUR_MS;

  const classes = CAMPAIGN_CLASSES.map((campaignClass) => {
    const share = (limit: number | null) => (limit === null ? null : effectiveLimit(limit, campaignClass));
    const window = campaignClass === 'interactive' ? undefined : windows[campaignClass];
    return {
      campaignClass,
      resourceUnitsPerSeed: RESOURCE_UNITS_PER_SEED[campaignClass],
      window: window ? formatWindow(window) : null,
      windowOpen: isWindowOpen(windows, campaignClass, now),
      limits: {
        concurrentWorkers: share(limits.concurrentWorkers),
        seedsPerDay: share(limits.seedsPerDay),
        rpcCallsPerDay: share(limits.rpcCallsPerDay),
        storageBytes: share(limits.storageBytes),
      },
    };
  });

  const cost = ledger.costRollup(scope, from, to);

  return successResponse({
    scope,
    generatedAt: now.toISOString(),
    limits,
    usage: ledger.usage(scope),
    classes,
    windowErrors,
    utilization: ledger.utilization(scope, from, to, limits.concurrentWorkers),
    cost: {
      rows: cost,
      totalSeeds: cost.reduce((sum, row) => sum + row.seeds, 0),
      totalResourceUnits: cost.reduce((sum, row) => sum + row.resourceUnits, 0),
    },
  });
});
