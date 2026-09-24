import { describe, it, expect, beforeEach } from 'vitest';
import {
  createNotificationEvent,
  getUnprocessedEvents,
  pruneNotificationEvents,
  resetNotificationStore,
} from './storage/notification-store';
import { WebhookStore, resetWebhookStore } from './webhook-store';
import fs from 'node:fs';
import path from 'node:path';

describe('Retention TTL Enforcement', () => {
  beforeEach(() => {
    resetNotificationStore();
    resetWebhookStore();
  });

  describe('Notification store retention', () => {
    it('prunes events older than TTL boundary', () => {
      const nowMs = 1_000_000_000_000;
      const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

      // Old event (91 days ago)
      createNotificationEvent({
        type: 'run_failure',
        title: 'Old Failure',
        description: 'Should be pruned',
        nowMs: nowMs - ninetyDaysMs - 1000,
      });

      // Recent event (10 days ago)
      createNotificationEvent({
        type: 'run_failure',
        title: 'Recent Failure',
        description: 'Should be kept',
        nowMs: nowMs - 10 * 24 * 60 * 60 * 1000,
      });

      const { prunedCount } = pruneNotificationEvents({ ttlDays: 90, nowMs });
      expect(prunedCount).toBe(1);

      const remaining = getUnprocessedEvents();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].title).toBe('Recent Failure');
    });

    it('respects batch size limits per tick', () => {
      const nowMs = 1_000_000_000_000;
      const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

      for (let i = 0; i < 5; i++) {
        createNotificationEvent({
          type: 'run_failure',
          title: `Old ${i}`,
          description: 'Old',
          nowMs: nowMs - ninetyDaysMs - 1000,
        });
      }

      const { prunedCount } = pruneNotificationEvents({ ttlDays: 90, maxBatchSize: 2, nowMs });
      expect(prunedCount).toBe(2);
      expect(getUnprocessedEvents()).toHaveLength(3);
    });

    it('escapes when retention is disabled (ttlDays <= 0)', () => {
      const nowMs = 1_000_000_000_000;

      createNotificationEvent({
        type: 'run_failure',
        title: 'Old Failure',
        description: 'Should be kept',
        nowMs: nowMs - 100 * 24 * 60 * 60 * 1000,
      });

      const { prunedCount } = pruneNotificationEvents({ ttlDays: 0, nowMs });
      expect(prunedCount).toBe(0);
      expect(getUnprocessedEvents()).toHaveLength(1);
    });
  });

  describe('Webhook store delivery log retention', () => {
    const testDir = path.join(__dirname, '__retention_test_webhook_data__');

    beforeEach(() => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('prunes delivery logs older than TTL boundary', () => {
      const store = new WebhookStore(testDir);
      const nowMs = 1_000_000_000_000;
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      store.addDeliveryLog({
        webhookId: 'wh-old',
        success: true,
        retryCount: 0,
        timestamp: new Date(nowMs - thirtyDaysMs - 5000).toISOString(),
      });

      store.addDeliveryLog({
        webhookId: 'wh-recent',
        success: true,
        retryCount: 0,
        timestamp: new Date(nowMs - 5 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const { prunedCount } = store.pruneDeliveryLog({ ttlDays: 30, nowMs });
      expect(prunedCount).toBe(1);

      const logs = store.getDeliveryLog('wh-recent');
      expect(logs).toHaveLength(1);
      expect(store.getDeliveryLog('wh-old')).toHaveLength(0);
    });
  });
});
