/**
 * Pinning tests for timeout-policy constants.
 *
 * Every constant in timeouts.ts is intentionally pinned to a specific value.
 * If you need to adjust a timeout, you MUST update both the constant AND
 * the corresponding test here — the test failure is a deliberate speed-bump
 * that forces conscious review of the policy change.
 */
import * as assert from 'node:assert/strict';
import {
  API_FETCH_TIMEOUT_MS,
  PAGERDUTY_FETCH_TIMEOUT_MS,
  WEBHOOK_DELIVERY_TIMEOUT_MS,
  PROMETHEUS_FETCH_TIMEOUT_MS,
  WEBHOOK_DELIVERY_RETRY_BASE_MS,
  WEBHOOK_MANAGER_BACKOFF_BASE_MS,
  NOTIFICATION_POLL_INTERVAL_MS,
  REPLAY_TIMEOUT_MS,
} from './timeouts';

// API routes → upstream backend: 10 s
{
  assert.strictEqual(API_FETCH_TIMEOUT_MS, 10_000);
}

// PagerDuty Events API: 10 s
{
  assert.strictEqual(PAGERDUTY_FETCH_TIMEOUT_MS, 10_000);
}

// Webhook delivery → external callbacks: 5 s
{
  assert.strictEqual(WEBHOOK_DELIVERY_TIMEOUT_MS, 5_000);
}

// Prometheus metrics endpoint: 5 s
{
  assert.strictEqual(PROMETHEUS_FETCH_TIMEOUT_MS, 5_000);
}

// Webhook delivery retry backoff base: 250 ms
{
  assert.strictEqual(WEBHOOK_DELIVERY_RETRY_BASE_MS, 250);
}

// Webhook manager exponential backoff base: 100 ms
{
  assert.strictEqual(WEBHOOK_MANAGER_BACKOFF_BASE_MS, 100);
}

// Notification center poll interval: 30 s
{
  assert.strictEqual(NOTIFICATION_POLL_INTERVAL_MS, 30_000);
}

// Replay default timeout: 30 s
{
  assert.strictEqual(REPLAY_TIMEOUT_MS, 30_000);
}

console.log('timeouts.test.ts: all assertions passed');
