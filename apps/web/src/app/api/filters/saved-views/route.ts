/**
 * GET/POST/PUT/DELETE /api/filters/saved-views (#2194)
 *
 * CRUD endpoints for saved filter views. Views are stored in memory
 * (mock store) and would be persisted to a database in production.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { SavedView } from '@/features/dashboard/filters/persistence/SavedViewStore';

export const dynamic = 'force-dynamic';

// In-memory store (mock — production would use a database).
const store = new Map<string, SavedView>();

export async function GET() {
  const views = Array.from(store.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  return NextResponse.json(views);
}

export async function POST(request: NextRequest) {
  try {
    const view = (await request.json()) as SavedView;
    if (!view.id || !view.name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    store.set(view.id, { ...view, updatedAt: new Date().toISOString() });
    return NextResponse.json(view, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const view = (await request.json()) as SavedView;
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

export async function DELETE(request: NextRequest) {
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
