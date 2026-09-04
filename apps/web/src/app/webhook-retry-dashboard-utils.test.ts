import * as assert from 'node:assert/strict';
import {
  filterDeliveryItems,
  computeDeliveryStats,
  retryDeliveryItem,
  formatStatusCode,
  getStatusBadgeClass,
  formatTimestamp,
  WebhookDeliveryHistoryItem,
} from './webhook-retry-dashboard-utils';

const TEST_ITEMS: WebhookDeliveryHistoryItem[] = [
  {
    id: 'del_1',
    webhookId: 'wh_1',
    url: 'https://example.com/webhook',
    eventType: 'run.failed',
    status: 'failed',
    statusCode: 500,
    attempts: 2,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
    error: 'HTTP 500 Server Error',
    payload: { runId: 'run_1' },
  },
  {
    id: 'del_2',
    webhookId: 'wh_2',
    url: 'https://hooks.slack.com/services/test',
    eventType: 'crash.detected',
    status: 'delivered',
    statusCode: 200,
    attempts: 1,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
    payload: { crashType: 'Overflow' },
  },
  {
    id: 'del_3',
    webhookId: 'wh_3',
    url: 'https://internal.ops/hook',
    eventType: 'run.started',
    status: 'queued',
    statusCode: 503,
    attempts: 1,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
    payload: { runId: 'run_2' },
  },
];

const runTests = (): void => {
  // Test filterDeliveryItems
  const allFiltered = filterDeliveryItems(TEST_ITEMS, 'all', '');
  assert.equal(allFiltered.length, 3, 'Filter all should return 3 items');

  const failedFiltered = filterDeliveryItems(TEST_ITEMS, 'failed', '');
  assert.equal(failedFiltered.length, 1, 'Filter failed should return 1 item');
  assert.equal(failedFiltered[0].id, 'del_1');

  const searchFiltered = filterDeliveryItems(TEST_ITEMS, 'all', 'slack');
  assert.equal(searchFiltered.length, 1, 'Search query "slack" should return 1 item');
  assert.equal(searchFiltered[0].id, 'del_2');

  // Test computeDeliveryStats
  const stats = computeDeliveryStats(TEST_ITEMS);
  assert.equal(stats.totalCount, 3, 'Total count should be 3');
  assert.equal(stats.deliveredCount, 1, 'Delivered count should be 1');
  assert.equal(stats.failedCount, 1, 'Failed count should be 1');
  assert.equal(stats.queuedCount, 1, 'Queued count should be 1');
  assert.equal(stats.successRate, 33, 'Success rate should be 33% (1/3)');

  // Test computeDeliveryStats empty array
  const emptyStats = computeDeliveryStats([]);
  assert.equal(emptyStats.totalCount, 0, 'Empty total count should be 0');
  assert.equal(emptyStats.successRate, 100, 'Empty success rate should default to 100%');

  // Test retryDeliveryItem
  const { updatedItems, retriedItem } = retryDeliveryItem(TEST_ITEMS, 'del_1');
  assert.ok(retriedItem, 'Retried item should exist');
  assert.equal(retriedItem.attempts, 3, 'Attempts should increment to 3');
  assert.equal(retriedItem.status, 'delivered', 'Retry should succeed and update status to delivered');
  assert.equal(retriedItem.statusCode, 200, 'Status code should be 200');

  // Test failed-to-delivered transition propagates to derived stats exactly.
  // After retrying del_1 (failed) -> delivered: total stays 3, delivered 1 -> 2,
  // and successRate rises from 33% (1/3) to exactly 67% (2/3).
  const afterRetryStats = computeDeliveryStats(updatedItems);
  assert.equal(afterRetryStats.totalCount, 3, 'Total count must not change when one item transitions failed->delivered');
  assert.equal(afterRetryStats.deliveredCount, 2, 'Delivered count should increase by exactly 1');
  assert.equal(afterRetryStats.failedCount, 0, 'Failed count should drop to 0');
  assert.equal(afterRetryStats.queuedCount, 1, 'Queued count should stay 1');
  assert.equal(afterRetryStats.successRate, 67, 'Success rate should update to 67% (2/3) after the transition');

  // Stats must be recomputed from the mutated item list, not the original snapshot.
  const originalStats = computeDeliveryStats(TEST_ITEMS);
  assert.notEqual(afterRetryStats.successRate, originalStats.successRate, 'Derived success rate must differ from pre-retry stats');

  // Test helper functions
  assert.equal(formatStatusCode(200), '200 OK', '200 should format to 200 OK');
  assert.equal(formatStatusCode(500), '500 Server Error', '500 should format to 500 Server Error');
  assert.equal(formatStatusCode(undefined), 'N/A', 'undefined status code should format to N/A');

  assert.equal(getStatusBadgeClass('delivered'), 'badge-completed');
  assert.equal(getStatusBadgeClass('failed'), 'badge-failed');
  assert.equal(getStatusBadgeClass('queued'), 'badge-running');

  assert.ok(formatTimestamp(new Date().toISOString()).length > 0, 'formatTimestamp should return string');
  assert.equal(formatTimestamp(undefined), 'N/A', 'undefined timestamp should return N/A');

  console.log('webhook-retry-dashboard-utils.test.ts: all assertions passed');
};

runTests();
