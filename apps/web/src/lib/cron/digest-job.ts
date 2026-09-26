import {
  getUnprocessedEvents,
  markEventAsProcessed,
  getNotificationPreference,
  createDigestEmail,
  markDigestAsSent,
} from '../storage/notification-store';
import { DigestFrequency, NotificationEventType } from '../storage/notification-store';

interface DigestJobContext {
  userId: string;
  now: Date;
  frequency: DigestFrequency;
}

export function shouldRunDigestJob(context: DigestJobContext): boolean {
  if (context.frequency === 'immediate') {
    return false;
  }

  if (context.frequency === 'daily') {
    return context.now.getUTCHours() === 0;
  }

  if (context.frequency === 'weekly') {
    const dayOfWeek = context.now.getUTCDay();
    const hour = context.now.getUTCHours();
    return dayOfWeek === 1 && hour === 0;
  }

  return false;
}

export function prepareDigestForUser(userId: string): {
  digest: ReturnType<typeof createDigestEmail> | null;
  unreadEventIds: string[];
} {
  const preference = getNotificationPreference(userId);
  if (!preference) {
    return { digest: null, unreadEventIds: [] };
  }

  const unprocessedEvents = getUnprocessedEvents();
  const filteredEvents = unprocessedEvents.filter((evt) =>
    preference.enabledEventTypes.includes(evt.type as NotificationEventType)
  );

  if (filteredEvents.length === 0) {
    return { digest: null, unreadEventIds: [] };
  }

  const digest = createDigestEmail({
    userId,
    events: filteredEvents,
  });

  return {
    digest,
    unreadEventIds: filteredEvents.map((e) => e.id),
  };
}

export async function sendDigestEmail(
  digestId: string,
  userEmail: string,
  _subject: string,
  _htmlBody: string
): Promise<boolean> {
  try {
    const res = await fetch('/api/integrations/smtp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: userEmail,
        subject: _subject,
        htmlBody: _htmlBody,
      }),
    });

    if (res.ok) {
      markDigestAsSent(digestId);
      return true;
    }

    return false;
  } catch (error) {
    console.error('Failed to send digest email:', error);
    return false;
  }
}

export function markDigestEventsAsProcessed(eventIds: string[]): void {
  for (const id of eventIds) {
    markEventAsProcessed(id);
  }
}
