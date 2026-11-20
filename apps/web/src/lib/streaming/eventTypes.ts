/**
 * Zod schemas and TypeScript types for run stream events (#2191).
 *
 * Extends the existing per-run stream types to cover global (dashboard-level)
 * events: run.created, run.status_changed, run.metrics_updated, run.crashed,
 * run.completed, artifact.uploaded.
 */

import { z } from 'zod';
import type { FuzzingRun, RunStatus } from '@/app/types';

export type RunCreatedEvent = {
  type: 'run.created';
  run: FuzzingRun;
};

export type RunStatusChangedEvent = {
  type: 'run.status_changed';
  runId: string;
  oldStatus: RunStatus;
  newStatus: RunStatus;
  metrics?: { seedCount: number; duration: number };
};

export type RunMetricsUpdatedEvent = {
  type: 'run.metrics_updated';
  runId: string;
  metrics: { seedCount: number; duration: number };
};

export type RunCrashedEvent = {
  type: 'run.crashed';
  runId: string;
  crashDetail: unknown;
};

export type RunCompletedEvent = {
  type: 'run.completed';
  runId: string;
  metrics: { seedCount: number; duration: number };
};

export type ArtifactUploadedEvent = {
  type: 'artifact.uploaded';
  runId: string;
  artifact: unknown;
};

export type HeartbeatEvent = {
  type: 'heartbeat';
  at: string;
};

export type AllEventTypes =
  | RunCreatedEvent
  | RunStatusChangedEvent
  | RunMetricsUpdatedEvent
  | RunCrashedEvent
  | RunCompletedEvent
  | ArtifactUploadedEvent
  | HeartbeatEvent;

export type StreamEventType = AllEventTypes['type'];

export interface StreamEnvelope<T extends AllEventTypes = AllEventTypes> {
  seq: number;
  event: T;
}

export const EVENT_TYPES: StreamEventType[] = [
  'run.created',
  'run.status_changed',
  'run.metrics_updated',
  'run.crashed',
  'run.completed',
  'artifact.uploaded',
  'heartbeat',
];

// Zod schemas for validation
export const RunStatusChangedSchema = z.object({
  type: z.literal('run.status_changed'),
  runId: z.string(),
  oldStatus: z.string(),
  newStatus: z.string(),
  metrics: z.object({ seedCount: z.number(), duration: z.number() }).optional(),
});

export const RunMetricsUpdatedSchema = z.object({
  type: z.literal('run.metrics_updated'),
  runId: z.string(),
  metrics: z.object({ seedCount: z.number(), duration: z.number() }),
});

export const RunCrashedSchema = z.object({
  type: z.literal('run.crashed'),
  runId: z.string(),
  crashDetail: z.unknown(),
});

export const RunCompletedSchema = z.object({
  type: z.literal('run.completed'),
  runId: z.string(),
  metrics: z.object({ seedCount: z.number(), duration: z.number() }),
});

export const ArtifactUploadedSchema = z.object({
  type: z.literal('artifact.uploaded'),
  runId: z.string(),
  artifact: z.unknown(),
});

export const StreamEnvelopeSchema = z.object({
  seq: z.number(),
  event: z.object({
    type: z.string(),
  }).passthrough(),
});
