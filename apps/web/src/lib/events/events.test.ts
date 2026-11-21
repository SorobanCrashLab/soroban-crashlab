import { describe, expect, it, beforeEach } from 'vitest';
import { EventBus } from './EventBus';
import { EventStore, InMemoryEventStoreAdapter } from './EventStore';
import { ProjectionManager } from './projections/ProjectionManager';
import { EventReplayer } from './replay/EventReplayer';

describe('domain event infrastructure', () => {
  let store: EventStore;
  beforeEach(() => { store = new EventStore(new InMemoryEventStoreAdapter()); });
  it('assigns ordered sequence numbers and deduplicates idempotency keys', async () => {
    const first = await store.append({ type: 'RunCreated', aggregateId: 'run-1', aggregateType: 'run', payload: {}, idempotencyKey: 'create-1' });
    const duplicate = await store.append({ type: 'RunCreated', aggregateId: 'run-1', aggregateType: 'run', payload: {}, idempotencyKey: 'create-1' });
    const second = await store.append({ type: 'RunStarted', aggregateId: 'run-1', aggregateType: 'run', payload: {} });
    expect(duplicate.id).toBe(first.id);
    expect([first.sequence, second.sequence]).toEqual([1, 2]);
  });
  it('isolates subscriber failures in the dead-letter queue and supports retry', async () => {
    const bus = new EventBus(store);
    let failed = true;
    bus.subscribe('test', async () => { if (failed) throw new Error('temporary'); });
    await bus.publish({ type: 'CrashDetected', aggregateId: 'run-1', aggregateType: 'run', payload: {} });
    expect(bus.listDeadLetters()).toHaveLength(1);
    failed = false;
    expect(await bus.retryDeadLetter(0)).toBe(true);
    expect(bus.listDeadLetters()).toHaveLength(0);
  });
  it('rebuilds read models from ordered events', async () => {
    await store.append({ type: 'RunCreated', aggregateId: 'r1', aggregateType: 'run', payload: { area: 'state' } });
    await store.append({ type: 'RunFailed', aggregateId: 'r1', aggregateType: 'run', payload: {} });
    const projections = new ProjectionManager();
    const replay = new EventReplayer(store);
    await replay.replay((event) => projections.apply(event));
    expect(projections.dashboard.get().totalRuns).toBe(1);
    expect(projections.dashboard.get().failed).toBe(1);
    expect(projections.runs.list()[0].status).toBe('failed');
  });
});
