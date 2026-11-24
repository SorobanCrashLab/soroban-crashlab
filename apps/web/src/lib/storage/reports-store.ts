/**
 * In-memory report store for the technical report editor API.
 *
 * Mirrors the storage pattern used by `export-jobs-store`: a single process
 * local Map with a well-defined interface so a persistent adapter can be
 * swapped in later without touching route handlers.
 */
import { createEvidenceBlock } from '@/features/reports/editor/lib/markdown-blocks';
import { createEvidenceRef } from '@/features/reports/editor/lib/embeds';
import { appendRevision, createRevision } from '@/features/reports/editor/lib/revision';
import { deserializeDocument, serializeDocument, stableStringify } from '@/features/reports/editor/lib/serialization';
import { applyTemplate } from '@/features/reports/editor/templates';
import type { ReportDocument, ReportRecord } from '@/features/reports/editor/lib/types';

function clone<T>(value: T): T {
  return JSON.parse(stableStringify(value)) as T;
}

function canonicalDocument(document: ReportDocument): ReportDocument {
  const parsed = deserializeDocument(serializeDocument(document));
  if (!parsed) throw new Error('Invalid report document');
  return parsed;
}

function seedRecord(): ReportRecord {
  const createdAt = '2026-11-21T10:00:00Z';
  const body = applyTemplate('postmortem', '', {
    variables: {
      title: 'Overflow in div_i64 during replay',
      incident_id: 'INC-2041',
      author: '@oncall',
      date: '2026-11-21',
      run_id: 'run-001',
    },
    now: new Date(createdAt),
  });
  const evidence = createEvidenceBlock(
    createEvidenceRef('run', 'run-001', { id: 'evidence-run-001' }),
  );
  const document: ReportDocument = {
    schemaVersion: 1,
    id: 'report-demo',
    title: 'Overflow in div_i64 during replay',
    markdown: `${body.trimEnd()}\n\n${evidence.source}\n`,
    revision: 1,
    updatedAt: createdAt,
    embeds: { [evidence.id!]: evidence.data as ReportDocument['embeds'][string] },
    comments: [],
  };
  const canonical = canonicalDocument(document);
  return {
    document: canonical,
    revisions: [createRevision(canonical, '@system', 'Seed report', createdAt)],
  };
}

class ReportsStore {
  private readonly records = new Map<string, ReportRecord>([['report-demo', seedRecord()]]);

  get(id: string): ReportRecord | null {
    const record = this.records.get(id);
    return record ? clone(record) : null;
  }

  list(): ReportDocument[] {
    return [...this.records.values()]
      .map((record) => clone(record.document))
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  }

  save(record: ReportRecord): ReportRecord {
    const canonical: ReportRecord = {
      document: canonicalDocument(record.document),
      revisions: record.revisions.map((revision) => ({
        ...revision,
        document: canonicalDocument(revision.document),
      })),
    };
    this.records.set(canonical.document.id, clone(canonical));
    return clone(canonical);
  }

  create(input: {
    id: string;
    title: string;
    markdown: string;
    embeds: ReportDocument['embeds'];
    comments: ReportDocument['comments'];
    author: string;
    now?: string;
  }): ReportRecord {
    const createdAt = input.now ?? new Date().toISOString();
    const document = canonicalDocument({
      schemaVersion: 1,
      id: input.id,
      title: input.title,
      markdown: input.markdown,
      revision: 1,
      updatedAt: createdAt,
      embeds: input.embeds,
      comments: input.comments,
    });
    const record = appendRevision(
      { document, revisions: [] },
      createRevision(document, input.author, 'Initial revision', createdAt),
    );
    return this.save(record);
  }

  update(record: ReportRecord): ReportRecord {
    return this.save(record);
  }
}

export const reportsStore = new ReportsStore();
