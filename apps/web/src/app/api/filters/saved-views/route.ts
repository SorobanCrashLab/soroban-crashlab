/**
 * GET/POST/PUT/DELETE /api/filters/saved-views (#2194)
 *
 * CRUD endpoints for saved filter views. Views are stored in memory
 * (mock store) and would be persisted to a database in production.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { SavedView } from '@/features/dashboard/filters/persistence/SavedViewStore';
import { readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';

export const dynamic = 'force-dynamic';

// In-memory store (mock — production would use a database).
const store = new Map<string, SavedView>();

export async function GET() {
  const views = Array.from(store.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  return NextResponse.json(views);
}

async function postHandler(request: NextRequest) {
  try {
    const parsed = await readJsonBody(request);
    if ('error' in parsed) return parsed.error;
    const view = parsed.body as SavedView;
    if (!view.id || !view.name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    store.set(view.id, { ...view, updatedAt: new Date().toISOString() });
    return NextResponse.json(view, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

async function putHandler(request: NextRequest) {
  try {
    const parsed = await readJsonBody(request);
    if ('error' in parsed) return parsed.error;
    const view = parsed.body as SavedView;
    if (!view.id) {
      return NextResponse.json({ error: 'Missing view id' }, { status: 400 });
    }
    if (!store.has(view.id)) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 });
    }
    const updated = { ...view, updatedAt: new Date().toISOString() };
    store.set(view.id, updated);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

async function deleteHandler(request: NextRequest) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing view id' }, { status: 400 });
  }
  if (!store.has(id)) {
    return NextResponse.json({ error: 'View not found' }, { status: 404 });
  }
  store.delete(id);
  return NextResponse.json({ success: true });
}

// Every mutating handler goes through the shared size-limit choke point (#1572).
export const POST = withRouteErrorHandling('POST /api/filters/saved-views', postHandler);
export const PUT = withRouteErrorHandling('PUT /api/filters/saved-views', putHandler);
export const DELETE = withRouteErrorHandling('DELETE /api/filters/saved-views', deleteHandler);
