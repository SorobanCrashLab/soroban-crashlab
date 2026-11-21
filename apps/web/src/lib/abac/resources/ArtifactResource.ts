/**
 * Artifact Resource - Specific resource implementation for artifacts.
 */

import type { Resource, ArtifactAttributes, ContextAttributes, Action, SensitivityLevel } from '../attributes';
import { getResourceResolver } from './ResourceResolver';
import { PolicyEvaluator } from '../PolicyEngine';
import { logger } from '@/lib/logger';

/**
 * Permission details for an artifact.
 */
export interface ArtifactPermissionDetails {
  id: string;
  runId: string;
  campaignId: string;
  team: string;
  type: string;
  sensitivity: SensitivityLevel;
  permissions: { action: Action; roles: string[] }[];
  restrictions: string[];
}

/**
 * Artifact resource adapter.
 */
export class ArtifactResource {
  private resolver: ReturnType<typeof getResourceResolver>;
  private evaluator: ReturnType<typeof PolicyEvaluator.getInstance>;

  constructor() {
    this.resolver = getResourceResolver();
    this.evaluator = PolicyEvaluator.getInstance();
  }

  /**
   * Get an artifact resource by ID.
   */
  async get(id: string): Promise<Resource | null> {
    return this.resolver.resolve('artifact', id);
  }

  /**
   * Check if a principal can perform an action on an artifact.
   */
  async canAccess(
    principalId: string,
    action: Action,
    artifactId: string,
    context?: ContextAttributes,
  ): Promise<boolean> {
    const resource = await this.get(artifactId);
    if (!resource) return false;

    const defaultContext: ContextAttributes = {
      time: Date.now(),
      mfaVerified: false,
    };

    const principal = {
      id: principalId,
      identityType: 'api-key' as const,
      identityValue: principalId,
      role: 'analyst' as const,
      teams: [],
      groups: [],
    };

    const decision = await this.evaluator.evaluate(
      principal,
      action,
      resource,
      context ?? defaultContext,
    );

    return decision.permitted;
  }

  /**
   * Check if an artifact can be downloaded based on sensitivity.
   */
  async canDownload(
    principalId: string,
    artifactId: string,
    principalRole: 'analyst' | 'maintainer' | 'admin',
  ): Promise<boolean> {
    const resource = await this.get(artifactId);
    if (!resource) return false;

    const attrs = resource.attributes as ArtifactAttributes;

    // Sensitivity-based access control
    switch (attrs.sensitivity) {
      case 'public':
        return true;
      case 'internal':
        return principalRole !== 'analyst'; // Analysts need explicit permission
      case 'confidential':
        return principalRole === 'admin';
      case 'restricted':
        return principalRole === 'admin' && false; // Requires explicit approval
      default:
        return principalRole === 'admin';
    }
  }

  /**
   * Get all artifacts a principal can access.
   */
  async listAccessibleArtifacts(
    principalId: string,
    action: Action = 'view',
    runId?: string,
    sensitivity?: SensitivityLevel,
  ): Promise<Resource[]> {
    // In production, this would query with ABAC filters
    const query: Record<string, unknown> = {};

    if (runId) query.runId = runId;
    if (sensitivity) query.sensitivity = sensitivity;

    const artifacts = await this.resolver.findByAttribute('artifact', 'runId' as keyof ArtifactAttributes, runId ?? '');
    return artifacts;
  }

  /**
   * Get artifact permission details.
   */
  async getPermissionDetails(artifactId: string): Promise<ArtifactPermissionDetails | null> {
    const resource = await this.get(artifactId);
    if (!resource) return null;

    const attrs = resource.attributes as ArtifactAttributes;

    // Determine which roles can access this artifact based on sensitivity
    const sensitivityPermissions: Record<SensitivityLevel, { action: Action; roles: string[] }[]> = {
      public: [
        { action: 'view', roles: ['analyst', 'maintainer', 'admin'] },
        { action: 'download', roles: ['analyst', 'maintainer', 'admin'] },
      ],
      internal: [
        { action: 'view', roles: ['analyst', 'maintainer', 'admin'] },
        { action: 'download', roles: ['maintainer', 'admin'] },
      ],
      confidential: [
        { action: 'view', roles: ['maintainer', 'admin'] },
        { action: 'download', roles: ['admin'] },
        { action: 'manage', roles: ['admin'] },
      ],
      restricted: [
        { action: 'view', roles: ['admin'] },
        { action: 'download', roles: ['admin'] },
        { action: 'manage', roles: ['admin'] },
      ],
    };

    const permissions = sensitivityPermissions[attrs.sensitivity ?? 'internal'];

    // Add manage permission for admin if not present
    const existingManage = permissions.find(p => p.action === 'manage');
    if (!existingManage) {
      permissions.push({ action: 'manage', roles: ['admin'] });
    }

    const restrictions: string[] = [];
    if (attrs.sensitivity === 'restricted') {
      restrictions.push('requires approval');
    }

    return {
      id: attrs.id,
      runId: attrs.runId,
      campaignId: attrs.campaignId,
      team: attrs.team ?? 'unknown',
      type: attrs.type ?? 'crash',
      sensitivity: attrs.sensitivity ?? 'internal',
      permissions,
      restrictions,
    };
  }

  /**
   * Check artifact sensitivity level.
   */
  getSensitivityLevel(artifact: ArtifactAttributes): 'public' | 'internal' | 'confidential' | 'restricted' {
    return artifact.sensitivity ?? 'internal';
  }

  /**
   * Can a user download an artifact without approval?
   */
  canDownloadWithoutApproval(
    sensitivity: SensitivityLevel,
    role: 'analyst' | 'maintainer' | 'admin',
  ): boolean {
    switch (sensitivity) {
      case 'public':
        return true;
      case 'internal':
        return role !== 'analyst';
      case 'confidential':
        return role === 'admin';
      case 'restricted':
        return false;
      default:
        return false;
    }
  }
}

/**
 * Singleton artifact resource adapter.
 */
let artifactResourceInstance: ArtifactResource | null = null;

export function getArtifactResource(): ArtifactResource {
  if (!artifactResourceInstance) {
    artifactResourceInstance = new ArtifactResource();
  }
  return artifactResourceInstance;
}