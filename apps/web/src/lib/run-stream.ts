import type { Artifact, RunStatus } from '@/app/types';
import type { LogEntry } from '@/app/log-viewer-utils';

export type RunStreamEventType = 'RUN_STATUS' | 'LOG_APPEND' | 'ARTIFACT_ADDED' | 'HEARTBEAT';

export interface RunStatusEvent {
  type: 'RUN_STATUS';
  status: RunStatus;
  metrics?: { seedCount?: number; duration?: number };
}

export interface LogAppendEvent {
  type: 'LOG_APPEND';
  entries: LogEntry[];
}

export interface ArtifactAddedEvent {
  type: 'ARTIFACT_ADDED';
  artifact: Artifact;
}

export interface HeartbeatEvent {
  type: 'HEARTBEAT';
  at: string;
}

export type RunStreamPayload = RunStatusEvent | LogAppendEvent | ArtifactAddedEvent | HeartbeatEvent;

export interface RunStreamEnvelope<T extends RunStreamPayload = RunStreamPayload> {
  seq: number;
  runId: string;
  event: T;
}