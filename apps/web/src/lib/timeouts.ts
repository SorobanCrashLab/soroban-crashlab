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
// PagerDuty Events API (external vendor — same latency class as API routes)
// ---------------------------------------------------------------------------
export const PAGERDUTY_FETCH_TIMEOUT_MS = 10_000;

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
// Client-side polling intervals
// ---------------------------------------------------------------------------
export const NOTIFICATION_POLL_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Replay operations
// ---------------------------------------------------------------------------
export const REPLAY_TIMEOUT_MS = 30_000;
