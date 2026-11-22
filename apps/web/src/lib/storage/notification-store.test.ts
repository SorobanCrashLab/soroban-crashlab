import { describe, it, expect, beforeEach } from 'vitest';
import {
  createNotificationEvent,
  getUnprocessedEvents,
  markEventAsProcessed,
  setNotificationPreference,
  getNotificationPreference,
  createDigestEmail,
  markDigestAsSent,
  listDigestEmails,
  resetNotificationStore,
} from './notification-store';

describe('Notification Store', () => {
  beforeEach(() => {
    resetNotificationStore();
  });

  it('should create notification events', () => {
    const event = createNotificationEvent({
      type: 'run_failure',
      title: 'Run Failed',
      description: 'Contract deploy failed',
    });

    expect(event.id).toBeDefined();
    expect(event.type).toBe('run_failure');
    expect(event.processedAt).toBeNull();
  });

  it('should retrieve unprocessed events', () => {
    createNotificationEvent({
      type: 'run_failure',
      title: 'Failure 1',
      description: 'Test',
    });
    createNotificationEvent({
      type: 'flaky_detection',
      title: 'Flaky Test',
      description: 'Test is flaky',
    });

    const unprocessed = getUnprocessedEvents();
    expect(unprocessed).toHaveLength(2);
  });

  it('should mark events as processed', () => {
    const event = createNotificationEvent({
      type: 'run_failure',
      title: 'Test',
      description: 'Test',
    });

    markEventAsProcessed(event.id);
    const unprocessed = getUnprocessedEvents();
    expect(unprocessed).toHaveLength(0);
  });

  it('should set and retrieve notification preferences', () => {
    const pref = setNotificationPreference('user-123', {
      emailDigestFrequency: 'daily',
      enabledEventTypes: ['run_failure', 'flaky_detection'],
    });

    expect(pref.emailDigestFrequency).toBe('daily');
    expect(pref.enabledEventTypes).toContain('run_failure');

    const retrieved = getNotificationPreference('user-123');
    expect(retrieved).toBeDefined();
    expect(retrieved?.emailDigestFrequency).toBe('daily');
  });

  it('should create digest emails', () => {
    const event1 = createNotificationEvent({
      type: 'run_failure',
      title: 'Failure',
      description: 'Test',
    });
    const event2 = createNotificationEvent({
      type: 'run_failure',
      title: 'Failure 2',
      description: 'Test',
    });

    const digest = createDigestEmail({
      userId: 'user-123',
      events: [event1, event2],
    });

    expect(digest.id).toBeDefined();
    expect(digest.events).toHaveLength(2);
    expect(digest.eventCounts.run_failure).toBe(2);
    expect(digest.sentAt).toBeNull();
  });

  it('should mark digest as sent', () => {
    const event = createNotificationEvent({
      type: 'run_failure',
      title: 'Test',
      description: 'Test',
    });

    const digest = createDigestEmail({
      userId: 'user-123',
      events: [event],
    });

    markDigestAsSent(digest.id);

    const digests = listDigestEmails('user-123');
    expect(digests[0].sentAt).toBeDefined();
  });
});
