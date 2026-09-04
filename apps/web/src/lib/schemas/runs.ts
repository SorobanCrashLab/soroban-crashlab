/**
 * Shared Zod schemas for the runs endpoints.
 *
 * These schemas are the single source of truth for:
 *   - Request validation inside route handlers (parse via zodParseRequest)
 *   - TypeScript types used by client-side code (z.infer<...>)
 *
 * Issue #1384: establishes the pattern for three exemplar endpoints.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Domain sub-schemas (mirror src/app/types.ts — no runtime import to avoid
// circular deps; TypeScript structural compatibility is enforced by the
// z.infer assignments at the bottom of api-client.ts)
// ---------------------------------------------------------------------------

export const RunStatusSchema = z.enum(['running', 'completed', 'failed', 'cancelled']);
export const RunAreaSchema = z.enum(['auth', 'state', 'budget', 'xdr']);
export const RunSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const CrashDetailSchema = z.object({
  failureCategory: z.string(),
  signature: z.string(),
  signatureHash: z.number().optional(),
  payload: z.string(),
  replayAction: z.string(),
});

export const RunIssueLinkSchema = z.object({
  label: z.string(),
  href: z.string().url(),
});

export const ArtifactTypeSchema = z.enum(['seed', 'log', 'trace', 'coverage', 'bundle']);

export const ArtifactSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: ArtifactTypeSchema,
  size: z.number(),
  updatedAt: z.string(),
  runId: z.string().optional(),
  content_hash: z.string().optional(),
  contentType: z.enum(['json', 'text', 'hex', 'unknown']).optional(),
});

export const FuzzingRunSchema = z.object({
  id: z.string(),
  parentId: z.string().optional(),
  seedList: z.array(z.number()).optional(),
  status: RunStatusSchema,
  area: RunAreaSchema,
  severity: RunSeveritySchema,
  duration: z.number(),
  seedCount: z.number(),
  crashDetail: CrashDetailSchema.nullable(),
  cpuInstructions: z.number(),
  memoryBytes: z.number(),
  minResourceFee: z.number(),
  queuedAt: z.string().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  associatedIssues: z.array(RunIssueLinkSchema).optional(),
  annotations: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  artifacts: z.array(ArtifactSchema).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/runs — request query params + response
// ---------------------------------------------------------------------------

export const RunsListRequestSchema = z.object({
  status: RunStatusSchema.optional(),
  limit: z
    .string()
    .regex(/^\d+$/, 'limit must be a positive integer')
    .transform(Number)
    .optional(),
});

export const RunsListResponseSchema = z.object({
  runs: z.array(FuzzingRunSchema),
  total: z.number(),
});

export type RunsListRequest = z.infer<typeof RunsListRequestSchema>;
export type RunsListResponse = z.infer<typeof RunsListResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/runs/[id] — response (id comes from path, no body schema needed)
// ---------------------------------------------------------------------------

export const RunDetailResponseSchema = FuzzingRunSchema;

export type RunDetailResponse = z.infer<typeof RunDetailResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/webhooks/history — request query params + response
// ---------------------------------------------------------------------------

export const DeliveryStatusFilterSchema = z.enum(['all', 'delivered', 'failed', 'queued']);

export const WebhookDeliveryItemSchema = z.object({
  id: z.string(),
  webhookId: z.string(),
  url: z.string(),
  eventType: z.enum([
    'run.started',
    'run.progressing',
    'run.completed',
    'run.failed',
    'run.cancelled',
    'crash.detected',
  ]),
  status: z.enum(['delivered', 'failed', 'queued']),
  statusCode: z.number().optional(),
  attempts: z.number(),
  maxAttempts: z.number(),
  createdAt: z.string(),
  lastAttemptedAt: z.string().optional(),
  nextRetryAt: z.string().optional(),
  error: z.string().optional(),
  payload: z.record(z.unknown()),
  responseBody: z.string().optional(),
  headers: z.record(z.string()).optional(),
});

export const DeliveryStatsSchema = z.object({
  totalCount: z.number(),
  deliveredCount: z.number(),
  failedCount: z.number(),
  queuedCount: z.number(),
  successRate: z.number(),
  averageAttempts: z.number(),
});

export const WebhookHistoryRequestSchema = z.object({
  status: DeliveryStatusFilterSchema.default('all'),
  search: z.string().default(''),
});

export const WebhookHistoryResponseSchema = z.object({
  items: z.array(WebhookDeliveryItemSchema),
  stats: DeliveryStatsSchema,
  total: z.number(),
});

export type WebhookHistoryRequest = z.infer<typeof WebhookHistoryRequestSchema>;
export type WebhookHistoryResponse = z.infer<typeof WebhookHistoryResponseSchema>;
export type WebhookDeliveryItem = z.infer<typeof WebhookDeliveryItemSchema>;
export type DeliveryStats = z.infer<typeof DeliveryStatsSchema>;
