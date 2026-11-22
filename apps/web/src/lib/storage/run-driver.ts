import type { Artifact, FuzzingRun, RunStatus } from '@/app/types';

export interface RunListOptions {
  status?: RunStatus;
  limit?: number;
  offset?: number;
}

export interface StoredArtifact {
  metadata: Artifact;
  bytes: Uint8Array;
}

export interface RunStorageDriver {
  readonly name: string;
  listRuns(options?: RunListOptions): Promise<{ runs: FuzzingRun[]; total: number }>;
  getRun(id: string): Promise<FuzzingRun | null>;
  putArtifact(runId: string, artifact: Artifact, bytes: Uint8Array): Promise<Artifact>;
  getArtifact(id: string): Promise<StoredArtifact | null>;
  deleteRun(id: string): Promise<boolean>;
}

export class RunStorageError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'RunStorageError';
    this.statusCode = statusCode;
  }
}