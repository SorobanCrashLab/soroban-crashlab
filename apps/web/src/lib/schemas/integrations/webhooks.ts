import { z } from 'zod';
import { RunEventType } from '@/app/webhook-manager';

const VALID_EVENT_TYPES = new Set<RunEventType>([
  'run.started',
  'run.progressing',
  'run.completed',
  'run.failed',
  'run.cancelled',
  'crash.detected',
]);

const urlSchema = z.string().url().refine((url) => {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}, 'Must be a valid http or https URL');

const eventsSchema = z.array(z.string()).min(1).refine(
  (events) => events.every((e) => VALID_EVENT_TYPES.has(e as RunEventType)),
  `Events must be one of: ${[...VALID_EVENT_TYPES].join(', ')}`
);

export const WebhookCreateSchema = z.object({
  id: z.string().trim().min(1),
  url: urlSchema,
  events: eventsSchema,
  active: z.boolean(),
  secret: z.string().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  timeoutMs: z.number().int().positive().optional(),
  headers: z.record(z.string()).optional(),
}).strip();

export const WebhookUpdateSchema = z.object({
  url: urlSchema.optional(),
  events: eventsSchema.optional(),
  active: z.boolean().optional(),
  secret: z.string().nullable().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  timeoutMs: z.number().int().positive().optional(),
  headers: z.record(z.string()).nullable().optional(),
}).strip();
