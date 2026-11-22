/**
 * Centralized timeout-policy constants for network-related durations.
 *
 * Every fetch / poll / retry timeout in the codebase must reference a named
 * constant from this module instead of embedding a raw numeric literal.
 * Changing a value here is an intentional policy decision — the pinning
 * tests will break if you adjust any value, prompting a conscious review.
 *
 * Domain distinctions are load-bearing: API routes talk to a heavier upstream
 * backend (10 s), webhook delivery hits external HTTP endpoints (5 s),
 * and notification polling runs at a client-visible cadence (30 s).
 */

// ---------------------------------------------------------------------------
// API routes → upstream backend
// ---------------------------------------------------------------------------
export const API_FETCH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// PagerDuty Events API — per-attempt timeout under the `httpCall` budget
// (#1633). Was 10 s: a single attempt could consume the entire 10 s function
// limit, leaving no room for a retry or for the route to answer.
// ---------------------------------------------------------------------------
export const PAGERDUTY_FETCH_TIMEOUT_MS = 4_000;

// ---------------------------------------------------------------------------
// Webhook delivery → external HTTP callbacks
// ---------------------------------------------------------------------------
export const WEBHOOK_DELIVERY_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Prometheus metrics endpoint
// ---------------------------------------------------------------------------
export const PROMETHEUS_FETCH_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Webhook retry policy
// ---------------------------------------------------------------------------
export const WEBHOOK_DELIVERY_RETRY_BASE_MS = 250;
export const WEBHOOK_MANAGER_BACKOFF_BASE_MS = 100;

// ---------------------------------------------------------------------------
// Durable webhook retry queue (#1635) — attempts run on the recovery tick,
// never inline, so these delays are wall-clock gaps between ticks.
// ---------------------------------------------------------------------------
export const WEBHOOK_RETRY_BACKOFF_BASE_MS = 30_000;
export const WEBHOOK_RETRY_BACKOFF_MAX_MS = 30 * 60_000;
/** A claimed job whose tick died is reclaimable once its lease lapses. */
export const WEBHOOK_RETRY_LEASE_MS = 60_000;
/** Spacing between automatic dead-letter drain rounds. */
export const WEBHOOK_DLQ_DRAIN_BACKOFF_BASE_MS = 15 * 60_000;
export const WEBHOOK_DLQ_DRAIN_BACKOFF_MAX_MS = 6 * 60 * 60_000;

// ---------------------------------------------------------------------------
// Outbound third-party calls via `httpCall` (#1633). The total budget covers
// every attempt plus backoff, so a hung provider can never hold a serverless
// function past its 10 s platform limit.
// ---------------------------------------------------------------------------
export const OUTBOUND_ATTEMPT_TIMEOUT_MS = 4_000;
export const OUTBOUND_TOTAL_BUDGET_MS = 8_000;
export const OUTBOUND_RETRY_BASE_MS = 200;
export const OUTBOUND_RETRY_MAX_MS = 2_000;
export const GRAFANA_FETCH_TIMEOUT_MS = 4_000;

// ---------------------------------------------------------------------------
// SMTP (nodemailer) — connection, greeting and idle-socket limits.
// ---------------------------------------------------------------------------
export const SMTP_CONNECTION_TIMEOUT_MS = 5_000;
export const SMTP_GREETING_TIMEOUT_MS = 5_000;
export const SMTP_SOCKET_TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// Client-side polling intervals
// ---------------------------------------------------------------------------
export const NOTIFICATION_POLL_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Replay operations
// ---------------------------------------------------------------------------
export const REPLAY_TIMEOUT_MS = 30_000;
