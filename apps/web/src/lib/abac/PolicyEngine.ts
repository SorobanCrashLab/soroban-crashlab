/**
 * Policy Engine - Cedar/OPA policy evaluation wrapper.
 *
 * This module provides the core policy evaluation functionality.
 * It supports both Cedar (preferred) and OPA/Rego as alternatives.
 *
 * Design Goals:
 * - Authorization latency < 10ms p99
 * - 10,000 req/s throughput
 * - Policy hot reload support (< 30s)
 * - Cached evaluation for performance
 */

import type { PrincipalAttributes, Resource, ContextAttributes, Action } from './attributes';
import { selectPolicyStore } from './policies/PolicyStore';
import { getActivePolicyVersion } from './policies';
import { PolicyCache } from './PolicyCache';
import { logger } from '../logger';

// ─── Policy Evaluation Types ─────────────────────────────────────────────────

/**
 * Result of a policy evaluation.
 */
export interface PolicyDecision {
  /** Whether access is permitted */
  permitted: boolean;
  /** Reason for the decision (useful for debugging) */
  reason?: string;
  /** Policy ID that made the decision */
  policyId?: string;
  /** Any obligation data that should be enforced */
  obligations?: PolicyObligation[];
  /** Conditions that apply */
  conditions?: PolicyCondition[];
}

/**
 * Policy obligation - requirements that must be enforced if permitted.
 */
export interface PolicyObligation {
  /** Obligation type */
  type: string;
  /** Obligation data */
  data: Record<string, unknown>;
}

/**
 * Policy condition - constraints that affect the decision.
 */
export interface PolicyCondition {
  /** Condition type */
  type: string;
  /** Condition data */
  data: Record<string, unknown>;
  /** Whether condition is satisfied */
  satisfied: boolean;
}

// ─── Cedar Policy Engine ─────────────────────────────────────────────────────

/**
 * Options for policy evaluation.
 */
export interface PolicyEvalOptions {
  /** Cache the result */
  cache?: boolean;
  /** Include debug information */
  debug?: boolean;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Cedar-compatible policy evaluation.
 *
 * This class wraps the cedar-policy npm package for client-side policy
 * evaluation. For server-side evaluation in Edge Runtime, OPA WASM is
 * the alternative.
 */
export class CedarPolicyEngine {
  private static instance: CedarPolicyEngine | null = null;
  private cache: PolicyCache;
  private initialized = false;
  private policies: Map<string, unknown> = new Map();
  private policyVersions: Map<string, string> = new Map();

  private constructor() {
    this.cache = new PolicyCache();
  }

  /**
   * Get the singleton instance.
   */
  static getInstance(): CedarPolicyEngine {
    if (!CedarPolicyEngine.instance) {
      CedarPolicyEngine.instance = new CedarPolicyEngine();
    }
    return CedarPolicyEngine.instance;
  }

  /**
   * Initialize the policy engine.
   * Loads policies from the policy store.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const store = selectPolicyStore();
    const policies = await store.listPolicies({ activeOnly: true });

    for (const policy of policies) {
      this.policies.set(policy.id, this.parseCedarPolicy(policy.cedarCode));
      this.policyVersions.set(policy.id, policy.version);
    }

    this.initialized = true;
    logger.info('Cedar policy engine initialized', {
      policyCount: policies.length,
    });
  }

  /**
   * Parse Cedar policy string into an AST.
   */
  private parseCedarPolicy(code: string): unknown {
    // In a real implementation, this would use cedar-policy's parser
    // For now, we store the raw code and compile on evaluation
    return { raw: code };
  }

  /**
   * Evaluate a policy decision.
   *
   * @param principal - The principal attributes
   * @param action - The action to evaluate
   * @param resource - The resource being accessed
   * @param context - The request context
   * @param options - Evaluation options
   * @returns The policy decision
   */
  async evaluate(
    principal: PrincipalAttributes,
    action: Action,
    resource: Resource,
    context: ContextAttributes,
    options: PolicyEvalOptions = {},
  ): Promise<PolicyDecision> {
    // Check cache first
    if (options.cache) {
      const cached = this.cache.getDecision(principal.id, action, resource);
      if (cached) {
        return cached;
      }
    }

    // Get active policy version
    const activeVersion = await getActivePolicyVersion();

    // Build evaluation context
    const evalContext = this.buildEvalContext(principal, resource, context);

    // Evaluate against all applicable policies
    let decision: PolicyDecision = {
      permitted: false,
      reason: 'No applicable policy found',
    };

    // Policy evaluation order matters - first match wins
    for (const [policyId, policyAst] of this.policies) {
      const result = await this.evaluatePolicy(
        policyId,
        policyAst,
        evalContext,
        action,
      );

      if (result.permitted) {
        decision = result;
        break;
      }
    }

    // Cache the decision
    if (options.cache) {
      this.cache.setDecision(principal.id, action, resource, decision);
    }

    return decision;
  }

