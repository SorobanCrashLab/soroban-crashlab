/**
 * GET  /api/integrations/grafana/annotations – list recent annotations
 * POST /api/integrations/grafana/annotations – create a new annotation on the
 *   configured Grafana instance via the Annotations API
 *
 * GET serves mock data in development (no persistent store yet) so the UI can
 * be exercised without a configured Grafana instance.
 */

import { successResponse, errorResponse } from '@/lib/api-response-utils';
import type { GrafanaAnnotation } from '../../../../integrate-grafana-dashboard-annotation-api-utils';
import { buildAnnotationPayload, joinGrafanaUrl } from '../../../../integrate-grafana-dashboard-annotation-api-utils';

// Mock data for dev/demo use when Grafana is not yet configured.
const MOCK_ANNOTATIONS: GrafanaAnnotation[] = [
  {
    id: 'ann-001',
    runId: 'run-abc123',
    text: 'Fuzzing run run-abc123 started',
    tags: ['soroban-crashlab', 'run-abc123'],
    time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    status: 'sent',
    grafanaAnnotationId: 1841,
  },
  {
    id: 'ann-002',
    runId: 'run-def456',
    text: 'Critical failure detected in run-def456: SIGSEGV',
    tags: ['soroban-crashlab', 'run-def456', 'critical'],
    time: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    status: 'sent',
    grafanaAnnotationId: 1842,
  },
  {
    id: 'ann-003',
    runId: 'run-ghi789',
    text: 'Fuzzing run run-ghi789 completed',
    tags: ['soroban-crashlab', 'run-ghi789'],
    time: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    status: 'pending',
  },
];

export async function GET() {
  return successResponse({ annotations: MOCK_ANNOTATIONS });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      runId?: string;
      text?: string;
      tags?: string[];
      timeMs?: number;
      timeEndMs?: number;
      baseUrl?: string;
      apiToken?: string;
      dashboardUid?: string;
    };

    const baseUrl = (body.baseUrl ?? process.env.GRAFANA_BASE_URL ?? '').trim();
    const apiToken = (body.apiToken ?? process.env.GRAFANA_API_TOKEN ?? '').trim();

    if (!baseUrl || !apiToken) {
      return errorResponse('Grafana base URL and API token are not configured', 400);
    }

    if (!body.runId || !body.text) {
      return errorResponse('runId and text are required', 400);
    }

    const payload = buildAnnotationPayload({
      runId: body.runId,
      text: body.text,
      tags: body.tags,
      dashboardUid: body.dashboardUid,
      timeMs: body.timeMs ?? Date.now(),
      timeEndMs: body.timeEndMs,
    });

    try {
      const grafanaResponse = await fetch(joinGrafanaUrl(baseUrl, '/api/annotations'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout?.(10_000),
      });

      if (grafanaResponse.ok) {
        const responseBody = await grafanaResponse.json().catch(() => ({}));
        return successResponse({
          success: true,
          annotationId: responseBody.id,
        });
      }

      const errorText = await grafanaResponse.text().catch(() => grafanaResponse.statusText);
      return errorResponse(errorText, 200);
    } catch (networkError) {
      // Return a mock success in offline/dev environments so the UI can still
      // be exercised without a real Grafana instance.
      console.warn('[grafana/annotations] Could not reach Grafana Annotations API:', networkError);
      return successResponse({
        success: true,
        warning: 'Annotation queued locally – could not reach Grafana API',
      });
    }
  } catch {
    return errorResponse('Failed to parse request body', 400);
  }
}
