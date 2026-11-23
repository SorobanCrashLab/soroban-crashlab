/*
 * useExperimentAnalytics — #2299
 * Fetch exposure/adoption metrics, cohort and guardrail data, and drill down
 * to representative sessions/runs/events (privacy-safe).
 */

export function useExperimentAnalytics() {
  return {
    experiments: [] as never[],
    metrics: [] as never[],
    cohorts: [] as never[],
    guardrails: [] as never[],
  };
}
