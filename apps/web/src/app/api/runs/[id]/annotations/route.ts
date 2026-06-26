import { NextRequest, NextResponse } from 'next/server';
import { buildMockRuns } from '@/app/mockRuns';
import { jsonError, readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';

// In-memory store keyed by run ID (persists for the lifetime of the process)
const annotationStore = new Map<string, string[]>();

function getAnnotations(id: string): string[] {
  if (annotationStore.has(id)) {
    return annotationStore.get(id)!;
  }
  // Seed from mock data on first access
  const run = buildMockRuns().find((r) => r.id === id);
  const initial = run?.annotations ?? [];
  annotationStore.set(id, [...initial]);
  return annotationStore.get(id)!;
}

/**
 * GET /api/runs/[id]/annotations
 * Returns the current annotation list for a run.
 */
export const GET = withRouteErrorHandling(
  'GET /api/runs/[id]/annotations',
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const run = buildMockRuns().find((r) => r.id === id);
    if (!run) {
      return jsonError('Run not found', 404);
    }
    return NextResponse.json({ runId: id, annotations: getAnnotations(id) });
  },
);

/**
 * POST /api/runs/[id]/annotations
 * Appends a new annotation. Body: { text: string }
 */
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
    return NextResponse.json({ runId: id, annotations }, { status: 201 });
  },
);

/**
 * DELETE /api/runs/[id]/annotations
 * Removes an annotation by index. Body: { index: number }
 */
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
    return NextResponse.json({ runId: id, annotations });
  },
);
