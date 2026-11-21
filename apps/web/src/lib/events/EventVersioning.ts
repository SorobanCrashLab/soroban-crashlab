import type { DomainEventType } from './DomainEvents';

export const CURRENT_EVENT_VERSION = 1;
export type EventUpcaster = (payload: Record<string, unknown>) => Record<string, unknown>;
const upcasters = new Map<string, EventUpcaster>();

/** Register a deterministic vN -> vN+1 payload migration during application startup. */
export function registerEventUpcaster(type: DomainEventType, fromVersion: number, upcaster: EventUpcaster): void {
  if (!Number.isInteger(fromVersion) || fromVersion < 1) throw new Error('fromVersion must be a positive integer');
  const key = `${type}:${fromVersion}`;
  if (upcasters.has(key)) throw new Error(`Upcaster already registered for ${key}`);
  upcasters.set(key, upcaster);
}

export function upcastEvent<T extends { type: DomainEventType; version: number; payload: Record<string, unknown> }>(event: T) {
  let { version, payload } = event;
  while (version < CURRENT_EVENT_VERSION) {
    const upcaster = upcasters.get(`${event.type}:${version}`);
    if (!upcaster) throw new Error(`No upcaster registered for ${event.type} version ${version}`);
    payload = upcaster(payload);
    version += 1;
  }
  if (version > CURRENT_EVENT_VERSION) throw new Error(`Event ${event.type} version ${version} is newer than this service supports`);
  return { ...event, version, payload };
}
