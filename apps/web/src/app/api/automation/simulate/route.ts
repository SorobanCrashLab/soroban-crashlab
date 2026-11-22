import { NextRequest } from 'next/server';
import { errorResponse, successResponse } from '@/lib/api-response-utils';
import { readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import { resolvePrincipal } from '@/lib/rbac';
import {
  SAMPLE_EVENTS,
  simulateWorkflowRule,
} from '@/lib/automation/rules';
import { automationStore } from '@/lib/automation/store';
import { z } from 'zod';

const simulationRequestSchema = z.object({
  ruleId: z.string().min(1).max(100),
  eventId: z.enum(SAMPLE_EVENTS.map(({ id }) => id) as [typeof SAMPLE_EVENTS[number]['id'], ...typeof SAMPLE_EVENTS[number]['id'][]]),
});

export const POST = withRouteErrorHandling(
  'POST /api/automation/simulate',
  async (request: NextRequest) => {
    const principal = await resolvePrincipal(request);
    const parsedBody = await readJsonBody(request);
    if ('error' in parsedBody) return parsedBody.error;
    const parsed = simulationRequestSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      return errorResponse('Choose a saved rule and a supported sample event.', 422);
    }

    const rule = await automationStore.getRule(principal.subject, parsed.data.ruleId);
    if (!rule) return errorResponse('Workflow rule not found.', 404);
    const event = SAMPLE_EVENTS.find(({ id }) => id === parsed.data.eventId);
    if (!event) return errorResponse('Sample event not found.', 404);

    const result = simulateWorkflowRule(rule, event);
    await automationStore.appendExecution(principal.subject, result, principal.subject);
    return successResponse({ result });
  },
);
