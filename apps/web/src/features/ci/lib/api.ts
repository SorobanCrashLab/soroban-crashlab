/**
 * Wire contracts for the two CI dashboard endpoints (#2314).
 *
 * Both routes return the standard `{ data, total }` envelope from
 * `lib/api-response-utils`. These types are shared by the server handlers and
 * the client hook so a field rename fails at compile time on both sides.
 */

import type { Correlation } from './correlation';
import type { FlakeScore } from './flake';
import type { GateEvaluation } from './gates';
import type {
  ChangeRecord,
  CiGatePolicy,
  CiQuery,
  CiRun,
  CiSnapshot,
  IncidentRecord,
  RegressionRecord,
} from './model';
import type { CiPermissions, CiRole } from './permissions';

export interface CiRequestMeta {
  query: CiQuery;
  role: CiRole;
  subject: string;
  permissions: CiPermissions;
}

export interface CiSnapshotMeta {
  repository: string;
  source: CiSnapshot['source'];
  generatedAt: string;
  policy: CiGatePolicy;
}

export interface CiRunsPayload extends CiRequestMeta, CiSnapshotMeta {
  /** Latest attempt of every logical run that matched the query. */
  runs: CiRun[];
  /** Older attempts, keyed by the id of the winning run in `runs`. */
  history: Record<string, CiRun[]>;
  regressions: RegressionRecord[];
  incidents: IncidentRecord[];
  changes: ChangeRecord[];
}

export interface CiGatesPayload extends CiRequestMeta, CiSnapshotMeta {
  evaluation: GateEvaluation;
  /** Scored from latest runs plus their rerun history. */
  flakes: FlakeScore[];
  correlations: Correlation[];
}

export interface ApiEnvelope<T> {
  data: T;
  total?: number;
}
