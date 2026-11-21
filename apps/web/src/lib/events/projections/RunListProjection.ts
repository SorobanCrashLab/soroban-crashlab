import type { DomainEvent } from '../DomainEvents';
export class RunListProjection {
  private readonly runs = new Map<string, Record<string, unknown>>();
  apply(event: DomainEvent): void {
    if (event.aggregateType !== 'run') return;
    if (event.type === 'RunDeleted') { this.runs.delete(event.aggregateId); return; }
    const previous = this.runs.get(event.aggregateId) ?? { id: event.aggregateId };
    const status = event.type === 'RunStarted' ? 'running' : event.type === 'RunCompleted' ? 'completed' : event.type === 'RunFailed' ? 'failed' : event.type === 'RunCancelled' ? 'cancelled' : undefined;
    this.runs.set(event.aggregateId, { ...previous, ...event.payload, ...(status ? { status } : {}), id: event.aggregateId, updatedAt: event.occurredAt, sequence: event.sequence });
  }
  list(): Record<string, unknown>[] { return [...this.runs.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))); }
  reset(): void { this.runs.clear(); }
}
