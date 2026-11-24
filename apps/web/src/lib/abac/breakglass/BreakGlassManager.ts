/**
 * Break-Glass Manager - Emergency access with approval workflow.
 *
 * Features:
 * - Emergency access requests with reason
 * - Multi-party approval workflow
 * - Time-bounded temporary access
 * - Full audit trail
 */

import { selectRecordDriver, readPositiveIntegerEnv } from '@/lib/storage/record-driver';
import { getAuditLogger, logAuthorizationEvent } from '../audit/AuditLogger';
import { logger } from '@/lib/logger';

// ─── Break Glass Types ───────────────────────────────────────────────────────

/**
 * Break-glass request status.
 */
export type BreakGlassStatus = 'pending' | 'approved' | 'denied' | 'revoked' | 'expired' | 'completed';

/**
 * Break-glass request.
 */
export interface BreakGlassRequest {
  /** Request ID */
  id: string;
  /** Who requested access */
  requester: {
    id: string;
    identityType: 'github' | 'api-key' | 'oidc';
    subject: string;
  };
  /** Reason for emergency access */
  reason: string;
  /** What access is needed */
  access: BreakGlassAccess;
  /** Status */
  status: BreakGlassStatus;
  /** Requested at */
  requestedAt: string;
  /** Expires at (if time-bound) */
  expiresAt?: string;
  /** Duration in seconds */
  durationSeconds?: number;
  /** Approvers who approved */
  approvers?: Array<{
    id: string;
    identityType: 'github' | 'api-key' | 'oidc';
    subject: string;
    approvedAt: string;
    reason?: string;
  }>;
  /** Who revoked (if revoked) */
  revokedBy?: {
    id: string;
    subject: string;
    at: string;
    reason?: string;
  };
  /** Request ID for tracking */
  requestId?: string;
}

/**
 * Access requirements for break-glass.
 */
export interface BreakGlassAccess {
  /** Principal ID to grant access to */
  principalId?: string;
  /** Actions that should be permitted */
  actions?: string[];
  /** Resources that should be accessible */
  resources?: string[];
  /** Duration in seconds (0 = indefinite) */
  durationSeconds?: number;
  /** Scope of access (read, write, admin) */
  scope?: 'read' | 'write' | 'admin';
}

/**
 * Approval configuration.
 */
export interface ApprovalConfig {
  /** Number of required approvals */
  requiredApprovals: number;
  /** Who can approve (all roles, or specific list) */
  approvers: 'all' | string[]; // 'all' means any maintainer can approve
  /** Maximum time for approvals (seconds) */
  approvalTimeoutSeconds?: number;
  /** Auto-deny after timeout */
  autoDeny?: boolean;
}

// ─── Record Keys ───────────────────────────────────────────────────────────

export const BREAKGLASS_REQUESTS_KEY = 'abac:breakglass:requests';
export const BREAKGLASS_APPROVERS_KEY = 'abac:breakglass:approvers';
export const BREAKGLASS_CONFIG_KEY = 'abac:breakglass:config';

const DEFAULT_APPROVAL_TIMEOUT = 60 * 60; // 1 hour
const DEFAULT_DURATION = 4 * 60 * 60; // 4 hours

// ─── Break Glass Manager ──────────────────────────────────────────────────────

/**
 * Manages emergency access requests.
 */
export class BreakGlassManager {
  private driver: ReturnType<typeof selectRecordDriver>;

  constructor() {
    this.driver = selectRecordDriver();
  }

  /**
   * Create a break-glass request.
   */
  async requestAccess(params: {
    requester: { id: string; identityType: 'github' | 'api-key' | 'oidc'; subject: string };
    reason: string;
    access: BreakGlassAccess;
    durationSeconds?: number;
  }): Promise<BreakGlassRequest> {
    const id = this.generateId();
    const now = new Date().toISOString();
    const expiresAt = params.durationSeconds ? new Date(Date.now() + params.durationSeconds * 1000).toISOString() : undefined;

    const request: BreakGlassRequest = {
      id,
      requester: params.requester,
      reason: params.reason,
      access: params.access,
      status: 'pending',
      requestedAt: now,
      expiresAt,
      durationSeconds: params.durationSeconds ?? DEFAULT_DURATION,
    };

    await this.driver.putRecord(this.requestKey(id), JSON.stringify(request));
    await this.driver.addToIndex(BREAKGLASS_REQUESTS_KEY, id);
    await this.driver.putRecord(this.configKey('requests', 'pending'), JSON.stringify({
      [id]: request,
    }));

    // Log the request
    logAuthorizationEvent({
      principal: {
        id: params.requester.id,
        identityType: params.requester.identityType,
        subject: params.requester.subject,
        authenticated: true,
      },
      action: 'breakglass.request',
      resource: { type: 'break-glass', id },
      decision: 'permit',
      reason: 'Break-glass request submitted',
      latencyMs: 0,
    });

    logger.warn('Break-glass request created', {
      requestId: id,
      requester: params.requester.subject,
      reason: params.reason,
    });

    return request;
  }

