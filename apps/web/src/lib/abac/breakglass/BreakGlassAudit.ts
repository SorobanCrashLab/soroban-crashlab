/**
 * Break Glass Audit - Enhanced audit logging for emergency access.
 */

import type { BaseAuditEvent, AuditPrincipal } from '../audit/AuditLogger';

/**
 * Break-glass audit event.
 */
export interface BreakGlassAuditEvent extends BaseAuditEvent {
  category: 'breakglass';
  action: 'request' | 'approve' | 'deny' | 'revoke' | 'expire' | 'activate';
  requestId: string;
  principal: AuditPrincipal;
  reason: string;
  approvers?: Array<{ principal: AuditPrincipal; timestamp: string; decision: 'approved' | 'denied' }>;
  expiresAt?: string;
  target?: string;
  status: 'pending' | 'approved' | 'denied' | 'revoked' | 'expired' | 'completed';
}

/**
 * Audit entry for break-glass operations.
 */
export interface BreakGlassAuditEntry {
  id: string;
  timestamp: string;
  requestId: string;
  action: 'request' | 'approve' | 'deny' | 'revoke' | 'expire';
  principal: AuditPrincipal;
  details: {
    reason: string;
    approvers?: number;
    requiredApprovals: number;
    expiresAt?: string;
  };
  prevHash?: string;
  eventHash: string;
}

/**
 * Break-glass audit logger.
 */
export class BreakGlassAudit {
  /**
   * Create an audit entry for a break-glass request.
   */
  createRequestEvent(params: {
    requestId: string;
    principal: AuditPrincipal;
    reason: string;
    access: { actions: string[]; resources: string[] };
    expiresAt?: string;
  }): Omit<BaseAuditEvent, 'id' | 'prevHash' | 'eventHash'> & { category: 'breakglass'; action: 'request'; requestId: string } {
    return {
      category: 'breakglass',
      timestamp: new Date().toISOString(),
      version: '1.0',
      action: 'request',
      requestId: params.requestId,
      principal: params.principal,
      reason: params.reason,
      target: params.access.resources.join(','),
      expiresAt: params.expiresAt,
    } as any;
  }

  /**
   * Create an audit entry for an approval.
   */
  createApprovalEvent(params: {
    requestId: string;
    approver: AuditPrincipal;
    reason?: string;
    totalApprovals: number;
    requiredApprovals: number;
  }): Omit<BaseAuditEvent, 'id' | 'prevHash' | 'eventHash'> & {
    category: 'breakglass';
    action: 'approve';
    requestId: string;
    approvers?: Array<{ principal: AuditPrincipal; timestamp: string; decision: 'approved' | 'denied' }>;
  } {
    return {
      category: 'breakglass',
      timestamp: new Date().toISOString(),
      version: '1.0',
      action: 'approve',
      requestId: params.requestId,
      principal: params.approver,
      reason: params.reason,
      approvers: [{
        principal: params.approver,
        timestamp: new Date().toISOString(),
        decision: 'approved',
      }],
    } as any;
  }

  /**
   * Create an audit entry for deny.
   */
  createDenyEvent(params: {
    requestId: string;
    requester: AuditPrincipal;
    reason?: string;
  }): Omit<BaseAuditEvent, 'id' | 'prevHash' | 'eventHash'> & {
    category: 'breakglass';
    action: 'deny';
    requestId: string;
  } {
    return {
      category: 'breakglass',
      timestamp: new Date().toISOString(),
      version: '1.0',
      action: 'deny',
      requestId: params.requestId,
      principal: params.requester,
      reason: params.reason,
    } as any;
  }

  /**
   * Create an audit entry for revocation.
   */
  createRevokeEvent(params: {
    requestId: string;
    requester: AuditPrincipal;
    reason?: string;
  }): Omit<BaseAuditEvent, 'id' | 'prevHash' | 'eventHash'> & {
    category: 'breakglass';
    action: 'revoke';
    requestId: string;
  } {
    return {
      category: 'breakglass',
      timestamp: new Date().toISOString(),
      version: '1.0',
      action: 'revoke',
      requestId: params.requestId,
      principal: params.requester,
      reason: params.reason,
    } as any;
  }

  /**
   * Create an audit entry for activation.
   */
  createActivateEvent(params: {
    requestId: string;
    principal: AuditPrincipal;
  }): Omit<BaseAuditEvent, 'id' | 'prevHash' | 'eventHash'> & {
    category: 'breakglass';
    action: 'activate';
    requestId: string;
  } {
    return {
      category: 'breakglass',
      timestamp: new Date().toISOString(),
      version: '1.0',
      action: 'activate',
      requestId: params.requestId,
      principal: params.principal,
    } as any;
  }

  /**
   * Create an audit entry for expiration.
   */
  createExpireEvent(params: {
    requestId: string;
    principal: AuditPrincipal;
  }): Omit<BaseAuditEvent, 'id' | 'prevHash' | 'eventHash'> & {
    category: 'breakglass';
    action: 'expire';
    requestId: string;
  } {
    return {
      category: 'breakglass',
      timestamp: new Date().toISOString(),
      version: '1.0',
      action: 'expire',
      requestId: params.requestId,
      principal: params.principal,
    } as any;
  }

  /**
   * Format an audit entry for display.
   */
  formatEntry(entry: BreakGlassAuditEvent): string {
    const time = new Date(entry.timestamp).toISOString();
    const action = entry.action.toUpperCase();
    const principal = entry.principal.subject;
    const requestId = entry.requestId;

    return `${time} ${principal} ${action} ${requestId} ${entry.reason}`;
  }

  /**
   * Check if a break-glass request has completed (approved or denied).
   */
  isCompleted(event: BreakGlassAuditEvent): boolean {
    return ['approved', 'denied', 'revoked', 'expired', 'completed'].includes(event.action);
  }

  /**
   * Check if a break-glass request is active (approved but not expired).
   */
  isActive(event: BreakGlassAuditEvent): boolean {
    if (!this.isCompleted(event)) return false;

    if (event.action !== 'activate') return false;

    if (event.expiresAt && new Date(event.expiresAt) < new Date()) {
      return false;
    }

    return true;
  }
}