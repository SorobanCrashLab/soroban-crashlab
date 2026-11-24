/*
 * privacy.ts — #2299
 * Privacy-by-design helpers: consent/opt-out, PII minimization and
 * aggregation thresholds.
 */

export function hasUserConsent(user: { consentGiven?: boolean }): boolean {
  return user.consentGiven === true;
}

export function aggregationThreshold(value = 10): number {
  return value;
}