  /**
   * Approve a break-glass request.
   */
  async approveRequest(params: {
    requestId: string;
    approver: { id: string; identityType: 'github' | 'api-key' | 'oidc'; subject: string };
    reason?: string;
  }): Promise<BreakGlassRequest> {
    const raw = await this.driver.getRecord(this.requestKey(params.requestId));
    if (!raw) throw new Error('Request not found');

    const request = JSON.parse(raw) as BreakGlassRequest;
    if (request.status !== 'pending') throw new Error(`Request is not pending (status: ${request.status})`);

    // Check if already approved by this approver
    if (request.approvers?.some(a => a.id === params.approver.id)) {
      throw new Error('Already approved by this approver');
    }

    // Add approval
    const approver = {
      id: params.approver.id,
      identityType: params.approver.identityType,
      subject: params.approver.subject,
      approvedAt: new Date().toISOString(),
      reason: params.reason,
    };

    const updatedApprovers = [...(request.approvers ?? []), approver];
    request.approvers = updatedApprovers;

    // Check if we have enough approvals
    const config = await this.getConfig();
    const required = config.requiredApprovals;

    if (updatedApprovers.length >= required) {
      request.status = 'approved';
      await this.activateRequest(request);
    }

    await this.driver.putRecord(this.requestKey(params.requestId), JSON.stringify(request));

    return request;
  }

  /**
   * Deny a break-glass request.
   */
  async denyRequest(params: {
    requestId: string;
    requester: { id: string; subject: string };
    reason?: string;
  }): Promise<void> {
    const raw = await this.driver.getRecord(this.requestKey(params.requestId));
    if (!raw) throw new Error('Request not found');

    const request = JSON.parse(raw) as BreakGlassRequest;
    if (request.status !== 'pending') throw new Error(`Request cannot be denied (status: ${request.status})`);

    request.status = 'denied';
    await this.driver.putRecord(this.requestKey(params.requestId), JSON.stringify(request));

    logger.warn('Break-glass request denied', {
      requestId: params.requestId,
      requester: params.requester.subject,
      reason: params.reason,
    });
  }

  /**
   * Revoke an active break-glass request.
   */
  async revokeRequest(params: {
    requestId: string;
    requester: { id: string; subject: string };
    reason?: string;
  }): Promise<void> {
    const raw = await this.driver.getRecord(this.requestKey(params.requestId));
    if (!raw) throw new Error('Request not found');

    const request = JSON.parse(raw) as BreakGlassRequest;
    if (request.status !== 'approved') throw new Error(`Request cannot be revoked (status: ${request.status})`);

    request.status = 'revoked';
    request.revokedBy = {
      id: params.requester.id,
      subject: params.requester.subject,
      at: new Date().toISOString(),
      reason: params.reason,
    };

    await this.driver.putRecord(this.requestKey(params.requestId), JSON.stringify(request));

    logger.warn('Break-glass request revoked', {
      requestId: params.requestId,
      revokedBy: params.requester.subject,
      reason: params.reason,
    });
  }

  /**
   * Get a break-glass request.
   */
  async getRequest(id: string): Promise<BreakGlassRequest | null> {
    const raw = await this.driver.getRecord(this.requestKey(id));
    return raw ? JSON.parse(raw) : null;
  }

  /**
   * List break-glass requests.
   */
  async listRequests(options: {
    status?: BreakGlassStatus;
    limit?: number;
    requesterId?: string;
  } = {}): Promise<BreakGlassRequest[]> {
    const raw = await this.driver.listEntries(BREAKGLASS_REQUESTS_KEY, options.limit ?? 100);
    const requests: BreakGlassRequest[] = [];

    for (const entry of raw) {
      try {
        const request = JSON.parse(entry) as BreakGlassRequest;

        if (options.status && request.status !== options.status) continue;
        if (options.requesterId && request.requester.id !== options.requesterId) continue;

        requests.push(request);
      } catch {
        // Skip malformed entries
      }
    }

    return requests.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }

  /**
   * Check and expire any expired requests.
   */
  async checkExpiredRequests(): Promise<string[]> {
    const now = Date.now();
    const requests = await this.listRequests({ status: 'approved' });
    const expired: string[] = [];

    for (const request of requests) {
      if (request.expiresAt) {
        const expiry = new Date(request.expiresAt).getTime();
        if (now > expiry) {
          request.status = 'expired';
          await this.driver.putRecord(this.requestKey(request.id), JSON.stringify(request));

          logger.warn('Break-glass request expired', { requestId: request.id });
          expired.push(request.id);
        }
      }
    }

    return expired;
  }

