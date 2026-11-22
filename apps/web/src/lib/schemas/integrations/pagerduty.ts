import { z } from 'zod';

export const PagerDutyTriggerSchema = z.object({
  runId: z.string().min(1, 'runId is required'),
  signature: z.string().min(1, 'signature is required'),
  summary: z.string().min(1, 'summary is required'),
  severity: z.string().optional(),
  integrationKey: z.string().optional(),
  details: z.record(z.any()).optional(),
});
