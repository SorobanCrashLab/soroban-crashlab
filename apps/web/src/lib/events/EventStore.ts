import { DomainEventSchema, type DomainEvent, type NewDomainEvent } from './DomainEvents';
import { readPositiveIntegerEnv } from '@/lib/storage/record-driver';

export interface EventStoreAdapter {
  /** Adapter must atomically assign a strictly increasing sequence per aggregate. */
  append(event: DomainEvent): Promise<DomainEvent>;
  read(options?: { after?: number; aggregateId?: string; limit?: number }): Promise<DomainEvent[]>;
}

/** Single-process adapter for development and tests. Configure a durable atomic adapter in multi-instance deployments. */
export class InMemoryEventStoreAdapter implements EventStoreAdapter {
  private readonly events: DomainEvent[] = [];
  private readonly idempotency = new Map<string, DomainEvent>();
  private tail: Promise<void> = Promise.resolve();
  async append(input: DomainEvent): Promise<DomainEvent> {
    let result!: DomainEvent;
    const work = this.tail.then(() => {
      const key = input.idempotencyKey ? `${input.aggregateId}:${input.idempotencyKey}` : undefined;
      const prior = key ? this.idempotency.get(key) : undefined;
      if (prior) { result = prior; return; }
      const sequence = (this.events.filter((event) => event.aggregateId === input.aggregateId).at(-1)?.sequence ?? 0) + 1;
      result = DomainEventSchema.parse({ ...input, sequence });
      this.events.push(result);
      if (key) this.idempotency.set(key, result);
    });
    this.tail = work.catch(() => undefined);
    await work;
    return result;
  }
  async read(options: { after?: number; aggregateId?: string; limit?: number } = {}): Promise<DomainEvent[]> {
    await this.tail;
    const limit = Math.max(1, Math.min(options.limit ?? 1000, 10_000));
    return this.events.filter((event) => event.sequence > (options.after ?? 0) && (!options.aggregateId || event.aggregateId === options.aggregateId))
      .slice(0, limit).map((event) => ({ ...event, payload: { ...event.payload } }));
  }
}

export class EventStore {
  constructor(private readonly adapter: EventStoreAdapter, readonly retentionDays = readPositiveIntegerEnv('EVENT_STORE_RETENTION_DAYS', 365)) {}
  async append(input: NewDomainEvent): Promise<DomainEvent> {
    const candidate = DomainEventSchema.parse({
      ...input,
      id: input.id ?? globalThis.crypto.randomUUID(),
      sequence: input.sequence ?? 1,
      version: input.version ?? 1,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
    });
    return this.adapter.append(candidate);
  }
  read(options?: { after?: number; aggregateId?: string; limit?: number }): Promise<DomainEvent[]> {
    return this.adapter.read(options);
  }
}

let singleton: EventStore | undefined;
export function getEventStore(): EventStore { return singleton ??= new EventStore(new InMemoryEventStoreAdapter()); }
export function setEventStore(store: EventStore | undefined): void { singleton = store; }
