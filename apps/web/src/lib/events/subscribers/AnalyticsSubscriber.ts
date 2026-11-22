import type { DomainEvent } from '../DomainEvents';
export interface AnalyticsEventSink { increment(name: string, labels?: Record<string, string>): void | Promise<void> }
export function createAnalyticsSubscriber(sink: AnalyticsEventSink) {
  return async (event: DomainEvent) => sink.increment('domain_events_total', { type: event.type, aggregate: event.aggregateType });
}
