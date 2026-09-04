import { buildMockRuns } from '@/app/mockRuns';
import type { Artifact, FuzzingRun } from '@/app/types';
import type { RunListOptions, RunStorageDriver, StoredArtifact } from './run-driver';

export class InMemoryRunDriver implements RunStorageDriver {
  readonly name = 'in-memory-runs';
  private readonly runs = new Map<string, FuzzingRun>();
  private readonly artifacts = new Map<string, StoredArtifact>();

  constructor(runs: FuzzingRun[] = buildMockRuns()) {
    runs.forEach((run) => this.runs.set(run.id, structuredClone(run)));
  }

  async listRuns(options: RunListOptions = {}): Promise<{ runs: FuzzingRun[]; total: number }> {
    let runs = [...this.runs.values()];
    if (options.status) runs = runs.filter((run) => run.status === options.status);
    const total = runs.length;
    const offset = Math.max(0, options.offset ?? 0);
    const limit = options.limit === undefined ? runs.length : Math.max(0, options.limit);
    return { runs: structuredClone(runs.slice(offset, offset + limit)), total };
  }

  async getRun(id: string): Promise<FuzzingRun | null> {
    const run = this.runs.get(id);
    return run ? structuredClone(run) : null;
  }

  async putArtifact(runId: string, artifact: Artifact, bytes: Uint8Array): Promise<Artifact> {
    const metadata = { ...artifact, runId };
    this.artifacts.set(artifact.id, { metadata, bytes: bytes.slice() });
    return structuredClone(metadata);
  }

  async getArtifact(id: string): Promise<StoredArtifact | null> {
    const artifact = this.artifacts.get(id);
    return artifact ? { metadata: structuredClone(artifact.metadata), bytes: artifact.bytes.slice() } : null;
  }

  async deleteRun(id: string): Promise<boolean> {
    const deleted = this.runs.delete(id);
    for (const [artifactId, artifact] of this.artifacts) {
      if (artifact.metadata.runId === id) this.artifacts.delete(artifactId);
    }
    return deleted;
  }
}