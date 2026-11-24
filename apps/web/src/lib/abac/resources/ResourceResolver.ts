/**
 * Resource Resolver - Load resource attributes for policy evaluation.
 *
 * Resolves resource attributes from various sources (database, API, cache)
 * for use in policy evaluation.
 */

import type { Resource, ResourceType, ResourceAttributes, CampaignAttributes, RunAttributes, ArtifactAttributes } from '../attributes';
import { getResourceRegistry } from './ResourceRegistry';
import { getPolicyCache } from '../PolicyCache';
import { logger } from '@/lib/logger';

// ─── Resource Storage Interfaces ─────────────────────────────────────────────

/**
 * Interface for campaign storage.
 */
export interface CampaignStorage {
  getCampaign(id: string): Promise<CampaignAttributes | null>;
  listCampaigns(options?: { limit?: number; offset?: number; team?: string }): Promise<CampaignAttributes[]>;
}

/**
 * Interface for run storage.
 */
export interface RunStorage {
  getRun(id: string): Promise<RunAttributes | null>;
  listRuns(options?: { limit?: number; offset?: number; campaignId?: string }): Promise<RunAttributes[]>;
}

/**
 * Interface for artifact storage.
 */
export interface ArtifactStorage {
  getArtifact(id: string): Promise<ArtifactAttributes | null>;
  listArtifacts(options?: { limit?: number; offset?: number; runId?: string }): Promise<ArtifactAttributes[]>;
}

// ─── Resource Resolver ────────────────────────────────────────────────────────

/**
 * Resolves resource attributes from storage.
 */
export class ResourceResolver {
  private registry: ReturnType<typeof getResourceRegistry>;
  private cache: ReturnType<typeof getPolicyCache>;

  // Storage backends (would be injected in production)
  private campaignStorage?: CampaignStorage;
  private runStorage?: RunStorage;
  private artifactStorage?: ArtifactStorage;

  constructor() {
    this.registry = getResourceRegistry();
    this.cache = getPolicyCache();
  }

  /**
   * Resolve a resource by type and ID.
   */
  async resolve(type: ResourceType, id: string): Promise<Resource | null> {
    // First check cache
    const cached = this.getFromCache(type, id);
    if (cached) return cached;

    // Resolve from storage based on type
    let attributes: ResourceAttributes | null = null;

    switch (type) {
      case 'campaign':
        attributes = await this.resolveCampaign(id);
        break;
      case 'run':
        attributes = await this.resolveRun(id);
        break;
      case 'artifact':
        attributes = await this.resolveArtifact(id);
        break;
      case 'network':
        attributes = await this.resolveNetwork(id);
        break;
      case 'schedule':
        attributes = await this.resolveSchedule(id);
        break;
      case 'token':
        attributes = await this.resolveToken(id);
        break;
      default:
        logger.warn('Unknown resource type', { type });
        return null;
    }

    if (attributes) {
      // Cache for future lookups
      const resource = { type, attributes };
      this.setCache(type, id, resource);
      return resource;
    }

    return null;
  }

  /**
   * Resolve a campaign.
   */
  private async resolveCampaign(id: string): Promise<CampaignAttributes | null> {
    // In production, this would query a database or API
    // For now, return null to be implemented by storage backend
    if (this.campaignStorage) {
      return this.campaignStorage.getCampaign(id);
    }

    // Fallback: try to parse from a mock source
    return this.mockResolveCampaign(id);
  }

  /**
   * Resolve a run.
   */
  private async resolveRun(id: string): Promise<RunAttributes | null> {
    if (this.runStorage) {
      return this.runStorage.getRun(id);
    }

    return this.mockResolveRun(id);
  }

  /**
   * Resolve an artifact.
   */
  private async resolveArtifact(id: string): Promise<ArtifactAttributes | null> {
    if (this.artifactStorage) {
      return this.artifactStorage.getArtifact(id);
    }

    return this.mockResolveArtifact(id);
  }

  /**
   * Resolve a network (placeholder).
   */
  private async resolveNetwork(id: string): Promise<any | null> {
    // Networks are typically system-configured, not user resources
    return { id, type: 'network' as any };
  }

  /**
   * Resolve a schedule (placeholder).
   */
  private async resolveSchedule(id: string): Promise<any | null> {
    return { id, type: 'schedule' as any };
  }

  /**
   * Resolve a token (placeholder).
   */
  private async resolveToken(id: string): Promise<any | null> {
    return { id, type: 'token' as any };
  }

  // ─── Cache Operations ────────────────────────────────────────────────────────

  private getFromCache(type: ResourceType, id: string): Resource | null {
    // Use a cache key from the policy cache
    const key = `resource:${type}:${id}`;
    // This is a simplified cache - in production you'd want a proper cache per resource type
    return null;
  }

