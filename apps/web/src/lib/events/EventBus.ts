import type { DomainEvent, DomainEventType } from './DomainEvents';
import { EventStore, getEventStore } from './EventStore';

export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => void | Promise<void>;
export interface DeadLetter { event: DomainEvent; subscriber: string; error: string; failedAt: string; attempts: number }
type Subscription = { name: string; types?: ReadonlySet<DomainEventType>; handler: EventHandler };

/** In-process typed pub/sub with per-subscriber isolation and bounded DLQ retention. */
export class EventBus {
  private readonly subscriptions: Subscription[] = [];
  private readonly deadLetters: DeadLetter[] = [];
  constructor(private readonly store: EventStore = getEventStore(), private readonly maxDeadLetters = 1000) {}
  subscribe(name: string, handler: EventHandler, types?: readonly DomainEventType[]): () => void {
    const subscription: Subscription = { name, handler, types: types ? new Set(types) : undefined };
    this.subscriptions.push(subscription);
    return () => { const index = this.subscriptions.indexOf(subscription); if (index >= 0) this.subscriptions.splice(index, 1); };
  }
  async publish(event: Parameters<EventStore['append']>[0]): Promise<DomainEvent> {
    const stored = await this.store.append(event);
    await this.dispatch(stored);
    return stored;
  }
  async dispatch(event: DomainEvent): Promise<void> {
    await Promise.all(this.subscriptions.filter((s) => !s.types || s.types.has(event.type)).map(async (subscription) => {
      try { await subscription.handler(event); }
      catch (error) {
        this.deadLetters.push({ event, subscriber: subscription.name, error: error instanceof Error ? error.message : String(error), failedAt: new Date().toISOString(), attempts: 1 });
        if (this.deadLetters.length > this.maxDeadLetters) this.deadLetters.splice(0, this.deadLetters.length - this.maxDeadLetters);
      }
    }));
  }
  listDeadLetters(): readonly DeadLetter[] { return this.deadLetters.slice(); }
  async retryDeadLetter(index: number): Promise<boolean> {
    const item = this.deadLetters[index];
    if (!item) return false;
    const subscription = this.subscriptions.find((entry) => entry.name === item.subscriber);
    if (!subscription) return false;
    try { await subscription.handler(item.event); this.deadLetters.splice(index, 1); return true; }
    catch (error) { item.attempts += 1; item.error = error instanceof Error ? error.message : String(error); item.failedAt = new Date().toISOString(); return false; }
  }
}

let bus: EventBus | undefined;
export function getEventBus(): EventBus { return bus ??= new EventBus(); }
export function setEventBus(value: EventBus | undefined): void { bus = value; }
