/** Shared structured log model used by the query engine, APIs and UI (#075). */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEvent {
  id: string;
  timestamp: number;
  level: LogLevel;
  source: string;
  message: string;
  contract?: string;
  run_id?: string;
  campaign_id?: string;
  trace_id?: string;
  span_id?: string;
  error_code?: string;
  incident_id?: string;
  artifact_id?: string;
  /** Arbitrary structured fields; also searchable through the DSL. */
  attributes: Record<string, string | number | boolean>;
  /** Field paths masked for the current viewer by the redaction policy. */
  redacted?: string[];
  /** Sensitive paths present in the original event (whether masked or not). */
  sensitiveFields?: string[];
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface FacetResult {
  field: string;
  values: FacetValue[];
}

export interface HistogramBucket {
  timestamp: number;
  count: number;
  levels: Partial<Record<LogLevel, number>>;
}

export interface SearchStats {
  total: number;
  scanned: number;
  tookMs: number;
  /** True when the server capped a broad query and returned a partial result. */
  partial: boolean;
}

export interface LogSearchResponse {
  events: LogEvent[];
  nextCursor: string | null;
  facets: FacetResult[];
  histogram: HistogramBucket[];
  stats: SearchStats;
  /** Canonical form of the query the server actually executed. */
  canonicalQuery: string;
}

export interface TailNotice {
  kind: 'sampled' | 'dropped' | 'backpressure';
  message: string;
  count: number;
}

export interface LogTailResponse {
  events: LogEvent[];
  cursor: string;
  rate: number;
  notices: TailNotice[];
  serverTime: number;
}

export interface QueryState {
  query: string;
  from: number;
  to: number;
  facets: Record<string, string[]>;
  sort: 'asc' | 'desc';
  mode: 'historical' | 'live';
  histogramRange: [number, number] | null;
}

export interface SavedQuery {
  id: string;
  name: string;
  state: QueryState;
  createdAt: number;
}
