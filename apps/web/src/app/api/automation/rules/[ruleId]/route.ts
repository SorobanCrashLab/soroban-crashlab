import { NextRequest } from 'next/server';
import { errorResponse, successResponse } from '@/lib/api-response-utils';
import { readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import { resolvePrincipal } from '@/lib/rbac';
import { workflowRulePatchSchema, updateWorkflowRule } from '@/lib/automation/rules';
import { automationStore } from '@/lib/automation/store';

type RouteContext = { params: Promise<{ ruleId: string }> };

export const dynamic = 'force-dynamic';

export const GET = withRouteErrorHandling(
  'GET /api/automation/rules/[ruleId]',
  async (request: NextRequest, context: RouteContext) => {
    const [{ ruleId }, principal] = await Promise.all([context.params, resolvePrincipal(request)]);
    const rule = await automationStore.getRule(principal.subject, ruleId);
    return rule ? successResponse({ rule }) : errorResponse('Workflow rule not found.', 404);
  },
);

export const PATCH = withRouteErrorHandling(
  'PATCH /api/automation/rules/[ruleId]',
  async (request: NextRequest, context: RouteContext) => {
    const [{ ruleId }, principal] = await Promise.all([context.params, resolvePrincipal(request)]);
    const current = await automationStore.getRule(principal.subject, ruleId);
    if (!current) return errorResponse('Workflow rule not found.', 404);

    const parsedBody = await readJsonBody(request);
    if ('error' in parsedBody) return parsedBody.error;
    const parsed = workflowRulePatchSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      return errorResponse(`Invalid workflow rule update: ${parsed.error.issues[0]?.message ?? 'check the supplied fields.'}`, 422);
    }

    const updated = updateWorkflowRule(current, parsed.data, new Date().toISOString(), principal.subject);
    if (updated !== current) await automationStore.saveRule(principal.subject, updated, false);
    return successResponse({ rule: updated });
  },
);

export const DELETE = withRouteErrorHandling(
  'DELETE /api/automation/rules/[ruleId]',
  async (request: NextRequest, context: RouteContext) => {
    const [{ ruleId }, principal] = await Promise.all([context.params, resolvePrincipal(request)]);
    const removed = await automationStore.deleteRule(principal.subject, ruleId);
    return removed ? successResponse({ deleted: ruleId }) : errorResponse('Workflow rule not found.', 404);
  },
);
