import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse } from '@/lib/api-response-utils';
import { validateScopedApiToken } from '@/lib/api-key-auth';
import { evaluateMidRunThrottle } from '@/lib/capacity/campaign-admission';
import { readQuotaLimits } from '@/lib/capacity/quotas';
import { getCapacityLedger } from '@/lib/capacity/usage-ledger';
import { readSchedulingWindows } from '@/lib/capacity/windows';
import { codedErrorResponse } from '@/lib/error-codes';
import { readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';

const count = z.number().int().nonnegative().max(1_000_000_000_000);

const usageReportSchema = z
  .object({
    campaignId: z.string().min(1).max(128),
    seedsProcessed: count,
    rpcCalls: count.optional(),
    storageBytes: count.optional(),
    status: z.enum(['running', 'finished']),
  })
  .strict();

/**
 * POST /api/capacity/usage — mid-run accounting + throttle (#1904).
 *
 * Runners report cumulative progress for a campaign admitted by
 * POST /api/campaigns. The report renews the campaign's capacity lease and
 * feeds utilization and cost attribution. The response says whether to keep
 * going: `throttle.throttle: true` means pause and retry after
 * `retryAfterSeconds` (window closed, or the scope is over this class's daily
 * share). Auth: Bearer token with `runs:write`.
 */
export const POST = withRouteErrorHandling('POST /api/capacity/usage', async (request: NextRequest) => {
  const authError = validateScopedApiToken(request, 'runs:write');
  if (authError) return authError;

  const parsedBody = await readJsonBody(request);
  if ('error' in parsedBody) return parsedBody.error;
  const parsed = usageReportSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return codedErrorResponse('VALIDATION_ERROR', `${issue.path.join('.') || 'body'}: ${issue.message}`);
  }

  const { campaignId, ...report } = parsed.data;
  const ledger = getCapacityLedger();
  const lease = ledger.report(campaignId, report);
  if (!lease) return codedErrorResponse('NOT_FOUND', `No capacity lease for campaign "${campaignId}".`);

  const throttle = evaluateMidRunThrottle({
    campaignClass: lease.campaignClass,
    finished: lease.finishedAt !== null,
    limits: readQuotaLimits(),
    usage: ledger.usage(lease.scope),
    windows: readSchedulingWindows().windows,
    now: new Date(),
  });

  return successResponse({
    lease: {
      campaignId: lease.campaignId,
      scope: lease.scope,
      campaignClass: lease.campaignClass,
      seedsUsed: lease.seedsUsed,
      rpcCallsUsed: lease.rpcCallsUsed,
      expiresAt: new Date(lease.expiresAt).toISOString(),
      finished: lease.finishedAt !== null,
    },
    throttle,
  });
});
