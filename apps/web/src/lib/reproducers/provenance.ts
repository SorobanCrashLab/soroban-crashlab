/*
 * provenance.ts — #2300
 * Deterministic provenance records for reproducers/fixtures: origin run,
 * commit/env fingerprint, contract(s), seed/call sequence, expected outcome.
 */

export interface FixtureProvenance {
  originRunId: string;
  commit: string;
  environmentFingerprint: string;
  seed?: string;
  createdAt: string;
}
