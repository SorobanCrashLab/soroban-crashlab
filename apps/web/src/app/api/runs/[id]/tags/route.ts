import { NextRequest, NextResponse } from 'next/server';
import { buildMockRuns } from '@/app/mockRuns';
import { addTag, normalizeTag, removeTag } from '@/app/run-tags-utils';

// In-memory store keyed by run ID (persists for the lifetime of the process)
const tagStore = new Map<string, string[]>();

function getTags(id: string): string[] {
  if (!tagStore.has(id)) {
    const run = buildMockRuns().find((r) => r.id === id);
    const initial = run?.tags ?? [];
    tagStore.set(id, [...initial]);
  }
  return tagStore.get(id)!;
}

/**
 * GET /api/runs/[id]/tags
 * Returns the current tag list for a run.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = buildMockRuns().find((r) => r.id === id);
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }
  return NextResponse.json({ runId: id, tags: getTags(id) });
}

/**
 * POST /api/runs/[id]/tags
 * Adds a tag (normalized to kebab-case). Body: { tag: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = buildMockRuns().find((r) => r.id === id);
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const raw = (body as Record<string, unknown>)?.tag;
  if (typeof raw !== 'string' || !raw.trim()) {
    return NextResponse.json({ error: 'tag is required and must be a non-empty string' }, { status: 400 });
  }

  const current = getTags(id);
  const result = addTag(current, raw);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  tagStore.set(id, result.tags);
  return NextResponse.json({ runId: id, tags: result.tags }, { status: 201 });
}

/**
 * DELETE /api/runs/[id]/tags
 * Removes a tag by value. Body: { tag: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = buildMockRuns().find((r) => r.id === id);
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const raw = (body as Record<string, unknown>)?.tag;
  if (typeof raw !== 'string' || !raw.trim()) {
    return NextResponse.json({ error: 'tag is required' }, { status: 400 });
  }

  const normalized = normalizeTag(raw);
  const current = getTags(id);
  if (!current.includes(normalized)) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
  }

  const next = removeTag(current, normalized);
  tagStore.set(id, next);
  return NextResponse.json({ runId: id, tags: next });
}
