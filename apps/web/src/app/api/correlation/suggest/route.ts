/**
 * GET /api/correlation/suggest?focus=<artifactId>&limit=N&min=0.3
 *
 * Returns explainable correlation suggestions (confidence + rationale),
 * ordered deterministically. Weights adapt to confirm/reject feedback.
 */

import { NextRequest, NextResponse } from 'next/server';
import { learnWeights, redactForAccess, suggestLinks } from '@/lib/correlation/engine';
import { accessFromHeaders, correlationStore } from '@/lib/correlation/store';

export async function GET(request: NextRequest) {
  const access = accessFromHeaders(request.headers);
  const params = request.nextUrl.searchParams;
  const visible = redactForAccess(correlationStore.artifacts, access);
  const visibleIds = new Set(visible.map((a) => a.id));
  const existing = Array.from(correlationStore.links.values());
  const limit = Math.min(Math.max(parseInt(params.get('limit') ?? '50', 10) || 50, 1), 200);

  // Score on the full metadata so redaction never changes ranking, then only
  // expose suggestions whose endpoints the caller can see.
  const suggestions = suggestLinks(correlationStore.artifacts, {
    weights: learnWeights(existing),
    existing,
    focusId: params.get('focus') ?? undefined,
    minConfidence: Number(params.get('min')) || undefined,
  })
    .filter((l) => visibleIds.has(l.from) && visibleIds.has(l.to))
    .slice(0, limit);

  return NextResponse.json({ suggestions });
}
