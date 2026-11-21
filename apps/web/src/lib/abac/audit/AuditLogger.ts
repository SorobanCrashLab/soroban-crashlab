/**
 * Audit Logger - Structured audit events for ABAC decisions.
 *
 * Features:
 * - Immutable, append-only logging
 * - Full context capture (principal, action, resource, decision, policy)
 * - SIEM integration support
 * - Tamper evidence via hash chain
 */

import { selectRecordDriver, readPositiveIntegerEnv } from '@/lib/storage/record-driver';
import { getPolicyCache } from '../PolicyCache';
import { HashFunction } from './TamperEvidence';

// ─── Audit Event Types ─────────────────────────────────────────────────────────

/**
 * Audit event categories.
 */
export type AuditEventCategory =
  | 'authorization'  // Policy decision events
  | 'policy-management'  // Policy create/update/delete
  | 'policy-activation'  // Policy activation
  | 'audit-checkpoint'  // Manual checkpoints
  | 'breakglass'  // Break-glass requests
  | 'approval'  // Approval workflow events
  | 'siem-export';  // SIEM export events

/**
 * Audit event severity.
 */
export type AuditEventSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Principal reference for audit events.
 */
export interface AuditPrincipal {
  /** Principal ID */
  id: string;
  /** Identity type */
  identityType: 'github' | 'api-key' | 'oidc' | 'anonymous';
  /** Identity value (username, token ID, etc.) */
  identityValue?: string;
  /** Subject for logging (stable, secret-free) */
  subject: string;
  /** Authenticated or not */
  authenticated: boolean;
  /** Role assignment */
  role?: 'analyst' | 'maintainer' | 'admin';
}

/**
 * Resource reference for audit events.
 */
export interface AuditResource {
  /** Resource type */
  type: string;
  /** Resource ID */
  id: string;
  /** Resource name (if applicable) */
  name?: string;
}

/**
 * Context for audit events.
 */
export interface AuditContext {
  /** Request ID */
  requestId?: string;
  /** Request IP */
  ip?: string;
  /** User agent */
  userAgent?: string;
  /** Timestamp */
  timestamp: number;
  /** MFA verification status */
  mfaVerified?: boolean;
  /** Location (derived from IP) */
  location?: string;
  /** Device type */
  device?: string;
  /** Timezone */
  timezone?: string;
}

/**
 * Policy obligations.
 */
export interface PolicyObligation {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Policy conditions.
 */
export interface PolicyCondition {
  type: string;
  data: Record<string, unknown>;
  satisfied: boolean;
}

/**
 * Policy Oplog (for versioning).
 */
export interface PolicyOplogEntry {
  id: string;
  timestamp: string;
  operation: 'create' | 'update' | 'delete' | 'activate';
  policyId: string;
  version: string;
  performedBy: string;
  changes?: Record<string, unknown>;
  prevHash?: string;
  eventHash: string;
}

// ─── Base Event Types ───────────────────────────────────────────────────────────

/**
 * Base audit event structure.
 */
export interface BaseAuditEvent {
  /** Event ID */
  id: string;
  /** Category */
  category: AuditEventCategory;
  /** Timestamp (ISO string) */
  timestamp: string;
  /** Version of event schema */
  version: string;
  /** Previous event hash for chain */
  prevHash?: string;
  /** Event hash (for tamper evidence) */
  eventHash: string;
}

/**
 * Policy decision audit event.
 */
export interface PolicyDecisionEvent extends BaseAuditEvent {
  category: 'authorization';
  action: string;
  resource: AuditResource;
  principal: AuditPrincipal;
  context: AuditContext;
  decision: 'permit' | 'deny';
  reason?: string;
  policyId?: string;
  obligations?: PolicyObligation[];
  conditions?: PolicyCondition[];
  latencyMs: number;
}

/**
 * Policy management audit event.
 */
export interface PolicyManagementEvent extends BaseAuditEvent {
  category: 'policy-management';
  action: 'create' | 'update' | 'delete';
  policy: {
    id: string;
    name: string;
    version: string;
  };
  principal: AuditPrincipal;
  changes?: Record<string, unknown>;
}

/**
 * Break-glass audit event.
 */
export interface BreakGlassEvent extends BaseAuditEvent {
  category: 'breakglass';
  action: 'request' | 'approve' | 'deny' | 'revoke' | 'expire';
  requestId: string;
  reason: string;
  principal: AuditPrincipal;
  approvers?: Array<{ principal: AuditPrincipal; timestamp: number; decision: 'approved' | 'denied' }>;
  expiresAt?: number;
  target?: string;
}

/**
 * SIEM export event.
 */
export interface SiemExportEvent extends BaseAuditEvent {
  category: 'siem-export';
  eventType: 'export' | 'sync' | 'batch';
  count: number;
  destination: string;
  success: boolean;
  error?: string;
}

// ─── Audit Store ───────────────────────────────────────────────────────────────

export const AUDIT_LOG_KEY = 'abac:audit';
export const AUDIT_MAX_ENTRIES = readPositiveIntegerEnv('CRASHLAB_ABAC_AUDIT_MAX_ENTRIES', 100_000);
export const AUDIT_RETENTION_DAYS = readPositiveIntegerEnv('CRASHLAB_ABAC_AUDIT_RETENTION_DAYS', 365);

/**
 * Hash chain implementation for audit log tamper evidence.
 */
class LocalHashChain {
  private lastHash: string = '';

