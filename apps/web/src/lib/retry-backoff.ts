/**
 * Shared exponential-backoff-with-jitter calculation.
 *
 * Used by the durable webhook retry queue (#1635) and the outbound `httpCall`
 * wrapper (#1633) so both retry paths space attempts the same way.
 *
 * "Equal jitter": the delay for attempt N is drawn uniformly from
 * [cap/2, cap] where cap = min(maxMs, baseMs * 2^(N-1)). Keeping a floor of
 * half the window means a burst of failures never collapses into immediate
 * retries, while the random upper half spreads a burst out so every failed
 * delivery to the same receiver does not come back at the same instant.
 */

export interface BackoffPolicy {
  /** Delay window for the first retry. */
  baseMs: number;
  /** Upper bound on any single delay. */
  maxMs: number;
}

/**
 * @param attempt 1-based number of the attempt that just failed.
 * @param random  Injected for deterministic tests; defaults to Math.random.
 */
export function computeBackoffMs(
  attempt: number,
  policy: BackoffPolicy,
  random: () => number = Math.random,
): number {
  const exponent = Math.max(0, Math.floor(attempt) - 1);
  const window = Math.min(policy.maxMs, policy.baseMs * 2 ** exponent);
  const half = window / 2;
  return Math.round(half + random() * half);
}
