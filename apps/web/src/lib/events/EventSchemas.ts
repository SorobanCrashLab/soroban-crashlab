import { z } from 'zod';
import { DOMAIN_EVENT_TYPES, DomainEventSchema, type DomainEventType } from './DomainEvents';

const payload = z.record(z.unknown());
const base = { version: z.number().int().positive(), payload };

/** Per-event Zod validators. Specific payload schemas can tighten these without changing the envelope. */
export const EventSchemas = Object.fromEntries(
  DOMAIN_EVENT_TYPES.map((type) => [type, z.object({ type: z.literal(type), ...base })]),
) as { [K in DomainEventType]: z.ZodType<{ type: K; version: number; payload: Record<string, unknown> }> };

export const EventEnvelopeSchema = DomainEventSchema;
export function validateEventPayload(type: DomainEventType, input: unknown): Record<string, unknown> {
  return EventSchemas[type].parse({ type, version: 1, payload: input }).payload;
}
