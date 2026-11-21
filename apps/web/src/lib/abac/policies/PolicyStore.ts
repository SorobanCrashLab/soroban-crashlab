/**
 * Policy Store - CRUD + versioning for policies.
 *
 * Manages policy lifecycle: create, read, update, delete, and version.
 * Policies are stored in the record driver (Redis/Upstash for durability).
 *
 * Features:
 * - Policy CRUD operations
 * - Version tracking
 * - Active policy management
 * - GitOps synchronization support
 */

import { selectRecordDriver, readPositiveIntegerEnv } from '@/lib/storage/record-driver';
import { logger } from '@/lib/logger';

// Policy Types

/**
 * Policy metadata.
 */
export interface PolicyMetadata {
  /** Policy ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Policy description */
  description?: string;
  /** Policy version (semantic versioning) */
  version: string;
  /** Whether this policy is currently active */
  active: boolean;
  /** Who created this policy */
  createdBy?: string;
  /** When the policy was created */
  createdAt: string;
  /** When the policy was last updated */
  updatedAt: string;
  /** Who last updated the policy */
  updatedBy?: string;
  /** Tags for categorization */
  tags?: string[];
  /** Resource scope this policy applies to */
  resourceScope?: string;
  /** Team scope for team-specific policies */
  teamScope?: string;
}

/**
 * Full policy record.
 */
export interface PolicyRecord extends PolicyMetadata {
  /** Cedar policy code */
  cedarCode: string;
  /** OPA Rego policy code (optional) */
  regoCode?: string;
  /** Whether the policy has been validated */
  validated: boolean;
  /** Validation errors if any */
  validationErrors?: string[];
  /** Last test run timestamp */
  lastTestedAt?: string;
  /** Test pass/fail count */
  testResults?: { passed: number; failed: number };
}

/**
 * Policy validation result.
 */
export interface PolicyValidationResult {
  /** Whether the policy is valid */
  valid: boolean;
  /** Validation errors */
  errors: string[];
  /** Warnings */
  warnings?: string[];
}

/**
 * Policy test result.
 */
export interface PolicyTestResult {
  /** Policy ID tested */
  policyId: string;
  /** Test cases that passed */
  passed: number;
  /** Test cases that failed */
  failed: number;
  /** Detailed results */
  results: TestResultDetail[];
}

/**
 * Individual test case result.
 */
export interface TestResultDetail {
  /** Test case ID */
  id: string;
  /** Test description */
  description?: string;
  /** Whether the test passed */
  passed: boolean;
  /** Expected result */
  expected: 'permit' | 'deny';
  /** Actual result */
  actual: 'permit' | 'deny';
  /** Error message if failed */
  error?: string;
}

/**
 * List policies options.
 */
export interface ListPoliciesOptions {
  /** Only return active policies */
  activeOnly?: boolean;
  /** Filter by tag */
  tag?: string;
  /** Filter by resource scope */
  resourceScope?: string;
  /** Filter by team scope */
  teamScope?: string;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

// Record Keys

export const POLICY_STORE_KEY = 'abac:policies';
export const POLICY_INDEX_KEY = 'abac:policies:index';
export const ACTIVE_POLICY_VERSION_KEY = 'abac:active-version';
export const POLICY_TEST_CASES_KEY = 'abac:test-cases';

// Policy Store Implementation

/**
 * Storage for policies with versioning and CRUD operations.
 */
export class PolicyStore {
  private driver: ReturnType<typeof selectRecordDriver>;

  constructor() {
    this.driver = selectRecordDriver();
  }

  /**
   * Create a new policy.
   */
  async createPolicy(record: Omit<PolicyRecord, 'id' | 'createdAt' | 'updatedAt' | 'validated' | 'active'> & { id?: string; active?: boolean }): Promise<PolicyRecord> {
    const id = record.id ?? this.generateId();
    const now = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, createdAt, updatedAt, validated, active, ...rest } = record as any;
    const fullRecord: PolicyRecord = {
      id,
      ...rest,
      createdAt: now,
      updatedAt: now,
      validated: false,
      active: active ?? true,
    };

    const key = this.policyKey(id);
    await this.driver.putRecord(key, JSON.stringify(fullRecord));
    await this.driver.addToIndex(POLICY_INDEX_KEY, key);

