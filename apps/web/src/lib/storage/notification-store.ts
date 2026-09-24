import crypto from 'node:crypto';

export type NotificationEventType = 'run_failure' | 'flaky_detection' | 'campaign_completion';
export type DigestFrequency = 'immediate' | 'daily' | 'weekly';

export interface NotificationEvent {
  id: string;
  type: NotificationEventType;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  processedAt?: string | null;
}

export interface NotificationPreference {
  id: string;
  userId: string;
  emailDigestFrequency: DigestFrequency;
  enabledEventTypes: NotificationEventType[];
  createdAt: string;
  updatedAt: string;
}

export interface DigestEmail {
  id: string;
  userId: string;
  generatedAt: string;
  sentAt?: string | null;
  events: NotificationEvent[];
  eventCounts: Partial<Record<NotificationEventType, number>>;
}

let notificationStore: NotificationEvent[] = [];
const preferenceStore: Map<string, NotificationPreference> = new Map();
let digestStore: DigestEmail[] = [];

export function createNotificationEvent(params: {
  type: NotificationEventType;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
  nowMs?: number;
}): NotificationEvent {
  const id = `evt_${crypto.randomBytes(8).toString('hex')}`;
  const nowMs = params.nowMs ?? Date.now();
  const createdAt = new Date(nowMs).toISOString();

  const event: NotificationEvent = {
    id,
    type: params.type,
    title: params.title,
    description: params.description,
    metadata: params.metadata,
    createdAt,
    processedAt: null,
  };

  notificationStore.push(event);
  return event;
}

export function getUnprocessedEvents(eventType?: NotificationEventType): NotificationEvent[] {
  return notificationStore.filter(
    (evt) => !evt.processedAt && (!eventType || evt.type === eventType),
  );
}

export function markEventAsProcessed(eventId: string, nowMs = Date.now()): boolean {
  const event = notificationStore.find((e) => e.id === eventId);
  if (!event) return false;
  event.processedAt = new Date(nowMs).toISOString();
  return true;
}

export function setNotificationPreference(
  userId: string,
  params: {
    emailDigestFrequency?: DigestFrequency;
    enabledEventTypes?: NotificationEventType[];
    nowMs?: number;
  },
): NotificationPreference {
  const nowMs = params.nowMs ?? Date.now();
  const now = new Date(nowMs).toISOString();
  const existing = preferenceStore.get(userId);

  const preference: NotificationPreference = {
    id: existing?.id ?? `pref_${crypto.randomBytes(8).toString('hex')}`,
    userId,
    emailDigestFrequency: params.emailDigestFrequency ?? existing?.emailDigestFrequency ?? 'immediate',
    enabledEventTypes: params.enabledEventTypes ?? existing?.enabledEventTypes ?? ['run_failure'],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  preferenceStore.set(userId, preference);
  return preference;
}

export function getNotificationPreference(userId: string): NotificationPreference | undefined {
  return preferenceStore.get(userId);
}

export function createDigestEmail(params: {
  userId: string;
  events: NotificationEvent[];
  nowMs?: number;
}): DigestEmail {
  const nowMs = params.nowMs ?? Date.now();
  const generatedAt = new Date(nowMs).toISOString();
  const id = `digest_${crypto.randomBytes(8).toString('hex')}`;

  const eventCounts: Partial<Record<NotificationEventType, number>> = {};
  for (const event of params.events) {
    eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
  }

  const digest: DigestEmail = {
    id,
    userId: params.userId,
    generatedAt,
    sentAt: null,
    events: params.events,
    eventCounts,
  };

  digestStore.push(digest);
  return digest;
}

export function markDigestAsSent(digestId: string, nowMs = Date.now()): boolean {
  const digest = digestStore.find((d) => d.id === digestId);
  if (!digest) return false;
  digest.sentAt = new Date(nowMs).toISOString();
  return true;
}

export function listDigestEmails(userId: string, limit = 50): DigestEmail[] {
  return digestStore
    .filter((d) => d.userId === userId)
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
    .slice(0, limit);
}

export function resetNotificationStore(): void {
  notificationStore = [];
  preferenceStore.clear();
  digestStore = [];
}
