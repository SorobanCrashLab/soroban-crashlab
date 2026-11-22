/**
 * Per-credential write limit for `POST /api/integrations/ci/results` (#1890).
 *
 * Lives outside the route module because Next.js route files may only export
 * route handlers and config.
 */

import { createFixedWindowLimiter } from '@/lib/fixed-window-limiter';

/** Posts per credential per minute; a workflow run posts once (plus retries). */
export const CI_RESULTS_RATE_LIMIT = 30;

export const ciResultsRateLimiter = createFixedWindowLimiter({
  limit: CI_RESULTS_RATE_LIMIT,
  windowMs: 60_000,
});