    logger.info('Policy created', { policyId: id, name: record.name });
    return fullRecord;
  }

  /**
   * Get a policy by ID.
   */
  async getPolicy(id: string): Promise<PolicyRecord | null> {
    const key = this.policyKey(id);
    const raw = await this.driver.getRecord(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as PolicyRecord;
    } catch {
      return null;
    }
  }

  /**
   * Update an existing policy.
   */
  async updatePolicy(id: string, updates: Partial<PolicyRecord>): Promise<PolicyRecord | null> {
    const existing = await this.getPolicy(id);
    if (!existing) return null;

    const updated: PolicyRecord = {
      ...existing,
      ...updates,
      id, // Preserve original ID
      updatedAt: new Date().toISOString(),
    };

    const key = this.policyKey(id);
    await this.driver.putRecord(key, JSON.stringify(updated));

    logger.info('Policy updated', { policyId: id });
    return updated;
  }

  /**
   * Delete a policy.
   */
  async deletePolicy(id: string): Promise<boolean> {
    const key = this.policyKey(id);
    const existing = await this.driver.getRecord(key);
    if (!existing) return false;

    await this.driver.deleteRecord(key);
    await this.driver.removeFromIndex(POLICY_INDEX_KEY, key);

    // Check if this was the active policy version
    const activeVersion = await this.getActivePolicyVersion();
    if (activeVersion === id) {
      await this.setActivePolicyVersion(''); // Clear active version
      logger.info('Active policy version cleared after policy deletion', { policyId: id });
    }

    logger.info('Policy deleted', { policyId: id });
    return true;
  }

  /**
   * List policies with optional filtering.
   */
  async listPolicies(options: ListPoliciesOptions = {}): Promise<PolicyRecord[]> {
    const driver = this.driver;
    const keys = await driver.listIndex(POLICY_INDEX_KEY);
    const policies: PolicyRecord[] = [];
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    for (const key of keys) {
      const raw = await driver.getRecord(key);
      if (!raw) continue;

      try {
        const policy = JSON.parse(raw) as PolicyRecord;

        // Apply filters
        if (options.activeOnly && !policy.active) continue;
        if (options.tag && (!policy.tags || !policy.tags.includes(options.tag))) continue;
        if (options.resourceScope && policy.resourceScope !== options.resourceScope) continue;
        if (options.teamScope && policy.teamScope !== options.teamScope) continue;

        policies.push(policy);
      } catch {
        // Skip invalid policies
      }
    }

    // Sort by updated date (newest first), then offset and limit
    policies.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return policies.slice(offset, offset + limit);
  }

  /**
   * Find policies by tag.
   */
  async findPoliciesByTag(tag: string): Promise<PolicyRecord[]> {
    return this.listPolicies({ tag });
  }

  /**
   * Find policies by resource scope.
   */
  async findPoliciesByResource(resourceScope: string): Promise<PolicyRecord[]> {
    return this.listPolicies({ resourceScope });
  }

  /**
   * Find policies by team.
   */
  async findPoliciesByTeam(teamScope: string): Promise<PolicyRecord[]> {
    return this.listPolicies({ teamScope });
  }

  // Versioning

  /**
   * Set the active policy version for hot reload.
   */
  async setActivePolicyVersion(policyId: string): Promise<void> {
    await this.driver.putRecord(ACTIVE_POLICY_VERSION_KEY, policyId);
    logger.info('Active policy version set', { policyId });
  }

  /**
   * Get the active policy version.
   */
  async getActivePolicyVersion(): Promise<string> {
    const raw = await this.driver.getRecord(ACTIVE_POLICY_VERSION_KEY);
    return raw ?? '';
  }

  /**
   * Get the active policy record.
   */
  async getActivePolicy(): Promise<PolicyRecord | null> {
    const version = await this.getActivePolicyVersion();
    if (!version) return null;
    return this.getPolicy(version);
  }

  // Policy Keys

  private policyKey(id: string): string {
    return `policy:${id}`;
  }

  private generateId(): string {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `policy_${hex}`;
  }

  // Policy Activation

