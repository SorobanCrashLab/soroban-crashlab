import { getRedis } from '@/lib/redis';
import type { FuzzingRun } from '@/app/types';
import type { RunListOptions, RunStorageDriver, StoredArtifact } from './run-driver';
import type { Artifact } from '@/app/types';

interface KVArtifactRecord {
  id: string;
  name: string;
  type: string;
  size: number;
  updatedAt: string;
  runId: string | null;
  utKey: string;
  utUrl: string;
}

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<string>;
  del(...keys: string[]): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
}

function createDefaultRedis(): RedisClient {
  return getRedis();
}

export class KVRunDriver implements RunStorageDriver {
  readonly name = 'upstash-kv';
  private readonly redis: RedisClient;

  constructor(redis?: RedisClient) {
    this.redis = redis ?? createDefaultRedis();
  }

  async listRuns(options: RunListOptions = {}): Promise<{ runs: FuzzingRun[]; total: number }> {
    const redis = this.redis;
    const ids = await redis.smembers('run:index');

    const runs: FuzzingRun[] = [];
    for (const id of ids) {
      const raw = await redis.get(`run:${id}`);
      if (!raw) continue;
      const run: FuzzingRun = typeof raw === 'string' ? JSON.parse(raw) : (raw as FuzzingRun);
      if (options.status && run.status !== options.status) continue;
      runs.push(run);
    }

    runs.sort((a, b) => {
      const aTime = a.startedAt ?? a.queuedAt ?? '';
      const bTime = b.startedAt ?? b.queuedAt ?? '';
      return bTime.localeCompare(aTime);
    });

    const total = runs.length;
    const offset = Math.max(0, options.offset ?? 0);
    const limit = options.limit === undefined ? runs.length : Math.max(0, options.limit);

    return { runs: runs.slice(offset, offset + limit), total };
  }

  async getRun(id: string): Promise<FuzzingRun | null> {
    const raw = await this.redis.get(`run:${id}`);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : (raw as FuzzingRun);
  }

  async putRun(run: FuzzingRun): Promise<void> {
    await this.redis.set(`run:${run.id}`, JSON.stringify(run));
    await this.redis.sadd('run:index', run.id);
  }

  async deleteRun(id: string): Promise<boolean> {
    const existed = await this.redis.srem('run:index', id);
    await this.redis.del(`run:${id}`);

    const artifactIds = await this.redis.smembers(`artifact:run:${id}`);
    for (const aid of artifactIds) {
      await this.redis.del(`artifact:${aid}`);
      await this.redis.srem('artifact:index', aid);
    }
    await this.redis.del(`artifact:run:${id}`);

    return existed > 0;
  }

  async putArtifact(runId: string, artifact: Artifact, _bytes: Uint8Array): Promise<Artifact> {
    const existing = await this.redis.get(`artifact:${artifact.id}`);
    const record: KVArtifactRecord = {
      id: artifact.id,
      name: artifact.name,
      type: artifact.type,
      size: artifact.size,
      updatedAt: artifact.updatedAt,
      runId,
      utKey: '',
      utUrl: '',
      ...(existing ? (typeof existing === 'string' ? JSON.parse(existing) : existing) : {}),
    };
    await this.redis.set(`artifact:${artifact.id}`, JSON.stringify(record));
    await this.redis.sadd('artifact:index', artifact.id);
    await this.redis.sadd(`artifact:run:${runId}`, artifact.id);
    return artifact;
  }

  async getArtifact(id: string): Promise<StoredArtifact | null> {
    const raw = await this.redis.get(`artifact:${id}`);
    if (!raw) return null;
    const record: KVArtifactRecord = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const metadata: Artifact = {
      id: record.id,
      name: record.name,
      type: record.type as Artifact['type'],
      size: record.size,
      updatedAt: record.updatedAt,
      runId: record.runId ?? undefined,
    };
    return { metadata, bytes: new Uint8Array(0) };
  }

  async getArtifactUrl(id: string): Promise<string | null> {
    const raw = await this.redis.get(`artifact:${id}`);
    if (!raw) return null;
    const record: KVArtifactRecord = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return record.utUrl ?? null;
  }
}
