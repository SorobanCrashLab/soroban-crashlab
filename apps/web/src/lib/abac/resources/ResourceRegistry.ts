/**
 * Resource Registry - Register and discover resource types.
 *
 * Provides a registry for all ABAC resource types and their attributes.
 */

import type { ResourceAttributes, ResourceType, CampaignAttributes, RunAttributes, ArtifactAttributes, NetworkAttributes, TokenAttributes } from '../attributes';

// ─── Resource Type Registration ─────────────────────────────────────────────

/**
 * Resource type definition.
 */
export interface ResourceTypeDefinition<T extends ResourceAttributes = ResourceAttributes> {
  /** Resource type name */
  type: ResourceType;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Default actions for this resource type */
  defaultActions: string[];
  /** Whether this resource type supports dynamic conditions */
  supportsDynamicConditions: boolean;
  /** Attributes transformer (for loading from external sources) */
  transformer?: (data: Record<string, unknown>) => T;
}

// ─── Registered Resource Types ────────────────────────────────────────────────

const RESOURCE_TYPES: Record<ResourceType, ResourceTypeDefinition> = {
  campaign: {
    type: 'campaign',
    name: 'Campaign',
    description: 'Fuzzing campaign',
    defaultActions: ['view', 'create', 'update', 'delete', 'manage'],
    supportsDynamicConditions: true,
    transformer: (data) => ({
      id: String(data.id ?? ''),
      team: String(data.team ?? ''),
      name: typeof data.name === 'string' ? data.name : undefined,
      status: data.status as any,
      tags: Array.isArray(data.tags) ? data.tags as string[] : undefined,
      owner: typeof data.owner === 'string' ? data.owner : undefined,
      visibility: data.visibility as any,
      createdAt: typeof data.createdAt === 'number' ? data.createdAt : undefined,
      expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : undefined,
      environment: typeof data.environment === 'string' ? data.environment : undefined,
    }),
  },

  run: {
    type: 'run',
    name: 'Run',
    description: 'Fuzzing run',
    defaultActions: ['view', 'annotate', 'triage', 'replay', 'delete', 'manage'],
    supportsDynamicConditions: true,
    transformer: (data) => ({
      id: String(data.id ?? ''),
      campaignId: String(data.campaignId ?? ''),
      team: String(data.team ?? ''),
      status: data.status as any,
      type: data.type as any,
      tags: Array.isArray(data.tags) ? data.tags as string[] : undefined,
      startedAt: typeof data.startedAt === 'number' ? data.startedAt : undefined,
      completedAt: typeof data.completedAt === 'number' ? data.completedAt : undefined,
    }),
  },

  artifact: {
    type: 'artifact',
    name: 'Artifact',
    description: 'Run artifact',
    defaultActions: ['view', 'download', 'delete', 'manage'],
    supportsDynamicConditions: true,
    transformer: (data) => ({
      id: String(data.id ?? ''),
      runId: String(data.runId ?? ''),
      campaignId: String(data.campaignId ?? ''),
      team: String(data.team ?? ''),
      type: data.type as any,
      sensitivity: data.sensitivity as any,
      uploadedAt: typeof data.uploadedAt === 'number' ? data.uploadedAt : undefined,
    }),
  },

  network: {
    type: 'network',
    name: 'Network',
    description: 'Network endpoint',
    defaultActions: ['view', 'create', 'update', 'delete', 'manage'],
    supportsDynamicConditions: true,
    transformer: (data) => ({
      id: String(data.id ?? ''),
      type: data.type as any,
      description: typeof data.description === 'string' ? data.description : undefined,
      isActive: typeof data.isActive === 'boolean' ? data.isActive : undefined,
      allowedIps: Array.isArray(data.allowedIps) ? data.allowedIps as string[] : undefined,
    }),
  },

  schedule: {
    type: 'schedule',
    name: 'Schedule',
    description: 'Run schedule',
    defaultActions: ['view', 'create', 'update', 'delete', 'manage'],
    supportsDynamicConditions: false,
    transformer: (data) => ({
      id: String(data.id ?? ''),
      type: 'schedule' as any,
      name: typeof data.name === 'string' ? data.name : undefined,
      active: typeof data.active === 'boolean' ? data.active : undefined,
    }),
  },

  token: {
    type: 'token',
    name: 'API Token',
    description: 'API token',
    defaultActions: ['view', 'create', 'update', 'delete', 'manage'],
    supportsDynamicConditions: false,
    transformer: (data) => ({
      id: String(data.id ?? ''),
      name: typeof data.name === 'string' ? data.name : undefined,
      scopes: Array.isArray(data.scopes) ? data.scopes as string[] : undefined,
      owner: typeof data.owner === 'string' ? data.owner : undefined,
      createdAt: typeof data.createdAt === 'number' ? data.createdAt : undefined,
      expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : undefined,
    }),
  },
};

// ─── Resource Registry ───────────────────────────────────────────────────────

/**
 * Registry for resource types and their attributes.
 */
export class ResourceRegistry {
  private types: Record<ResourceType, ResourceTypeDefinition> = { ...RESOURCE_TYPES };
  private customTypes: Map<string, ResourceTypeDefinition> = new Map();

  /**
   * Get a resource type definition.
   */
  getResourceType(type: ResourceType | string): ResourceTypeDefinition | undefined {
    if (this.isValidType(type)) {
      return this.types[type as ResourceType];
    }
    return this.customTypes.get(type);
  }

  /**
   * Check if a type is valid.
   */
  isValidType(type: string): type is ResourceType {
    return type in RESOURCE_TYPES;
  }

  /**
   * Register a custom resource type.
   */
  registerType<T extends ResourceAttributes>(definition: ResourceTypeDefinition<T>): void {
    this.customTypes.set(definition.type, definition as ResourceTypeDefinition);
  }

  /**
   * List all registered resource types.
   */
  listTypes(): ResourceTypeDefinition[] {
    const builtIn = Object.values(this.types);
    const custom = Array.from(this.customTypes.values());
    return [...builtIn, ...custom];
  }

  /**
   * Get default actions for a resource type.
   */
  getDefaultActions(type: ResourceType | string): string[] {
    const def = this.getResourceType(type);
    return def?.defaultActions ?? [];
  }

  /**
   * Check if a resource type supports dynamic conditions.
   */
  supportsDynamicConditions(type: ResourceType | string): boolean {
    const def = this.getResourceType(type);
    return def?.supportsDynamicConditions ?? false;
  }

  /**
   * Transform raw data to resource attributes.
   */
  transform<T extends ResourceAttributes>(type: ResourceType | string, data: Record<string, unknown>): T | null {
    const def = this.getResourceType(type);
    if (!def?.transformer) return null;
    return def.transformer(data) as T;
  }

  /**
   * Create a resource object from attributes.
   */
  createResource<T extends ResourceAttributes>(type: ResourceType | string, attributes: T) {
    return {
      type: type as ResourceType,
      attributes,
    };
  }
}

/**
 * Singleton resource registry instance.
 */
let registryInstance: ResourceRegistry | null = null;

/**
 * Get the resource registry singleton.
 */
export function getResourceRegistry(): ResourceRegistry {
  if (!registryInstance) {
    registryInstance = new ResourceRegistry();
  }
  return registryInstance;
}

// ─── Re-export Types ─────────────────────────────────────────────────────────

export type { CampaignAttributes, RunAttributes, ArtifactAttributes, NetworkAttributes, TokenAttributes };