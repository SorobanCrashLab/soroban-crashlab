import { NextRequest } from 'next/server';
import { buildMockRuns } from '@/app/mockRuns';
import { getAnnotationStore } from '@/app/api/mock-store';
import { jsonError, readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import { successResponse, createdResponse } from '@/lib/api-response-utils';

const annotationStore = getAnnotationStore();

function getAnnotations(id: string): string[] {
  if (annotationStore.has(id)) {
    return annotationStore.get(id)!;
  }
  const run = buildMockRuns().find((r) => r.id === id);
  const initial = run?.annotations ?? [];
  annotationStore.set(id, [...initial]);
  return annotationStore.get(id)!;
}

export const GET = withRouteErrorHandling(
  'GET /api/runs/[id]/annotations',
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const run = buildMockRuns().find((r) => r.id === id);
    if (!run) {
      return jsonError('Run not found', 404);
    }
    return successResponse({ runId: id, annotations: getAnnotations(id) });
  },
);

export const POST = withRouteErrorHandling(
  'POST /api/runs/[id]/annotations',
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const run = buildMockRuns().find((r) => r.id === id);
    if (!run) {
      return jsonError('Run not found', 404);
    }

    const parsedBody = await readJsonBody(request);
    if ('error' in parsedBody) return parsedBody.error;

    const text = (parsedBody.body as Record<string, unknown>)?.text;
    if (typeof text !== 'string' || !text.trim()) {
      return jsonError('text is required and must be a non-empty string', 400);
    }
    if (text.trim().length > 500) {
      return jsonError('Annotation exceeds 500 character limit', 400);
    }

    const annotations = getAnnotations(id);
    annotations.push(text.trim());
    return createdResponse({ runId: id, annotations });
  },
);

export const DELETE = withRouteErrorHandling(
  'DELETE /api/runs/[id]/annotations',
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const run = buildMockRuns().find((r) => r.id === id);
    if (!run) {
      return jsonError('Run not found', 404);
    }

    const parsedBody = await readJsonBody(request);
    if ('error' in parsedBody) return parsedBody.error;

    const index = (parsedBody.body as Record<string, unknown>)?.index;
    if (typeof index !== 'number' || !Number.isInteger(index)) {
      return jsonError('index must be an integer', 400);
    }

    const annotations = getAnnotations(id);
    if (index < 0 || index >= annotations.length) {
      return jsonError('Index out of range', 400);
    }

    annotations.splice(index, 1);
    return successResponse({ runId: id, annotations });
  },
);
