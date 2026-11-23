/**
 * Core model for the rich technical report editor (issue #2313).
 *
 * Reports are Markdown-first: the Markdown string is the source of truth and
 * rich blocks are stored as deterministic fenced directives inside it. The
 * structured fields below are metadata that make embeds, comments and version
 * history addressable without parsing the Markdown on every keystroke.
 */

export const REPORT_DOCUMENT_VERSION = 1 as const;
export const DRAFT_STORAGE_VERSION = 1 as const;

export type EntityType =
  | 'run'
  | 'crash'
  | 'trace'
  | 'log'
  | 'state-diff'
  | 'chart'
  | 'artifact';

export type EvidenceMode = 'live' | 'pinned';

export type CalloutVariant = 'info' | 'warning' | 'success' | 'danger';

/** A resolved, immutable view of an entity at a point in time. */
export interface EntitySnapshot {
  id: string;
  type: EntityType;
  title: string;
  status: string;
  timestamp: string;
  sourceUrl: string;
  summary: string;
  fields?: Record<string, string | number | boolean>;
}

/** A reference to an entity from report Markdown. */
export interface EvidenceRef {
  id: string;
  type: EntityType;
  entityId: string;
  mode: EvidenceMode;
  /** Required for `pinned` references; captured when the author pins the entity. */
  snapshot?: EntitySnapshot;
  label?: string;
}

export interface ReportComment {
  id: string;
  /** Block id, heading or quoted text the comment is anchored to. */
  anchor: string;
  author: string;
  body: string;
  createdAt: string;
  resolved: boolean;
  /** Handles extracted from `body` by `tokenizeMentions`. */
  mentions: string[];
}

export interface ReportDocument {
  schemaVersion: typeof REPORT_DOCUMENT_VERSION;
  id: string;
  title: string;
  markdown: string;
  /** Revision of the last *saved* state. Local edits keep this number. */
  revision: number;
  updatedAt: string;
  embeds: Record<string, EvidenceRef>;
  comments: ReportComment[];
}

/** One immutable entry in the version history. */
export interface ReportRevision {
  revision: number;
  createdAt: string;
  author: string;
  message: string;
  document: ReportDocument;
}

export interface ReportRecord {
  document: ReportDocument;
  revisions: ReportRevision[];
}

export interface MermaidBlockData {
  id: string;
  code: string;
  caption?: string;
}

export interface CalloutBlockData {
  id: string;
  variant: CalloutVariant;
  title: string;
  body: string;
}

export interface ReportDraft {
  version: typeof DRAFT_STORAGE_VERSION;
  document: ReportDocument;
  baseRevision: number;
  savedAt: string;
}

/** Wire shape shared by direct saves and the offline queue. */
export interface ReportSavePayload {
  id: string;
  baseRevision: number;
  patch: Partial<Pick<ReportDocument, 'title' | 'markdown' | 'embeds' | 'comments'>>;
  revisionMessage?: string;
  restoreRevision?: number;
  force?: boolean;
}

export interface QueuedSave {
  id: string;
  baseRevision: number;
  payload: ReportSavePayload;
  queuedAt: string;
}
