/*
 * validation.ts — #2300
 * Validation workflows: replay, multi-run determinism, environment
 * compatibility matrix, last-known-good tracking.
 */

export interface ValidationRun {
  id: string;
  fixtureId: string;
  runs: number;
  deterministic: boolean;
  compatibility?: Record<string, boolean>;
  lastValidatedAt?: string;
}
