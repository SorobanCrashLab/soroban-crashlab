/**
 * GET  /api/correlation/links  - artifacts (redacted per caller), confirmed/rejected
 *                                links, investigation sets, audit trail
 * POST /api/correlation/links  - {action: "confirm"|"reject", link}
 *                                {action: "link", from, to} | {action: "unlink", id}
 *                                {action: "create_set"|"update_set", ...} | {action:"bundle", id}
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildEvidenceBundle, decide, manualLink, redactForAccess } from '@/lib/correlation/engine';
import { accessFromHeaders, correlationStore } from '@/lib/correlation/store';
import type { CorrelationLink, InvestigationSet } from '@/lib/correlation/model';

export async function GET(request: NextRequest) {
  const access = accessFromHeaders(request.headers);
  const artifacts = redactForAccess(correlationStore.artifacts, access);
  const ids = new Set(artifacts.map((a) => a.id));
  return NextResponse.json({
    artifacts,
    links: Array.from(correlationStore.links.values()).filter((l) => ids.has(l.from) && ids.has(l.to)),
    sets: Array.from(correlationStore.sets.values()),
    audit: correlationStore.audit.slice(-100),
  });
}

export async function POST(request: NextRequest) {
  const access = accessFromHeaders(request.headers);
  if (!access.canWrite) return NextResponse.json({ error: 'Responder or maintainer role required' }, { status: 403 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const known = new Set(correlationStore.artifacts.map((a) => a.id));
  const visible = new Set(redactForAccess(correlationStore.artifacts, access).map((a) => a.id));
  const now = new Date().toISOString();
  const log = (action: 'link_created' | 'link_confirmed' | 'link_rejected' | 'link_removed' | 'set_created' | 'set_updated', extra: { linkId?: string; setId?: string }) =>
    correlationStore.audit.push({ at: now, actor: access.actor, action, ...extra });

  switch (body.action) {
    case 'confirm':
    case 'reject': {
      const link = body.link as CorrelationLink | undefined;
      if (!link || !known.has(link.from) || !known.has(link.to)) return NextResponse.json({ error: 'Unknown artifacts' }, { status: 400 });
      if (!visible.has(link.from) || !visible.has(link.to)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const decided = decide(link, body.action === 'confirm' ? 'confirmed' : 'rejected', access.actor);
      correlationStore.links.set(decided.id, decided);
      log(body.action === 'confirm' ? 'link_confirmed' : 'link_rejected', { linkId: decided.id });
      return NextResponse.json({ link: decided });
    }
    case 'link': {
      const from = String(body.from);
      const to = String(body.to);
      if (from === to || !known.has(from) || !known.has(to)) return NextResponse.json({ error: 'Invalid artifacts' }, { status: 400 });
      if (!visible.has(from) || !visible.has(to)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const link = manualLink(from, to, access.actor);
      correlationStore.links.set(link.id, link);
      log('link_created', { linkId: link.id });
      return NextResponse.json({ link }, { status: 201 });
    }
    case 'unlink': {
      const id = String(body.id);
      if (!correlationStore.links.delete(id)) return NextResponse.json({ error: 'Link not found' }, { status: 404 });
      log('link_removed', { linkId: id });
      return NextResponse.json({ ok: true });
    }
    case 'create_set':
    case 'update_set': {
      const artifactIds = ((body.artifactIds as string[] | undefined) ?? []).filter((id) => visible.has(id));
      const existing = body.action === 'update_set' ? correlationStore.sets.get(String(body.id)) : undefined;
      if (body.action === 'update_set' && !existing) return NextResponse.json({ error: 'Set not found' }, { status: 404 });
      const set: InvestigationSet = {
        id: existing?.id ?? `set-${Date.now().toString(36)}`,
        name: String(body.name ?? existing?.name ?? 'Untitled investigation'),
        artifactIds,
        linkIds: ((body.linkIds as string[] | undefined) ?? existing?.linkIds ?? []).filter((id) => correlationStore.links.has(id)),
        tags: (body.tags as string[] | undefined) ?? existing?.tags ?? [],
        createdBy: existing?.createdBy ?? access.actor,
        createdAt: existing?.createdAt ?? now,
      };
      correlationStore.sets.set(set.id, set);
      log(existing ? 'set_updated' : 'set_created', { setId: set.id });
      return NextResponse.json({ set }, { status: existing ? 200 : 201 });
    }
    case 'bundle': {
      const set = correlationStore.sets.get(String(body.id));
      if (!set) return NextResponse.json({ error: 'Set not found' }, { status: 404 });
      return NextResponse.json({ bundle: buildEvidenceBundle(set, correlationStore.artifacts, Array.from(correlationStore.links.values()), access) });
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
