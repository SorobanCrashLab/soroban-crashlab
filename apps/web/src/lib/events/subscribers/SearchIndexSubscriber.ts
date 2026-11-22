import type { DomainEvent } from '../DomainEvents';
export interface SearchEventSink { upsert(event: DomainEvent): Promise<void>; remove(event: DomainEvent): Promise<void> }
export function createSearchIndexSubscriber(sink: SearchEventSink) {
  return (event: DomainEvent) => event.type === 'RunDeleted' ? sink.remove(event) : sink.upsert(event);
}
