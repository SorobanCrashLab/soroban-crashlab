/**
 * GET  /api/runbooks/executions[?id=]  - list or fetch executions (resumable)
 * POST /api/runbooks/executions        - {action:"start", templateId, context}
 *                                        or {action, id, stepId, ...} for
 *                                        evidence | complete | block | dry_run |
 *                                        request_approval | approve | feedback
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  RunbookError,
  addEvidence,
  approveStep,
  blockStep,
  completeStep,
  dryRunAutomation,
  hasRole,
  requestApproval,
  startExecution,
  summarizeExecution,
} from '@/features/runbooks/engine';
import { identityFromHeaders, runbookStore } from '@/features/runbooks/store';
import type { EvidenceKind, ExecutionContext } from '@/features/runbooks/model';

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (id) {
    const execution = runbookStore.getExecution(id);
    const template = execution && runbookStore.getTemplate(execution.templateId);
    if (!execution || !template) return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
    return NextResponse.json({ execution, template, summary: summarizeExecution(template, execution) });
  }
  return NextResponse.json({ executions: runbookStore.listExecutions() });
}

export async function POST(request: NextRequest) {
  const { actor, role } = identityFromHeaders(request.headers);
  if (!hasRole(role, 'responder')) {
    return NextResponse.json({ error: 'Responder role required' }, { status: 403 });
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;

    if (body.action === 'start') {
      const template = runbookStore.getTemplate(String(body.templateId));
      if (!template) return NextResponse.json({ error: 'Runbook not found' }, { status: 404 });
      const execution = startExecution(template, (body.context as ExecutionContext) ?? { source: 'manual' }, actor);
      return NextResponse.json({ execution: runbookStore.saveExecution(execution) }, { status: 201 });
    }

    const execution = runbookStore.getExecution(String(body.id));
    const template = execution && runbookStore.getTemplate(execution.templateId);
    if (!execution || !template) return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
    const stepId = String(body.stepId ?? '');

    switch (body.action) {
      case 'evidence':
        return NextResponse.json({
          execution: runbookStore.saveExecution(
            addEvidence(template, execution, stepId, { kind: body.kind as EvidenceKind, label: String(body.label ?? ''), ref: String(body.ref ?? ''), addedBy: actor }),
          ),
        });
      case 'complete':
        return NextResponse.json({
          execution: runbookStore.saveExecution(
            completeStep(template, execution, stepId, actor, role, { outcome: body.outcome as string | undefined, notes: body.notes as string | undefined }),
          ),
        });
      case 'block':
        return NextResponse.json({ execution: runbookStore.saveExecution(blockStep(template, execution, stepId, actor, String(body.reason ?? 'Blocked'))) });
      case 'dry_run': {
        const { execution: next, preview } = dryRunAutomation(template, execution, stepId, actor);
        return NextResponse.json({ execution: runbookStore.saveExecution(next), preview });
      }
      case 'request_approval':
        return NextResponse.json({ execution: runbookStore.saveExecution(requestApproval(template, execution, stepId, actor)) });
      case 'approve':
        return NextResponse.json({ execution: runbookStore.saveExecution(approveStep(template, execution, stepId, actor, role)) });
      case 'feedback':
        return NextResponse.json({
          execution: runbookStore.saveExecution({
            ...execution,
            feedback: { helpful: Boolean(body.helpful), comment: String(body.comment ?? ''), suggestedChange: body.suggestedChange as string | undefined },
          }),
        });
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof RunbookError) {
      const status = error.code === 'FORBIDDEN' || error.code === 'SELF_APPROVAL' ? 403 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