  /**
   * Activate a policy (sets it as active, deactivates others).
   */
  async activatePolicy(id: string): Promise<boolean> {
    const policy = await this.getPolicy(id);
    if (!policy) return false;

    // Deactivate all other policies
    const allPolicies = await this.listPolicies({ activeOnly: false });
    for (const p of allPolicies) {
      if (p.id !== id) {
        await this.updatePolicy(p.id, { active: false });
      }
    }

    // Activate this policy
    await this.updatePolicy(id, { active: true });

    // Set as active version
    await this.setActivePolicyVersion(id);

    logger.info('Policy activated', { policyId: id });
    return true;
  }

  /**
   * Deactivate all policies and activate a new one.
   */
  async activateNewPolicy(policy: Omit<PolicyRecord, 'active' | 'validated' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<PolicyRecord> {
    // Create the new policy
    const newPolicy = await this.createPolicy({
      ...policy,
      active: true,
    });

    // Deactivate all other policies
    const allPolicies = await this.listPolicies({ activeOnly: false });
    for (const p of allPolicies) {
      if (p.id !== newPolicy.id) {
        await this.driver.putRecord(this.policyKey(p.id), JSON.stringify({
          ...p,
          active: false,
        }));
      }
    }

    // Set as active version
    await this.setActivePolicyVersion(newPolicy.id);

    return newPolicy;
  }

  // Git Sync

  /**
   * Import policy from GitOps source.
   * Returns true if the policy was updated.
   */
  async importFromGit(
    policyData: {
      id: string;
      name: string;
      description?: string;
      version: string;
      cedarCode: string;
      tags?: string[];
      resourceScope?: string;
      teamScope?: string;
      active?: boolean;
    },
    options: { force?: boolean; validate?: boolean } = {},
  ): Promise<{ updated: boolean; policy: PolicyRecord | null }> {
    const existing = await this.getPolicy(policyData.id);

    if (existing && !options.force) {
      // Check if content differs
      if (existing.cedarCode === policyData.cedarCode && existing.version === policyData.version) {
        return { updated: false, policy: existing };
      }
    }

    if (options.validate && existing) {
      // Validate before updating
      const result = await validatePolicy(policyData.cedarCode);
      if (!result.valid) {
        logger.warn('Policy validation failed', { errors: result.errors, policyId: policyData.id });
        return { updated: false, policy: existing };
      }
    }

    if (existing) {
      const updated = await this.updatePolicy(policyData.id, {
        ...policyData,
        validated: !options.validate,
        updatedAt: new Date().toISOString(),
      });
      return { updated: true, policy: updated };
    }

    const created = await this.createPolicy({
      ...policyData,
      active: policyData.active ?? true,
    });

    logger.info('Policy imported from GitOps', { policyId: policyData.id });
    return { updated: true, policy: created };
  }

  /**
   * Export all active policies for GitOps sync.
   */
  async exportForGit(): Promise<Omit<PolicyRecord, 'createdAt' | 'updatedAt' | 'validated' | 'validationErrors' | 'lastTestedAt' | 'testResults'>[]> {
    const policies = await this.listPolicies({ activeOnly: true });
    return policies.map(({ createdAt, updatedAt, validated, ...rest }) => rest);
  }
}

/**
 * Validate a Cedar policy.
 */
export async function validatePolicy(cedarCode: string): Promise<PolicyValidationResult> {
  const errors: string[] = [];

  // Basic syntax checks
  if (!cedarCode || cedarCode.trim().length === 0) {
    errors.push('Policy code is empty');
  } else {
    // Check for permit statements
    if (!cedarCode.includes('permit')) {
      errors.push('Policy must contain at least one permit statement');
    }

    // Check for proper Cedar syntax patterns
    const permitPattern = /permit\s*\([^)]+\)\s*when\s*\{/;
    if (!permitPattern.test(cedarCode)) {
      errors.push('Policy must follow Cedar syntax: permit(...) when { }');
    }

    // Check for balanced braces
    const openBraces = (cedarCode.match(/{/g) ?? []).length;
    const closeBraces = (cedarCode.match(/}/g) ?? []).length;
    if (openBraces !== closeBraces) {
      errors.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Singleton Instance

let policyStoreInstance: PolicyStore | null = null;

/**
 * Get the policy store singleton.
 */
export function selectPolicyStore(): PolicyStore {
  if (!policyStoreInstance) {
    policyStoreInstance = new PolicyStore();
  }
  return policyStoreInstance;
}