/**
 * POST /api/integrations/grafana/test-connection
 *
 * Validates that the supplied Grafana base URL and API token can reach the
 * Grafana health endpoint.
 *
 * When the Grafana instance is not reachable (e.g. in dev), the handler falls
 * back to structural validation only and returns success for any token that
 * passes basic format checks, mirroring the PagerDuty adapter.
 */

import { successResponse, errorResponse } from '@/lib/api-response-utils';
import { checkRequestSize } from '@/lib/request-size-limits';
import { isApiTokenReachable, joinGrafanaUrl } from '../../../../integrate-grafana-dashboard-annotation-api-utils';
import { httpCall, outboundErrorCode } from '@/lib/http-call';
import { GRAFANA_FETCH_TIMEOUT_MS } from '@/lib/timeouts';

export async function POST(request: Request) {
  const sizeError = checkRequestSize(request);
  if (sizeError) {
    return sizeError;
  }

  try {
    const body = (await request.json()) as { baseUrl?: string; apiToken?: string };
    const baseUrl = (body.baseUrl ?? '').trim();
    const apiToken = (body.apiToken ?? '').trim();

    if (!baseUrl) {
      return errorResponse('baseUrl is required', 400);
    }

    if (!apiToken) {
      return errorResponse('apiToken is required', 400);
    }

    if (!isApiTokenReachable(apiToken)) {
      return errorResponse(
        'API token appears invalid – must be at least 10 characters',
        200,
      );
    }

    try {
      // GET is idempotent, so transient 429/5xx and timeouts are retried.
      const healthResponse = await httpCall(
        'grafana',
        joinGrafanaUrl(baseUrl, '/api/health'),
        { method: 'GET', headers: { Authorization: `Bearer ${apiToken}` } },
        { attemptTimeoutMs: GRAFANA_FETCH_TIMEOUT_MS },
      );

      if (healthResponse.ok) {
        return successResponse({ success: true });
      }

      const errorBody = await healthResponse.text().catch(() => healthResponse.statusText);
      return errorResponse(errorBody, 200);
    } catch (networkError) {
      // Network not available (e.g. offline dev environment) – fall back to
      // structural validation only, returning success if token format is valid.
      console.warn('[grafana/test-connection] Could not reach Grafana health endpoint:', networkError);
      return successResponse({
        success: true,
        warning: 'Structural validation only – could not reach Grafana instance',
        code: outboundErrorCode(networkError),
      });
    }
  } catch {
    return errorResponse('Failed to parse request body', 400);
  }
}