  /**
   * Build evaluation context for Cedar.
   */
  private buildEvalContext(
    principal: PrincipalAttributes,
    resource: Resource,
    context: ContextAttributes,
  ): Record<string, unknown> {
    return {
      principal: {
        id: principal.id,
        identityType: principal.identityType,
        role: principal.role,
        teams: principal.teams,
        groups: principal.groups,
        riskScore: principal.riskScore,
        updatedAt: principal.updatedAt,
      },
      resource: {
        type: resource.type,
        id: this.getResourceId(resource),
        ...this.flattenResourceAttributes(resource.attributes),
      },
      context: {
        time: new Date(context.time).toISOString(),
        ip: context.ip,
        userAgent: context.userAgent,
        requestId: context.requestId,
        mfaVerified: context.mfaVerified,
        location: context.location,
        device: context.device,
        isDryRun: context.isDryRun,
        timezone: context.timezone,
      },
    };
  }

  /**
   * Get resource ID from resource object.
   */
  private getResourceId(resource: Resource): string {
    // Access id via known attribute types
    const attrs = resource.attributes as { id?: string | number } | Record<string, unknown>;
    return String((attrs as { id?: string | number }).id ?? (attrs as Record<string, unknown>).id ?? '');
  }

  /**
   * Flatten resource attributes for policy evaluation.
   */
  private flattenResourceAttributes(attrs: ResourceAttributes): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(attrs as object)) {
      if (value !== undefined && value !== null) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Evaluate a single policy.
   */
  private async evaluatePolicy(
    policyId: string,
    policyAst: unknown,
    context: Record<string, unknown>,
    action: Action,
  ): Promise<PolicyDecision> {
    // In a real implementation, this would use cedar-policy's evaluate function
    // For simulation, we'll check the policy's permit/allow rules
    const code = (policyAst as { raw: string }).raw;

    // Simple pattern matching for demonstration
    // In production, this would be actual Cedar evaluation
    if (this.matchesCedarPolicy(code, context, action)) {
      return {
        permitted: true,
        reason: 'Policy permitted the action',
        policyId,
      };
    }

    return {
      permitted: false,
      reason: 'Policy did not permit the action',
      policyId,
    };
  }

  /**
   * Check if a policy matches the request.
   * This is a simplified implementation - production would use Cedar SDK properly.
   */
  private matchesCedarPolicy(
    code: string,
    context: Record<string, unknown>,
    action: Action,
  ): boolean {
    // This is a placeholder - in production, use actual Cedar evaluation
    // The pattern would be to parse the Cedar code, compile to WASM, and evaluate

    // For now, check if there's a permit statement that would match
    // This simulation checks for basic patterns

    const principal = context.principal as Record<string, unknown>;
    const resource = context.resource as Record<string, unknown>;
    const requestContext = context.context as Record<string, unknown>;

    // Check for admin bypass
    if (principal.role === 'admin') {
      return true;
    }

    // Parse simple Cedar-style conditions from code
    // This is a simplified pattern matcher for demonstration
    const permitPattern = /permit\s*\([^)]+overn\s*\{([^}]+)\}/s;
    const match = code.match(permitPattern);

    if (!match) return false;

    const conditions = match[1];

    // Check role condition
    if (conditions.includes(`principal.role == "maintainer"`) ||
        conditions.includes(`principal.role == "admin`)) {
      if (principal.role === 'maintainer' || principal.role === 'admin') {
        return true;
      }
    }

    // Check team ownership
    const teamMatch = conditions.match(/principal\.team\s*==\s*resource\.team/);
    if (teamMatch) {
      const principalTeam = (principal as Record<string, unknown>).teams as string[] | undefined;
      const resourceTeam = (resource as Record<string, unknown>).team as string | undefined;
      if (principalTeam && resourceTeam && principalTeam.includes(resourceTeam)) {
        return true;
      }
    }

    // Check basic permissions by role
    if (conditions.includes('principal.role == "analyst"')) {
      if (principal.role === 'analyst') {
        // Analysts can only view/triage, not modify
        if (action === 'view' || action === 'annotate' || action === 'triage') {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Reload policies from the store.
   */
  async reloadPolicies(): Promise<void> {
    const previousCount = this.policies.size;

    this.policies.clear();
    this.policyVersions.clear();

    const store = selectPolicyStore();
    const policies = await store.listPolicies({ activeOnly: true });

    for (const policy of policies) {
      this.policies.set(policy.id, this.parseCedarPolicy(policy.cedarCode));
      this.policyVersions.set(policy.id, policy.version);
    }

    logger.info('Policies reloaded', {
      previousCount,
      newCount: policies.length,
    });

    // Invalidate cache since policies changed
    this.cache.invalidate();
  }

  /**
   * Get current loaded policies.
   */
  getPolicies(): Map<string, unknown> {
    return this.policies;
  }
}

// ─── OPA Policy Engine (Alternative) ──────────────────────────────────────────

/**
 * OPA/Rego policy engine as an alternative to Cedar.
 * Uses OPA WASM for fast evaluation.
 */
export class OpaPolicyEngine {
  private static instance: OpaPolicyEngine | null = null;
  private wasmModule: WebAssembly.Module | null = null;
  private cache: PolicyCache;

  private constructor() {
    this.cache = new PolicyCache();
  }

  static getInstance(): OpaPolicyEngine {
    if (!OpaPolicyEngine.instance) {
      OpaPolicyEngine.instance = new OpaPolicyEngine();
    }
    return OpaPolicyEngine.instance;
  }

  async initialize(): Promise<void> {
    // In production, load OPA WASM module
    // This is a placeholder for WASM loading
    logger.info('OPA policy engine initialized');
  }

  async evaluate(
    principal: PrincipalAttributes,
    action: Action,
    resource: Resource,
    context: ContextAttributes,
    options: PolicyEvalOptions = {},
  ): Promise<PolicyDecision> {
    // Implementation would use OPA WASM for evaluation
    return {
      permitted: false,
      reason: 'OPA engine not fully implemented',
    };
  }
}

// ─── Policy Evaluator Service ────────────────────────────────────────────────

/**
 * Main policy evaluator service that wraps the policy engines.
 */
export class PolicyEvaluator {
  private static instance: PolicyEvaluator | null = null;
  private engine: CedarPolicyEngine;
  private opaEngine: OpaPolicyEngine;
  private initialized = false;
  private useOpa = false;

  private constructor() {
    this.engine = CedarPolicyEngine.getInstance();
    this.opaEngine = OpaPolicyEngine.getInstance();
    this.useOpa = process.env.ABAC_ENGINE === 'opa';
  }

  static getInstance(): PolicyEvaluator {
    if (!PolicyEvaluator.instance) {
      PolicyEvaluator.instance = new PolicyEvaluator();
    }
    return PolicyEvaluator.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const env = process.env.ABAC_ENGINE;
    if (env === 'opa') {
      this.useOpa = true;
      await this.opaEngine.initialize();
      logger.info('Using OPA policy engine');
    } else {
      await this.engine.initialize();
      logger.info('Using Cedar policy engine');
    }

    this.initialized = true;
  }

  /**
   * Evaluate authorization.
   *
   * @param principal - The principal attributes
   * @param action - The action to evaluate
   * @param resource - The resource being accessed
   * @param context - The request context
   * @param options - Evaluation options
   * @returns The policy decision
   */
  async evaluate(
    principal: PrincipalAttributes,
    action: Action,
    resource: Resource,
    context: ContextAttributes,
    options: PolicyEvalOptions = {},
  ): Promise<PolicyDecision> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.useOpa) {
      return this.opaEngine.evaluate(principal, action, resource, context, options);
    }

    return this.engine.evaluate(principal, action, resource, context, options);
  }

  /**
   * Reload policies from the store.
   */
  async reload(): Promise<void> {
    if (this.useOpa) {
      await this.opaEngine.initialize();
    } else {
      await this.engine.reloadPolicies();
    }
  }
}

// ─── Resource Attributes Type Import ────────────────────────────────────────

import type { ResourceAttributes } from './attributes';