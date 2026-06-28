import { NextRequest, NextResponse } from 'next/server';
import { buildMockRuns } from '@/app/mockRuns';
import { addTag, normalizeTag, removeTag } from '@/app/run-tags-utils';
import { jsonError, readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';

const tagStore = new Map<string, string[]>();

function getTags(id: string): string[] {
  if (!tagStore.has(id)) {
    const run = buildMockRuns().find((r) => r.id === id);
    const initial = run?.tags ?? [];
    tagStore.set(id, [...initial]);
  }
  return tagStore.get(id)!;
}

export const GET = withRouteErrorHandling(
  'GET /api/runs/[id]/tags',
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const run = buildMockRuns().find((r) => r.id === id);
    if (!run) {
      return jsonError('Run not found', 404);
    }
    return NextResponse.json({ runId: id, tags: getTags(id) });
  },
);

export const POST = withRouteErrorHandling(
  'POST /api/runs/[id]/tags',
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const run = buildMockRuns().find((r) => r.id === id);
    if (!run) {
      return jsonError('Run not found', 404);
    }

    const parsedBody = await readJsonBody(request);
    if ('error' in parsedBody) return parsedBody.error;

    const raw = (parsedBody.body as Record<string, unknown>)?.tag;
    if (typeof raw !== 'string' || !raw.trim()) {
      return jsonError('tag is required and must be a non-empty string', 400);
    }

    const current = getTags(id);
    const result = addTag(current, raw);
    if (!result.success) {
      return jsonError(result.error ?? 'Failed to add tag', 400);
    }

    tagStore.set(id, result.tags);
    return NextResponse.json({ runId: id, tags: result.tags }, { status: 201 });
  },
);

export const DELETE = withRouteErrorHandling(
  'DELETE /api/runs/[id]/tags',
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const run = buildMockRuns().find((r) => r.id === id);
    if (!run) {
      return jsonError('Run not found', 404);
    }

    const parsedBody = await readJsonBody(request);
    if ('error' in parsedBody) return parsedBody.error;

    const raw = (parsedBody.body as Record<string, unknown>)?.tag;
    if (typeof raw !== 'string' || !raw.trim()) {
      return jsonError('tag is required', 400);
    }

    const normalized = normalizeTag(raw);
    const current = getTags(id);
    if (!current.includes(normalized)) {
      return jsonError('Tag not found', 404);
    }

    const next = removeTag(current, normalized);
    tagStore.set(id, next);
    return NextResponse.json({ runId: id, tags: next });
  },
);
