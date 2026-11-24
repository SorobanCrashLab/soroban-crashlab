/**
 * Dataset adapter contract for the query builder (#2339).
 *
 * An adapter turns one backing store (run driver, log corpus, CI provider…)
 * into flat rows keyed by the unqualified field names declared in
 * `lib/schema.ts`. Adapters run server-side only; the browser never sees a
 * raw store, only the projected, redacted query result.
 */

import type { SourceRow } from '../lib/engine';
import type { EntityName } from '../lib/schema';

export interface DatasetAdapter {
  entity: EntityName;
  /** Where the rows come from, surfaced in the schema browser. */
  sourceLabel: string;
  load(): Promise<readonly SourceRow[]>;
}

export interface AdapterLoadResult {
  rows: readonly SourceRow[];
  error?: string;
}