  private setCache(type: ResourceType, id: string, resource: Resource): void {
    // Cache the resolved resource
  }

  // ─── Mock Resolvers (for development) ───────────────────────────────────────

  /**
   * Mock campaign resolver for development.
   */
  private async mockResolveCampaign(id: string): Promise<CampaignAttributes | null> {
    // In development, try to fetch from mock data store
    const mockCampaigns: Record<string, CampaignAttributes> = {
      'campaign-mainnet': {
        id: 'campaign-mainnet',
        name: 'Mainnet Fuzzing Campaign',
        team: 'security',
        status: 'running',
        tags: ['security', 'mainnet'],
        owner: 'user:security-lead',
        visibility: 'private',
        createdAt: Date.now() - 86400000,
      },
      'campaign-dev': {
        id: 'campaign-dev',
        name: 'Development Campaign',
        team: 'dev',
        status: 'queued',
        tags: ['dev', 'testing'],
        createdAt: Date.now() - 3600000,
      },
    };

    if (id in mockCampaigns) {
      return mockCampaigns[id];
    }

    // Check if it's a campaign prefix match
    const matching = Object.entries(mockCampaigns).find(([k]) => k.startsWith(`campaign-${id}`));
    if (matching) {
      return matching[1];
    }

    return null;
  }

  /**
   * Mock run resolver for development.
   */
  private async mockResolveRun(id: string): Promise<RunAttributes | null> {
    const mockRuns: Record<string, RunAttributes> = {
      'run-001': {
        id: 'run-001',
        campaignId: 'campaign-mainnet',
        team: 'security',
        status: 'completed',
        type: 'fuzz',
        tags: ['crash', 'security'],
        startedAt: Date.now() - 7200000,
        completedAt: Date.now() - 7100000,
      },
      'run-002': {
        id: 'run-002',
        campaignId: 'campaign-dev',
        team: 'dev',
        status: 'running',
        type: 'replay',
        tags: ['regression'],
        startedAt: Date.now() - 3600000,
      },
    };

    return mockRuns[id] ?? null;
  }

  /**
   * Mock artifact resolver for development.
   */
  private async mockResolveArtifact(id: string): Promise<ArtifactAttributes | null> {
    // Artifacts are linked to runs
    const [runId, artifactId] = id.split('-');
    const run = await this.resolveRun(runId + '-001');

    if (run) {
      return {
        id,
        runId: runId + '-001',
        campaignId: run.campaignId,
        team: run.team,
        type: 'crash',
        sensitivity: 'internal',
        uploadedAt: Date.now() - 1800000,
      };
    }

    return null;
  }

  // ─── Storage Injection ──────────────────────────────────────────────────────

  /**
   * Inject storage backends for production use.
   */
  setCampaignStorage(storage: CampaignStorage): void {
    this.campaignStorage = storage;
  }

  setRunStorage(storage: RunStorage): void {
    this.runStorage = storage;
  }

  setArtifactStorage(storage: ArtifactStorage): void {
    this.artifactStorage = storage;
  }

  // ─── Utility Functions ───────────────────────────────────────────────────────

  /**
   * Resolve a resource from a URL parameter.
   * e.g., 'campaign:campaign-mainnet' -> { type: 'campaign', id: 'campaign-mainnet' }
   */
  parseResourceRef(ref: string): { type: ResourceType; id: string } | null {
    const parts = ref.split(':');
    if (parts.length !== 2) return null;

    const [type, id] = parts;
    if (!this.registry.isValidType(type)) return null;

    return { type: type as ResourceType, id };
  }

  /**
   * Get multiple resources.
   */
  async resolveMany(resources: Array<{ type: ResourceType; id: string }>): Promise<(Resource | null)[]> {
    return Promise.all(resources.map(({ type, id }) => this.resolve(type, id)));
  }

  /**
   * Find resources by attribute.
   */
  async findByAttribute<T extends ResourceAttributes>(
    type: ResourceType,
    attribute: keyof T,
    value: unknown,
  ): Promise<Resource[]> {
    // This would query the storage backend
    // For now, return empty array
    return [];
  }
}

/**
 * Singleton resource resolver instance.
 */
let resolverInstance: ResourceResolver | null = null;

/**
 * Get the resource resolver singleton.
 */
export function getResourceResolver(): ResourceResolver {
  if (!resolverInstance) {
    resolverInstance = new ResourceResolver();
  }
  return resolverInstance;
}

// ─── Convenience Functions ────────────────────────────────────────────────────

/**
 * Resolve a resource quickly.
 */
export async function resolveResource(type: ResourceType, id: string): Promise<Resource | null> {
  return getResourceResolver().resolve(type, id);
}

/**
 * Parse a resource reference.
 */
export function parseResourceReference(ref: string): { type: ResourceType; id: string } | null {
  return getResourceResolver().parseResourceRef(ref);
}