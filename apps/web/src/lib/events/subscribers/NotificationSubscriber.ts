import type { DomainEvent } from '../DomainEvents';
export async function handleNotificationEvent(_event: DomainEvent): Promise<void> {
  // Notification delivery is deliberately injected by deployments; this subscriber is a safe extension point.
}
