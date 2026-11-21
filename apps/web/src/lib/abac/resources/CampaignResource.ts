/**
 * Campaign Resource - Specific resource implementation for campaigns.
 */

import type { Resource, CampaignAttributes, ContextAttributes, Action } from '../attributes';
import { getResourceResolver } from './ResourceResolver';
import { PolicyEvaluator } from '../PolicyEngine';
import { logger } from '@/lib/logger';

/**
 * Campaign resource adapter.
 */
export class CampaignResource {
  private resolver: ReturnType<typeof getResourceResolver>;
  private evaluator: ReturnType<typeof PolicyEvaluator.getInstance>;

  constructor() {
    this.resolver = getResourceResolver();
    this.evaluator = PolicyEvaluator.getInstance();
  }

  /**
   * Get a campaign resource by ID.
   */
  async get(id: string): Promise<Resource | null> {
    return this.resolver.resolve('campaign', id);
  }

  /**
   * Check if a principal can perform an action on a campaign.
   */
  async canAccess(
    principalId: string,
    action: Action,
    campaignId: string,
    context?: ContextAttributes,
  ): Promise<boolean> {
    const resource = await this.get(campaignId);
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
   * Get all campaigns a principal can access.
   */
  async listAccessibleCampaigns(
    principalId: string,
    action: Action = 'view',
  ): Promise<Resource[]> {
    // In production, this would query with ABAC filters
    // For now, return all campaigns
    const campaigns = await this.resolver.findByAttribute('campaign', 'team' as keyof CampaignAttributes, '');
    return campaigns;
  }

  /**
   * Get campaign permission details.
   */
  async getPermissionDetails(campaignId: string): Promise<{
    id: string;
    name: string;
    team: string;
    permissions: { action: Action; roles: string[] }[];
    restrictions: string[];
  } | null> {
    const resource = await this.get(campaignId);
    if (!resource) return null;

    const attrs = resource.attributes as CampaignAttributes;

    // Determine which roles can access this campaign
    const permissions = [
      { action: 'view' as Action, roles: ['analyst', 'maintainer', 'admin'] },
      { action: 'create' as Action, roles: ['maintainer', 'admin'] },
      { action: 'update' as Action, roles: ['maintainer', 'admin'] },
      { action: 'delete' as Action, roles: ['admin'] },
      { action: 'manage' as Action, roles: ['admin'] },
    ];

    // Team-based restrictions
    const restrictions: string[] = [];
    if (attrs.team) {
      // Only team members can access
    }
    if (attrs.expiresAt && Date.now() > attrs.expiresAt) {
      restrictions.push('expired');
    }

    return {
      id: attrs.id,
      name: attrs.name ?? attrs.id,
      team: attrs.team ?? 'unknown',
      permissions,
      restrictions,
    };
  }
}

/**
 * Singleton campaign resource adapter.
 */
let campaignResourceInstance: CampaignResource | null = null;

export function getCampaignResource(): CampaignResource {
  if (!campaignResourceInstance) {
    campaignResourceInstance = new CampaignResource();
  }
  return campaignResourceInstance;
}