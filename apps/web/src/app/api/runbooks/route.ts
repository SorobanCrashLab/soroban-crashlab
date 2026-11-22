/**
 * GET  /api/runbooks            - list templates (?failureType=&service=&q=)
 * POST /api/runbooks            - create a draft template, or
 *                                 {action:"revise"|"approve", id, ...}
 */

import { NextRequest, NextResponse } from 'next/server';
import { RunbookError, approveTemplate, freshnessLabel, hasRole, isStale, reviseTemplate, suggestTemplates, validateTemplate } from '@/features/runbooks/engine';
import { identityFromHeaders, runbookStore } from '@/features/runbooks/store';
import type { RunbookTemplate } from '@/features/runbooks/model';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get('q')?.toLowerCase();
  let list = runbookStore.listTemplates();
  if (q) list = list.filter((t) => `${t.title} ${t.failureType} ${t.service}`.toLowerCase().includes(q));
  list = suggestTemplates(list, { failureType: params.get('failureType') ?? undefined, service: params.get('service') ?? undefined });
  const now = new Date();
  return NextResponse.json({
    runbooks: list.map((t) => ({ ...t, stale: isStale(t, now), freshness: freshnessLabel(t, now) })),
  });
}

export async function POST(request: NextRequest) {
  const { actor, role } = identityFromHeaders(request.headers);
  try {
    const body = (await request.json()) as Record<string, unknown>;

    if (body.action === 'approve' || body.action === 'revise') {
      const current = runbookStore.getTemplate(String(body.id));
      if (!current) return NextResponse.json({ error: 'Runbook not found' }, { status: 404 });
      if (!hasRole(role, 'maintainer')) return NextResponse.json({ error: 'Only maintainers can govern templates' }, { status: 403 });
      const next =
        body.action === 'approve'
          ? approveTemplate(current, actor, role)
          : reviseTemplate(current, { title: body.title as string | undefined ?? current.title, steps: (body.steps as RunbookTemplate['steps'] | undefined) ?? current.steps });
      return NextResponse.json({ runbook: runbookStore.saveTemplate(next) });
    }

    if (!hasRole(role, 'maintainer')) return NextResponse.json({ error: 'Only maintainers can create templates' }, { status: 403 });
    const draft: RunbookTemplate = {
      id: `rb-${Date.now().toString(36)}`,
      title: String(body.title ?? ''),
      failureType: String(body.failureType ?? 'general'),
      service: String(body.service ?? 'general'),
      workspace: String(body.workspace ?? 'default'),
      version: 1,
      status: 'draft',
      updatedAt: new Date().toISOString(),
      steps: (body.steps as RunbookTemplate['steps']) ?? [],
    };
    const problems = validateTemplate(draft);
    if (problems.length) return NextResponse.json({ error: 'Invalid runbook', problems }, { status: 400 });
    return NextResponse.json({ runbook: runbookStore.saveTemplate(draft) }, { status: 201 });
  } catch (error) {
    if (error instanceof RunbookError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
