/** Zod validation shared by the API route, the editor hook and the pure helpers. */
import { z } from 'zod';
import type {
  CalloutBlockData,
  EntitySnapshot,
  EvidenceRef,
  MermaidBlockData,
  ReportComment,
  ReportDocument,
  ReportRecord,
  ReportRevision,
} from './types';

const TIMESTAMP = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Expected an ISO-8601 timestamp',
});

const FIELD_VALUE = z.union([z.string(), z.number(), z.boolean()]);

const ENTITY_TYPE = z.enum([
  'run',
  'crash',
  'trace',
  'log',
  'state-diff',
  'chart',
  'artifact',
]);

const CALLOUT_VARIANT = z.enum(['info', 'warning', 'success', 'danger']);

export const EntitySnapshotSchema: z.ZodType<EntitySnapshot> = z
  .object({
    id: z.string().min(1).max(200),
    type: ENTITY_TYPE,
    title: z.string().max(300),
    status: z.string().max(100),
    timestamp: TIMESTAMP,
    sourceUrl: z.string().max(2000),
    summary: z.string().max(4000),
    fields: z.record(FIELD_VALUE).optional(),
  })
  .strict();

export const EvidenceRefSchema: z.ZodType<EvidenceRef> = z
  .object({
    id: z.string().min(1).max(200),
    type: ENTITY_TYPE,
    entityId: z.string().min(1).max(200),
    mode: z.enum(['live', 'pinned']),
    snapshot: EntitySnapshotSchema.optional(),
    label: z.string().max(200).optional(),
  })
  .strict()
  .superRefine((ref, ctx) => {
    if (ref.mode === 'pinned' && !ref.snapshot) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pinned evidence requires a snapshot',
        path: ['snapshot'],
      });
    }
  });

export const ReportCommentSchema: z.ZodType<ReportComment> = z
  .object({
    id: z.string().min(1).max(200),
    anchor: z.string().max(500),
    author: z.string().min(1).max(100),
    body: z.string().min(1).max(4000),
    createdAt: TIMESTAMP,
    resolved: z.boolean(),
    mentions: z.array(z.string().max(100)).max(50),
  })
  .strict();

export const ReportDocumentSchema: z.ZodType<ReportDocument> = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1).max(200),
    title: z.string().min(1).max(300),
    markdown: z.string().max(2_000_000),
    revision: z.number().int().nonnegative(),
    updatedAt: TIMESTAMP,
    embeds: z.record(EvidenceRefSchema),
    comments: z.array(ReportCommentSchema).max(1000),
  })
  .strict();

export const ReportRevisionSchema: z.ZodType<ReportRevision> = z
  .object({
    revision: z.number().int().positive(),
    createdAt: TIMESTAMP,
    author: z.string().max(100),
    message: z.string().max(300),
    document: ReportDocumentSchema,
  })
  .strict();

export const ReportRecordSchema: z.ZodType<ReportRecord> = z
  .object({
    document: ReportDocumentSchema,
    revisions: z.array(ReportRevisionSchema).max(2000),
  })
  .strict();

export const MermaidBlockDataSchema: z.ZodType<MermaidBlockData> = z
  .object({
    id: z.string().min(1).max(200),
    code: z.string().max(20_000),
    caption: z.string().max(300).optional(),
  })
  .strict();

export const CalloutBlockDataSchema: z.ZodType<CalloutBlockData> = z
  .object({
    id: z.string().min(1).max(200),
    variant: CALLOUT_VARIANT,
    title: z.string().max(200),
    body: z.string().max(4000),
  })
  .strict();

export const CreateReportSchema = z
  .object({
    id: z.string().min(1).max(200).optional(),
    title: z.string().min(1).max(300),
    markdown: z.string().max(2_000_000),
    embeds: z.record(EvidenceRefSchema).default({}),
    comments: z.array(ReportCommentSchema).max(1000).default([]),
    author: z.string().min(1).max(100).default('anonymous'),
  })
  .strict();

export const PatchReportSchema = z
  .object({
    id: z.string().min(1).max(200),
    baseRevision: z.number().int().nonnegative(),
    patch: z
      .object({
        title: z.string().min(1).max(300).optional(),
        markdown: z.string().max(2_000_000).optional(),
        embeds: z.record(EvidenceRefSchema).optional(),
        comments: z.array(ReportCommentSchema).max(1000).optional(),
      })
      .strict(),
    revisionMessage: z.string().max(300).optional(),
    /** Restore the Markdown/embeds/comments from this historical revision. */
    restoreRevision: z.number().int().positive().optional(),
    author: z.string().min(1).max(100).default('anonymous'),
    /** Escape hatch used by the explicit "overwrite with local copy" action. */
    force: z.boolean().default(false),
  })
  .strict();

export type CreateReportInput = z.infer<typeof CreateReportSchema>;
export type PatchReportInput = z.infer<typeof PatchReportSchema>;
