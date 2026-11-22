import type { DomainEvent } from '../DomainEvents';
import { getEventBus } from '../EventBus';

export async function publishRunEvent(type: 'RunCreated' | 'RunStarted' | 'RunProgressed' | 'RunCompleted' | 'RunFailed' | 'RunCancelled', runId: string, payload: Record<string, unknown>, idempotencyKey?: string): Promise<DomainEvent> {
  return getEventBus().publish({ type, aggregateId: runId, aggregateType: 'run', payload, ...(idempotencyKey ? { idempotencyKey } : {}) });
}