  /**
   * Activate a break-glass request (grant temporary permissions).
   */
  private async activateRequest(request: BreakGlassRequest): Promise<void> {
    // In a real implementation, this would:
    // 1. Create temporary role assignments
    // 2. Set up time-limited permissions
    // 3. Log the activation

    logger.info('Break-glass access activated', {
      requestId: request.id,
      requester: request.requester.subject,
    });

    // Log activation
    logAuthorizationEvent({
      principal: {
        id: request.requester.id,
        identityType: request.requester.identityType,
        subject: request.requester.subject,
        authenticated: true,
      },
      action: 'breakglass.activate',
      resource: { type: 'break-glass', id: request.id },
      decision: 'permit',
      reason: 'Break-glass access activated',
      latencyMs: 0,
    });
  }

  // ─── Configuration ────────────────────────────────────────────────────────

  /**
   * Set approval configuration.
   */
  async setConfig(config: ApprovalConfig): Promise<void> {
    await this.driver.putRecord(BREAKGLASS_CONFIG_KEY, JSON.stringify(config));
  }

  /**
   * Get approval configuration.
   */
  async getConfig(): Promise<ApprovalConfig> {
    const raw = await this.driver.getRecord(BREAKGLASS_CONFIG_KEY);
    if (raw) {
      const config = JSON.parse(raw) as ApprovalConfig;
      // Set defaults
      config.requiredApprovals = config.requiredApprovals ?? 1;
      config.approvalTimeoutSeconds = config.approvalTimeoutSeconds ?? DEFAULT_APPROVAL_TIMEOUT;
      return config;
    }

    // Default config
    return {
      requiredApprovals: 1,
      approvers: 'all',
      approvalTimeoutSeconds: DEFAULT_APPROVAL_TIMEOUT,
      autoDeny: true,
    };
  }

  // ─── Keys ────────────────────────────────────────────────────────────────

  private requestKey(id: string): string {
    return `request:${id}`;
  }

  private configKey(type: string, subtype?: string): string {
    return `config:${type}${subtype ? `:${subtype}` : ''}`;
  }

  private generateId(): string {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `bg_${hex}`;
  }
}

// ─── Approval Workflow ──────────────────────────────────────────────────────

/**
 * Multi-party approval workflow.
 */
export class ApprovalWorkflow {
  private manager: BreakGlassManager;
  private config: ApprovalConfig | null = null;

  constructor() {
    this.manager = new BreakGlassManager();
  }

  /**
   * Initialize the workflow.
   */
  async initialize(): Promise<void> {
    this.config = await this.manager.getConfig();
  }

  /**
   * Request approval for a break-glass request.
   */
  async requestApproval(params: {
    requestId: string;
    requester: { id: string; identityType: 'github' | 'api-key' | 'oidc'; subject: string };
    reason: string;
  }): Promise<{ approved: boolean; pendingApprovals: number; requiredApprovals: number }> {
    const request = await this.manager.getRequest(params.requestId);
    if (!request) throw new Error('Request not found');

    if (request.status !== 'pending') {
      return {
        approved: false,
        pendingApprovals: 0,
        requiredApprovals: 0,
      };
    }

    // Check if requester is already an approver
    const currentApprovals = request.approvers?.length ?? 0;
    const config = this.config;
    if (!config) {
      return {
        approved: false,
        pendingApprovals: 0,
        requiredApprovals: 0,
      };
    }
    const remaining = Math.max(0, config.requiredApprovals - currentApprovals);

    return {
      approved: false,
      pendingApprovals: remaining,
      requiredApprovals: config.requiredApprovals,
    };
  }

  /**
   * Submit an approval.
   */
  async submitApproval(params: {
    requestId: string;
    approver: { id: string; identityType: 'github' | 'api-key' | 'oidc'; subject: string };
    reason?: string;
  }): Promise<{ approved: boolean; request?: BreakGlassRequest; error?: string }> {
    try {
      const request = await this.manager.approveRequest({
        requestId: params.requestId,
        approver: params.approver,
        reason: params.reason,
      });

      if (request.status === 'approved') {
        return { approved: true, request };
      }

      const config = this.config;
      return {
        approved: false,
        request,
        error: config ? `Request now has ${request.approvers?.length ?? 0} of ${config.requiredApprovals} approvals` : 'Config not initialized',
      };
    } catch (error) {
      return {
        approved: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// ─── Convenience Functions ──────────────────────────────────────────────────

let breakGlassManager: BreakGlassManager | null = null;

/**
 * Get the break-glass manager singleton.
 */
export function getBreakGlassManager(): BreakGlassManager {
  if (!breakGlassManager) {
    breakGlassManager = new BreakGlassManager();
  }
  return breakGlassManager;
}

/**
 * Request emergency access.
 */
export async function requestEmergencyAccess(params: {
  requester: { id: string; identityType: 'github' | 'api-key' | 'oidc'; subject: string };
  reason: string;
  access: BreakGlassAccess;
}): Promise<BreakGlassRequest> {
  return getBreakGlassManager().requestAccess(params);
}

/**
 * Check for expired break-glass requests.
 */
export async function checkExpiredBreakGlass(): Promise<string[]> {
  return getBreakGlassManager().checkExpiredRequests();
}