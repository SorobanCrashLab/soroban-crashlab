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
  WEBHOOK_RETRY_BACKOFF_BASE_MS,
  WEBHOOK_RETRY_BACKOFF_MAX_MS,
  WEBHOOK_RETRY_LEASE_MS,
  WEBHOOK_DLQ_DRAIN_BACKOFF_BASE_MS,
  WEBHOOK_DLQ_DRAIN_BACKOFF_MAX_MS,
  OUTBOUND_ATTEMPT_TIMEOUT_MS,
  OUTBOUND_TOTAL_BUDGET_MS,
  OUTBOUND_RETRY_BASE_MS,
  OUTBOUND_RETRY_MAX_MS,
  GRAFANA_FETCH_TIMEOUT_MS,
  SMTP_CONNECTION_TIMEOUT_MS,
  SMTP_GREETING_TIMEOUT_MS,
  SMTP_SOCKET_TIMEOUT_MS,
} from './timeouts';

// API routes → upstream backend: 10 s
{
  assert.strictEqual(API_FETCH_TIMEOUT_MS, 10_000);
}

// PagerDuty Events API: 4 s per attempt inside the outbound budget (#1633)
{
  assert.strictEqual(PAGERDUTY_FETCH_TIMEOUT_MS, 4_000);
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

// Durable webhook retry queue: 30 s base, 30 min cap, 60 s lease
{
  assert.strictEqual(WEBHOOK_RETRY_BACKOFF_BASE_MS, 30_000);
  assert.strictEqual(WEBHOOK_RETRY_BACKOFF_MAX_MS, 1_800_000);
  assert.strictEqual(WEBHOOK_RETRY_LEASE_MS, 60_000);
}

// Dead-letter drain rounds: 15 min base, 6 h cap
{
  assert.strictEqual(WEBHOOK_DLQ_DRAIN_BACKOFF_BASE_MS, 900_000);
  assert.strictEqual(WEBHOOK_DLQ_DRAIN_BACKOFF_MAX_MS, 21_600_000);
}

// Outbound httpCall policy: 4 s per attempt inside an 8 s total budget
{
  assert.strictEqual(OUTBOUND_ATTEMPT_TIMEOUT_MS, 4_000);
  assert.strictEqual(OUTBOUND_TOTAL_BUDGET_MS, 8_000);
  assert.strictEqual(OUTBOUND_RETRY_BASE_MS, 200);
  assert.strictEqual(OUTBOUND_RETRY_MAX_MS, 2_000);
  assert.ok(OUTBOUND_TOTAL_BUDGET_MS < 10_000, 'budget must fit the 10 s function limit');
  assert.strictEqual(GRAFANA_FETCH_TIMEOUT_MS, 4_000);
}

// SMTP: 5 s connect, 5 s greeting, 8 s socket idle
{
  assert.strictEqual(SMTP_CONNECTION_TIMEOUT_MS, 5_000);
  assert.strictEqual(SMTP_GREETING_TIMEOUT_MS, 5_000);
  assert.strictEqual(SMTP_SOCKET_TIMEOUT_MS, 8_000);
}

console.log('timeouts.test.ts: all assertions passed');
