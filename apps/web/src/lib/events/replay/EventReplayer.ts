import type { DomainEvent } from '../DomainEvents';
import { EventStore, getEventStore } from '../EventStore';
import { upcastEvent } from '../EventVersioning';

export class EventReplayer {
  constructor(private readonly store: EventStore = getEventStore(), private readonly batchSize = 1000) {}
  async replay(consumer: (event: DomainEvent) => void | Promise<void>, options: { after?: number; aggregateId?: string; limit?: number } = {}): Promise<{ processed: number; lastSequence: number }> {
    let after = options.after ?? 0;
    let processed = 0;
    while (options.limit === undefined || processed < options.limit) {
      const remaining = options.limit === undefined ? this.batchSize : Math.min(this.batchSize, options.limit - processed);
      const batch = await this.store.read({ after, aggregateId: options.aggregateId, limit: remaining });
      if (!batch.length) break;
      for (const raw of batch) { const event = upcastEvent(raw); await consumer(event); after = event.sequence; processed += 1; }
      if (batch.length < remaining) break;
    }
    return { processed, lastSequence: after };
  }
}
