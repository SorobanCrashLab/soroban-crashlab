import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createdResponse, successResponse } from '@/lib/api-response-utils';
import { extractBearerToken, validateScopedApiToken } from '@/lib/api-key-auth';
import { codedErrorResponse, ERROR_CODES } from '@/lib/error-codes';
import { IDEMPOTENT_REPLAYED_HEADER } from '@/lib/idempotency-key';
import { ciResultsRateLimiter } from '@/lib/integrations/ci-regression/ingest-limits';
import { parseCiRegressionResult } from '@/lib/integrations/ci-regression/schema';
import { logger } from '@/lib/logger';
import { readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import { buildCiResultRecord, selectCiResultsStore, type CiResultRecord } from '@/lib/storage/ci-results-store';

/**
 * Repository allowed to post results (`owner/repo`). Unset accepts any
 * repository the token's holder posts for; production deployments should pin
 * it — see docs/REGRESSION_SUMMARY.md "Trust model".
 */
function allowedRepository(): string | undefined {
  const value = process.env.CRASHLAB_CI_REPOSITORY?.trim();
  return value ? value.toLowerCase() : undefined;
}

function summarize(record: CiResultRecord) {
  return { id: record.id, receivedAt: record.receivedAt, deltas: record.deltas };
}

/**
 * POST /api/integrations/ci/results — CI regression result ingest (#1890).
 *
 *  - auth:        Bearer token with the `ci:write` scope (or `*`)
 *  - rate limit:  30 posts per credential per minute → 429 RATE_LIMITED
 *  - validation:  bounded schema → 400 VALIDATION_ERROR with fieldErrors
 *  - tamper:      repository must equal CRASHLAB_CI_REPOSITORY when set → 403
 *  - idempotent:  keyed by (commitSha, suiteRunId)
 *                   first post        → 201
 *                   same payload      → 200, `Idempotent-Replayed: true`
 *                   different payload → 409 CI_RESULT_CONFLICT
 */
export const POST = withRouteErrorHandling('POST /api/integrations/ci/results', async (request: NextRequest) => {
  const authError = validateScopedApiToken(request, 'ci:write');
  if (authError) return authError;

  const credential = createHash('sha256').update(extractBearerToken(request) ?? '').digest('hex');
  const decision = ciResultsRateLimiter.take(credential);
  if (!decision.allowed) {
    const limited = codedErrorResponse('RATE_LIMITED');
    limited.headers.set('Retry-After', String(decision.retryAfterSeconds));
    return limited;
  }

  const parsedBody = await readJsonBody(request);
  if ('error' in parsedBody) return parsedBody.error;

  const parsed = parseCiRegressionResult(parsedBody.body);
  if (!parsed.ok) {
    return NextResponse.json(
      {
        error: ERROR_CODES.VALIDATION_ERROR.message,
        code: ERROR_CODES.VALIDATION_ERROR.code,
        fieldErrors: parsed.fieldErrors,
      },
      { status: ERROR_CODES.VALIDATION_ERROR.httpStatus },
    );
  }
  const result = parsed.result;

  const allowed = allowedRepository();
  if (allowed && result.repository.toLowerCase() !== allowed) {
    logger.warn('CI result rejected: repository not allowed', { repository: result.repository });
    return codedErrorResponse('CI_REPOSITORY_NOT_ALLOWED');
  }

  const { status, record } = await selectCiResultsStore().put(buildCiResultRecord(result));
  if (status === 'conflict') return codedErrorResponse('CI_RESULT_CONFLICT');

  if (status === 'replayed') {
    const replay = successResponse({ result: summarize(record) }, { status: 200 });
    replay.headers.set(IDEMPOTENT_REPLAYED_HEADER, 'true');
    return replay;
  }

  const created = createdResponse({ result: summarize(record) });
  created.headers.set(IDEMPOTENT_REPLAYED_HEADER, 'false');
  return created;
});

/**
 * GET /api/integrations/ci/results?sha=<40-hex>&pr=<n>&limit=<1-200>
 *
 * Newest first. Read-only dashboard data (fixture ids, classes, links), served
 * without a token like the other dashboard reads such as GET /api/runs.
 */
export const GET = withRouteErrorHandling('GET /api/integrations/ci/results', async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const sha = params.get('sha');
  const pr = params.get('pr');
  const limit = params.get('limit');

  if (sha !== null && !/^[0-9a-f]{40}$/.test(sha)) {
    return codedErrorResponse('VALIDATION_ERROR', 'Query "sha" must be a 40-character lowercase hex SHA.');
  }
  if (pr !== null && !/^[1-9][0-9]{0,9}$/.test(pr)) {
    return codedErrorResponse('VALIDATION_ERROR', 'Query "pr" must be a positive integer.');
  }
  if (limit !== null && !/^[1-9][0-9]{0,2}$/.test(limit)) {
    return codedErrorResponse('VALIDATION_ERROR', 'Query "limit" must be an integer from 1 to 200.');
  }

  const records = await selectCiResultsStore().list({
    commitSha: sha ?? undefined,
    prNumber: pr === null ? undefined : Number(pr),
    limit: limit === null ? undefined : Number(limit),
  });
  return successResponse({ results: records }, { total: records.length });
});