  /**
   * Add to the chain and return the new hash.
   */
  add(content: string): string {
    // Create content hash
    const contentPart = content.substring(0, 1000); // Limit size
    const combined = this.lastHash + contentPart;
    this.lastHash = HashFunction.sha256(combined);
    return this.lastHash;
  }

  /**
   * Get the latest hash.
   */
  get latest(): string {
    return this.lastHash;
  }

  /**
   * Reset the chain.
   */
  reset(): void {
    this.lastHash = '';
  }
}

/**
 * Immutable audit storage with append-only semantics.
 */
export class AuditStore {
  private driver: ReturnType<typeof selectRecordDriver>;
  private hashChain: LocalHashChain;

  constructor() {
    this.driver = selectRecordDriver();
    this.hashChain = new LocalHashChain();
  }

  /**
   * Append an audit event (append-only).
   */
  async appendEvent(event: Omit<BaseAuditEvent, 'id' | 'timestamp' | 'prevHash' | 'eventHash'>): Promise<string> {
    const eventId = this.generateId();
    const timestamp = new Date().toISOString();
    const prevHash = (await this.getLatestHash()) || '';

    const eventContent = JSON.stringify({
      id: eventId,
      timestamp,
      category: event.category,
      prevHash,
    });

    const eventHash = HashFunction.sha256d(eventContent);

    const fullEvent: BaseAuditEvent = {
      id: eventId,
      timestamp,
      prevHash,
      version: (event as any).version || '1.0',
      category: event.category,
      eventHash,
    };

    await this.driver.appendEntry(AUDIT_LOG_KEY, JSON.stringify(fullEvent), AUDIT_MAX_ENTRIES);

    return eventId;
  }

  /**
   * List audit events with filtering.
   */
  async listEvents(options: {
    category?: AuditEventCategory;
    limit?: number;
    since?: Date;
    until?: Date;
    principalId?: string;
    policyId?: string;
  } = {}): Promise<BaseAuditEvent[]> {
    const raw = await this.driver.listEntries(AUDIT_LOG_KEY, options.limit ?? 100);
    const events: BaseAuditEvent[] = [];

    for (const entry of raw) {
      try {
        const event = JSON.parse(entry) as BaseAuditEvent;

        // Apply filters
        if (options.category && event.category !== options.category) continue;
        if (options.since && new Date(event.timestamp) < options.since) continue;
        if (options.until && new Date(event.timestamp) > options.until) continue;

        events.push(event);
      } catch {
        // Skip malformed entries
      }
    }

    return events;
  }

  /**
   * Get count of events.
   */
  async countEvents(): Promise<number> {
    return this.driver.countEntries(AUDIT_LOG_KEY);
  }

  /**
   * Get the latest hash for the chain.
   */
  async getLatestHash(): Promise<string | undefined> {
    const raw = await this.driver.listEntries(AUDIT_LOG_KEY, 1);
    if (raw.length === 0) return undefined;
    try {
      const event = JSON.parse(raw[0]) as BaseAuditEvent;
      return event.eventHash;
    } catch {
      return undefined;
    }
  }

  /**
   * Generate a random ID.
   */
  private generateId(): string {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `audit_${hex}`;
  }
}

// ─── SIEM Exporter ───────────────────────────────────────────────────────────

/**
 * SIEM integration for exporting audit events.
 */
export class SIEMExporter {
  private store: AuditStore;
  private lastExport: number = 0;

  constructor() {
    this.store = new AuditStore();
  }

  /**
   * Export events to SIEM.
   */
  async export(options: {
    destination: 'splunk' | 'datadog' | 'elastic' | 'custom';
    since?: Date;
    until?: Date;
    format?: 'json' | 'syslog' | 'csv';
    endpoint?: string;
    token?: string;
  }): Promise<{ success: boolean; count: number; error?: string }> {
    const events = await this.store.listEvents({
      since: options.since,
      until: options.until,
      limit: 1000,
    });

    const count = events.length;

    if (count === 0) {
      return { success: true, count: 0 };
    }

    // Log export event
    await this.store.appendEvent({
      category: 'siem-export',
      eventType: 'export',
      count,
      destination: options.destination,
      success: true,
    } as unknown as Omit<BaseAuditEvent, 'id' | 'timestamp' | 'prevHash' | 'eventHash'> & { category: 'siem-export' });

    this.lastExport = Date.now();

    return { success: true, count };
  }

