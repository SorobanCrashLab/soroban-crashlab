/**
 * Report editor API (issue #2313).
 *
 * GET    /api/reports?id=report-demo  → one report with version history
 * GET    /api/reports                 → report list
 * POST   /api/reports                 → create a report at revision 1
 * PATCH  /api/reports                 → compare-and-swap update / restore
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { reportsStore } from '@/lib/storage/reports-store';
import {
  appendRevision,
  createRevision,
  findRevision,
  resolveRevision,
  restoreRevisionSource,
} from '@/features/reports/editor/lib/revision';
import { documentFingerprint } from '@/features/reports/editor/lib/serialization';
import {
  CreateReportSchema,
  PatchReportSchema,
} from '@/features/reports/editor/lib/schema';
import type { ReportDocument } from '@/features/reports/editor/lib/types';

export const dynamic = 'force-dynamic';

function validationError(error: z.ZodError) {
  return NextResponse.json(
    { error: { code: 'VALIDATION_FAILED', message: 'Invalid request body', details: error.errors } },
    { status: 400 },
  );
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (id) {
    const record = reportsStore.get(id);
    if (!record) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Report ${id} not found` } },
        { status: 404 },
      );
    }
    return NextResponse.json(record);
  }
  return NextResponse.json({ reports: reportsStore.list() });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Request body must be JSON' } },
      { status: 400 },
    );
  }
  const parsed = CreateReportSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const id = parsed.data.id ?? `report-${Date.now().toString(36)}`;
  if (reportsStore.get(id)) {
    return NextResponse.json(
      { error: { code: 'ALREADY_EXISTS', message: `Report ${id} already exists` } },
      { status: 409 },
    );
  }

  const record = reportsStore.create({ ...parsed.data, id });
  return NextResponse.json(record, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Request body must be JSON' } },
      { status: 400 },
    );
  }
  const parsed = PatchReportSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const current = reportsStore.get(parsed.data.id);
  if (!current) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Report ${parsed.data.id} not found` } },
      { status: 404 },
    );
  }

  let base: ReportDocument = current.document;
  if (parsed.data.restoreRevision !== undefined) {
    const restored = restoreRevisionSource(current, parsed.data.restoreRevision);
    if (!restored) {
      return NextResponse.json(
        { error: { code: 'REVISION_NOT_FOUND', message: `Revision ${parsed.data.restoreRevision} not found` } },
        { status: 404 },
      );
    }
    base = restored;
  }

  const now = new Date().toISOString();
  const candidate: ReportDocument = {
    ...base,
    ...parsed.data.patch,
    id: current.document.id,
    revision: current.document.revision,
    updatedAt: now,
  };

  const result = resolveRevision(current.document, {
    baseRevision: parsed.data.baseRevision,
    candidate,
    force: parsed.data.force,
    allowEmpty: Boolean(parsed.data.revisionMessage),
  });

  if (result.status === 'conflict') {
    return NextResponse.json(
      {
        error: {
          code: 'REVISION_CONFLICT',
          message: `Save rejected: ${result.reason}`,
          details: {
            reason: result.reason,
            currentFingerprint: result.currentFingerprint,
            incomingFingerprint: result.incomingFingerprint,
          },
        },
        current,
        candidate,
      },
      { status: 409 },
    );
  }

  if (result.status === 'noop') {
    return NextResponse.json({ report: current, revision: findRevision(current, current.document.revision) ?? null });
  }

  const message = parsed.data.revisionMessage
    ?? (parsed.data.restoreRevision !== undefined
      ? `Restored r${parsed.data.restoreRevision}`
      : 'Editor autosave');
  const revision = createRevision(result.document, parsed.data.author, message, now);
  const next = reportsStore.update(appendRevision(current, revision));
  return NextResponse.json({
    report: next,
    revision,
    // Canonical serialization is also exposed for clients that want to verify
    // what the server stored, without re-implementing key ordering.
    fingerprint: documentFingerprint(next.document),
  });
}
