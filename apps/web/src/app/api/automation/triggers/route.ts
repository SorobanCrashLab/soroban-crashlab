import { successResponse } from '@/lib/api-response-utils';
import { SAMPLE_EVENTS, WORKFLOW_TRIGGERS } from '@/lib/automation/rules';

export function GET() {
  return successResponse({
    triggers: WORKFLOW_TRIGGERS,
    sampleEvents: SAMPLE_EVENTS,
  });
}
