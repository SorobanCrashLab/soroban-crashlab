/*
 * versioning.ts — #2300
 * Fixture/reproducer revision history, diff between revisions and rollback
 * support (immutable audit trail for promotions).
 */

export interface FixtureRevision {
  id: string;
  fixtureId: string;
  revision: number;
  createdAt: string;
  note?: string;
}

export interface FixtureDiff {
  baseRevision: FixtureRevision;
  headRevision: FixtureRevision;
  changes: string[];
}
