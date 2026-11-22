import { NextRequest } from 'next/server';
import { errorResponse, successResponse } from '@/lib/api-response-utils';
import { readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import { resolvePrincipal } from '@/lib/rbac';
import {
  createWorkflowRule,
  MAX_WORKFLOW_RULES,
  workflowRuleInputSchema,
} from '@/lib/automation/rules';
import { automationStore } from '@/lib/automation/store';

export const dynamic = 'force-dynamic';

export const GET = withRouteErrorHandling(
  'GET /api/automation/rules',
  async (request: NextRequest) => {
    const principal = await resolvePrincipal(request);
    const rules = await automationStore.listRules(principal.subject);
    return successResponse({ rules });
  },
);

export const POST = withRouteErrorHandling(
  'POST /api/automation/rules',
  async (request: NextRequest) => {
    const principal = await resolvePrincipal(request);
    const parsedBody = await readJsonBody(request);
    if ('error' in parsedBody) return parsedBody.error;

    const parsed = workflowRuleInputSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      return errorResponse(`Invalid workflow rule: ${parsed.error.issues[0]?.message ?? 'check the supplied fields.'}`, 422);
    }

    if ((await automationStore.listRules(principal.subject)).length >= MAX_WORKFLOW_RULES) {
      return errorResponse(`A maximum of ${MAX_WORKFLOW_RULES} workflow rules is allowed.`, 409);
    }

    const now = new Date().toISOString();
    const rule = createWorkflowRule(parsed.data, crypto.randomUUID(), now, principal.subject);
    await automationStore.saveRule(principal.subject, rule, true);
    return successResponse({ rule }, { status: 201 });
  },
);
