import type { DomainEvent } from '../DomainEvents';
export interface DomainWebhookSink { enqueue(event: DomainEvent): Promise<void> }
export function createWebhookSubscriber(sink: DomainWebhookSink) { return (event: DomainEvent) => sink.enqueue(event); }
