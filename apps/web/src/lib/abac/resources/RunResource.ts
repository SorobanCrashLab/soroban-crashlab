/**
 * Run Resource - Specific resource implementation for runs.
 */

import type { Resource, RunAttributes, ContextAttributes, Action } from '../attributes';
import { getResourceResolver } from './ResourceResolver';
import { PolicyEvaluator } from '../PolicyEngine';
import { logger } from '@/lib/logger';

/**
 * Run resource adapter.
 */
export class RunResource {
  private resolver: ReturnType<typeof getResourceResolver>;
  private evaluator: ReturnType<typeof PolicyEvaluator.getInstance>;

  constructor() {
    this.resolver = getResourceResolver();
    this.evaluator = PolicyEvaluator.getInstance();
  }

  /**
   * Get a run resource by ID.
   */
  async get(id: string): Promise<Resource | null> {
    return this.resolver.resolve('run', id);
  }

  /**
   * Check if a principal can perform an action on a run.
   */
  async canAccess(
    principalId: string,
    action: Action,
    runId: string,
    context?: ContextAttributes,
  ): Promise<boolean> {
    const resource = await this.get(runId);
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
   * Get all runs a principal can access.
   */
  async listAccessibleRuns(
    principalId: string,
    action: Action = 'view',
    campaignId?: string,
  ): Promise<Resource[]> {
    // In production, this would query with ABAC filters
    const query: { limit?: number; offset?: number; campaignId?: string } = {};

    if (campaignId) {
      query.campaignId = campaignId;
    }

    const runs = await this.resolver.findByAttribute('run', 'campaignId' as keyof import('../attributes').RunAttributes, campaignId ?? '');
    return runs;
  }

  /**
   * Get run permission details.
   */
  async getPermissionDetails(runId: string): Promise<{
    id: string;
    campaignId: string;
    team: string;
    type: string;
    status: string;
    permissions: { action: Action; roles: string[] }[];
    restrictions: string[];
  } | null> {
    const resource = await this.get(runId);
    if (!resource) return null;

    const attrs = resource.attributes as RunAttributes;

    // Determine which roles can access this run
    // Runs inherit permissions from their campaign
    const permissions = [
      { action: 'view' as Action, roles: ['analyst', 'maintainer', 'admin'] },
      { action: 'annotate' as Action, roles: ['analyst', 'maintainer', 'admin'] },
      { action: 'triage' as Action, roles: ['analyst', 'maintainer', 'admin'] },
      { action: 'replay' as Action, roles: ['maintainer', 'admin'] },
      { action: 'delete' as Action, roles: ['admin'] },
      { action: 'manage' as Action, roles: ['admin'] },
    ];

    // Status-based restrictions
    const restrictions: string[] = [];
    if (attrs.status === 'completed') {
      // Completed runs may have read-only access
    }
    if (attrs.status === 'failed') {
      // Failed runs may have additional logging requirements
    }

    return {
      id: attrs.id,
      campaignId: attrs.campaignId,
      team: attrs.team ?? 'unknown',
      type: attrs.type ?? 'fuzz',
      status: attrs.status ?? 'unknown',
      permissions,
      restrictions,
    };
  }

  /**
   * Check if a run belongs to a campaign a principal has access to.
   */
  async isAccessibleInCampaign(
    principalId: string,
    runId: string,
    campaignId: string,
  ): Promise<boolean> {
    const resource = await this.get(runId);
    if (!resource) return false;

    const attrs = resource.attributes as RunAttributes;
    return attrs.campaignId === campaignId;
  }
}

/**
 * Singleton run resource adapter.
 */
let runResourceInstance: RunResource | null = null;

export function getRunResource(): RunResource {
  if (!runResourceInstance) {
    runResourceInstance = new RunResource();
  }
  return runResourceInstance;
}