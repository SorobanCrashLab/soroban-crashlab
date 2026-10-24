import { NextRequest } from 'next/server';
import { errorResponse, status, successResponse } from '@/lib/api-response-utils';
import { parseBulkTriageRequest } from '@/lib/triage/bulk';
import { recordTriageAudit } from '@/lib/triage/audit';
import { buildTriageSeed } from '@/lib/triage/seed';
import { triageStore } from '@/lib/triage/store';
import { TRIAGE_STATUSES, type TriageStatus } from '@/lib/triage/types';

export const dynamic = 'force-dynamic';

const DEFAULT_ORG = 'default';
const MAX_BODY_BYTES = 64 * 1024;

function orgFrom(request: NextRequest): string {
  return request.nextUrl.searchParams.get('orgId')?.trim() || DEFAULT_ORG;
}

function countByStatus(items: ReadonlyArray<{ status: TriageStatus }>): Record<TriageStatus, number> {
  const counts = Object.fromEntries(TRIAGE_STATUSES.map((value) => [value, 0])) as Record<
    TriageStatus,
    number
  >;
  for (const item of items) counts[item.status] += 1;
  return counts;
}

/**
 * GET /api/triage/queue?orgId=default
 *
 * Returns the persisted queue, priority-first. The default organisation is
 * seeded from the fixture runs on first read; seeding is idempotent, so a
 * maintainer's assignments survive reloads.
 */
export async function GET(request: NextRequest) {
  const orgId = orgFrom(request);

  if (orgId === DEFAULT_ORG) {
    await triageStore.seed(buildTriageSeed(orgId));
  }

  const items = await triageStore.list(orgId);
  return successResponse({
    items,
    counts: countByStatus(items),
    orgId,
  });
}

/**
 * POST /api/triage/queue
 *
 * Bulk mutation with per-item outcomes. A partially-applied batch returns 200
 * with `failed[]` populated; the caller keeps the successful rows and shows
 * the failures inline. Every accepted change is appended to the audit log
 * before the response is built.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return errorResponse('The bulk request body is too large.', status.unprocessableEntity);
  }

  let body: unknown;
  try {
    body = raw.trim() ? JSON.parse(raw) : null;
  } catch {
    return errorResponse('Expected a valid JSON body.', status.badRequest);
  }

  const parsed = parseBulkTriageRequest(body);
  if (!parsed.ok) return errorResponse(parsed.message, status.badRequest);

  const input = parsed.request;
  const orgId = input.orgId ?? orgFrom(request);
  const result = await triageStore.apply({ ...input, orgId });

  // Audit after the write: a rejected transition never produces an entry,
  // because `result.audit` only contains items that actually changed.
  const entries = recordTriageAudit(result.audit);

  return successResponse({
    updated: result.updated,
    unchanged: result.unchanged,
    failed: result.failed,
    progress: result.progress,
    audit: { appended: entries.length },
  });
}
