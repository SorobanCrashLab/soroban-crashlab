import type { DomainEvent } from '../DomainEvents';
import { getEventBus } from '../EventBus';

export async function publishTriageEvent(type: 'TriageItemCreated' | 'TriageAssigned' | 'TriageStatusChanged' | 'TriageCompleted' | 'TriageCommentAdded' | 'TriageLabelChanged', itemId: string, payload: Record<string, unknown>, idempotencyKey?: string): Promise<DomainEvent> {
  return getEventBus().publish({ type, aggregateId: itemId, aggregateType: 'triage-item', payload, ...(idempotencyKey ? { idempotencyKey } : {}) });
}