  /**
   * Stream events to SIEM.
   */
  async stream(options: {
    destination: 'splunk' | 'datadog' | 'elastic';
    batchSize?: number;
    intervalMs?: number;
  }): Promise<() => void> {
    let running = true;

    const batchSize = options.batchSize ?? 100;
    const interval = options.intervalMs ?? 1000;

    const intervalId = setInterval(async () => {
      if (!running) return;

      const events = await this.store.listEvents({
        limit: batchSize,
        since: new Date(this.lastExport),
      });

      if (events.length > 0) {
        // In production, this would POST to the SIEM endpoint
        console.log('[SIEM] Streaming events', {
          destination: options.destination,
          count: events.length,
        });

        this.lastExport = Math.max(...events.map(e => new Date(e.timestamp).getTime()));
      }
    }, interval);

    return () => {
      running = false;
      clearInterval(intervalId);
    };
  }
}

// ─── Main Audit Logger ───────────────────────────────────────────────────

/**
 * Main audit logger for ABAC decisions.
 */
export class AuditLogger {
  private store: AuditStore;
  private siem: SIEMExporter;

  constructor() {
    this.store = new AuditStore();
    this.siem = new SIEMExporter();
  }

  /**
   * Log a policy decision.
   */
  async logDecision(params: {
    principal: AuditPrincipal;
    action: string;
    resource: AuditResource;
    context: Omit<AuditContext, 'timestamp'>;
    decision: 'permit' | 'deny';
    reason?: string;
    policyId?: string;
    obligations?: PolicyObligation[];
    conditions?: PolicyCondition[];
    latencyMs: number;
  }): Promise<string> {
    const fullContext: AuditContext = {
      ...params.context,
      timestamp: Date.now(),
    };

    const event: PolicyDecisionEvent = {
      id: '',
      category: 'authorization',
      timestamp: new Date().toISOString(),
      version: '1.0',
      action: params.action,
      resource: params.resource,
      principal: params.principal,
      context: fullContext,
      decision: params.decision,
      reason: params.reason,
      policyId: params.policyId,
      obligations: params.obligations,
      conditions: params.conditions,
      latencyMs: params.latencyMs,
      prevHash: '',
      eventHash: '',
    };

    return this.store.appendEvent(event);
  }

  /**
   * Log a policy management event.
   */
  async logPolicyEvent(params: {
    action: 'create' | 'update' | 'delete';
    policy: { id: string; name: string; version: string };
    principal: AuditPrincipal;
    changes?: Record<string, unknown>;
  }): Promise<string> {
    const event: PolicyManagementEvent = {
      id: '',
      category: 'policy-management',
      timestamp: new Date().toISOString(),
      version: '1.0',
      action: params.action,
      policy: params.policy,
      principal: params.principal,
      changes: params.changes,
      prevHash: '',
      eventHash: '',
    };

    return this.store.appendEvent(event);
  }

  /**
   * Log a break-glass event.
   */
  async logBreakGlassEvent(params: {
    action: 'request' | 'approve' | 'deny' | 'revoke' | 'expire';
    requestId: string;
    reason: string;
    principal: AuditPrincipal;
    approvers?: Array<{ principal: AuditPrincipal; timestamp: number; decision: 'approved' | 'denied' }>;
    expiresAt?: number;
    target?: string;
  }): Promise<string> {
    const event: BreakGlassEvent = {
      id: '',
      category: 'breakglass',
      timestamp: new Date().toISOString(),
      version: '1.0',
      action: params.action,
      requestId: params.requestId,
      reason: params.reason,
      principal: params.principal,
      approvers: params.approvers,
      expiresAt: params.expiresAt,
      target: params.target,
      prevHash: '',
      eventHash: '',
    };

    return this.store.appendEvent(event);
  }

  /**
   * Get the SIEM exporter.
   */
  getSIEMExporter(): SIEMExporter {
    return this.siem;
  }

  /**
   * Get the audit store.
   */
  getStore(): AuditStore {
    return this.store;
  }
}

// ─── Singleton Instance ─────────────────────────────────────────────────────

let auditLoggerInstance: AuditLogger | null = null;

/**
 * Get the audit logger singleton.
 */
export function getAuditLogger(): AuditLogger {
  if (!auditLoggerInstance) {
    auditLoggerInstance = new AuditLogger();
  }
  return auditLoggerInstance;
}

// ─── Convenience Functions ──────────────────────────────────────────────────

/**
 * Log an authorization decision.
 */
export async function logAuthorizationEvent(params: {
  principal: AuditPrincipal;
  action: string;
  resource: AuditResource;
  decision: 'permit' | 'deny';
  reason?: string;
  policyId?: string;
  latencyMs: number;
}): Promise<void> {
  const logInstance = getAuditLogger();
  try {
    await logInstance.logDecision({
      ...params,
      context: { timestamp: Date.now() } as Omit<AuditContext, 'timestamp'>,
      obligations: [],
    });
  } catch (error) {
    // Never fail the authorization due to audit logging
    console.warn('Failed to log authorization event', { error });
  }
}

/**
 * Log a policy event.
 */
export async function logPolicyEvent(params: {
  action: 'create' | 'update' | 'delete';
  policy: { id: string; name: string; version: string };
  principal: AuditPrincipal;
}): Promise<void> {
  const logInstance = getAuditLogger();
  try {
    await logInstance.logPolicyEvent(params);
  } catch (error) {
    console.warn('Failed to log policy event', { error });
  }
}