/**
 * Audit Query - Search and export for audit events.
 */

import { AuditStore, type BaseAuditEvent, type PolicyDecisionEvent, type BreakGlassEvent, type PolicyManagementEvent } from './AuditLogger';
import { AUDIT_LOG_KEY } from './AuditLogger';

// ─── Query Options ───────────────────────────────────────────────────────────

export interface AuditQueryOptions {
  /** Filter by category */
  category?: string;
  /** Principal ID filter */
  principalId?: string;
  /** Policy ID filter */
  policyId?: string;
  /** Resource type filter */
  resourceType?: string;
  /** Resource ID filter */
  resourceId?: string;
  /** Action filter */
  action?: string;
  /** Decision filter */
  decision?: 'permit' | 'deny';
  /** Date range */
  since?: Date;
  /** Date range */
  until?: Date;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Sort order */
  sort?: 'asc' | 'desc';
  /** Search text */
  search?: string;
}

// ─── Query Results ────────────────────────────────────────────────────────

export interface AuditQueryResult {
  /** Total matching events */
  total: number;
  /** Events in this page */
  events: BaseAuditEvent[];
  /** Whether there are more events */
  hasMore: boolean;
  /** Next offset */
  nextOffset?: number;
}

// ─── Audit Query ─────────────────────────────────────────────────────────────

/**
 * Query interface for audit events.
 */
export class AuditQuery {
  private store: AuditStore;

  constructor() {
    this.store = new AuditStore();
  }

  /**
   * Execute a query against the audit log.
   */
  async execute(options: AuditQueryOptions): Promise<AuditQueryResult> {
    // In a real implementation, this would use a proper query language
    // For now, we'll filter in-memory

    const events = await this.store.listEvents({
      limit: options.limit ?? 100,
    });

    let filtered = events;

    // Apply filters
    if (options.category) {
      filtered = filtered.filter(e => e.category === options.category as any);
    }

    if (options.principalId || options.policyId || options.resourceType || options.resourceId ||
        options.action || options.decision || options.since || options.until || options.search) {
      filtered = filtered.filter(event => {
        // Handle different event types
        const de = event as any;

        if (options.principalId && 'principal' in de) {
          if (de.principal?.id !== options.principalId) return false;
        }

        if (options.policyId && 'policyId' in de) {
          if (de.policyId !== options.policyId) return false;
        }

        if (options.action && 'action' in de) {
          if (de.action !== options.action) return false;
        }

        if (options.decision && 'decision' in de) {
          if (de.decision !== options.decision) return false;
        }

        if (options.since && new Date(event.timestamp) < options.since) return false;
        if (options.until && new Date(event.timestamp) > options.until) return false;

        if (options.search) {
          const haystack = JSON.stringify(event).toLowerCase();
          if (!haystack.includes(options.search.toLowerCase())) return false;
        }

        return true;
      });
    }

    // Apply sorting
    if (options.sort === 'asc') {
      filtered.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    } else {
      filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }

    // Apply pagination
    const total = filtered.length;
    const paged = filtered.slice(options.offset ?? 0, (options.offset ?? 0) + (options.limit ?? 100));

    return {
      total,
      events: paged,
      hasMore: total > (options.offset ?? 0) + (options.limit ?? 100),
      nextOffset: options.offset ? (options.offset ?? 0) + (options.limit ?? 100) : undefined,
    };
  }

  /**
   * Query authorization events.
   */
  async queryAuthorization(options: Omit<AuditQueryOptions, 'category'> & { category?: 'authorization' }): Promise<AuditQueryResult> {
    return this.execute({ ...options, category: options.category ?? 'authorization' });
  }

  /**
   * Query policy management events.
   */
  async queryPolicyManagement(options: Omit<AuditQueryOptions, 'category'> & { category?: 'policy-management' }): Promise<AuditQueryResult> {
    return this.execute({ ...options, category: options.category ?? 'policy-management' });
  }

  /**
   * Query break-glass events.
   */
  async queryBreakGlass(options: Omit<AuditQueryOptions, 'category'> & { category?: 'breakglass' }): Promise<AuditQueryResult> {
    return this.execute({ ...options, category: options.category ?? 'breakglass' });
  }

  /**
   * Export events in various formats.
   */
  async export(options: AuditQueryOptions & { format: 'json' | 'csv' | 'syslog' }): Promise<string> {
    const result = await this.execute(options);

    switch (options.format) {
      case 'json':
        return JSON.stringify(result.events, null, 2);
      case 'csv':
        return this.eventsToCsv(result.events);
      case 'syslog':
        return this.eventsToSyslog(result.events);
      default:
        throw new Error(`Unsupported format: ${options.format}`);
    }
  }

  /**
   * Convert events to CSV.
   */
  private eventsToCsv(events: BaseAuditEvent[]): string {
    const headers = ['id', 'timestamp', 'category', ...this.extractUniqueFields(events)];
    const rows = events.map(event => {
      const values = headers.map(h => {
        const v = (event as any)[h];
        return typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : String(v ?? '');
      });
      return values.join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Extract unique field names from events.
   */
  private extractUniqueFields(events: BaseAuditEvent[]): string[] {
    const fields = new Set<string>();
    for (const event of events) {
      for (const key of Object.keys(event)) {
        if (!['id', 'timestamp', 'category'].includes(key)) {
          fields.add(key);
        }
      }
    }
    return Array.from(fields);
  }

  /**
   * Convert events to syslog format.
   */
  private eventsToSyslog(events: BaseAuditEvent[]): string {
    return events.map(event => {
      const timestamp = new Date(event.timestamp).toISOString();
      const message = JSON.stringify(event);
      return `<14>1 ${timestamp} crashlab abac ${message}`;
    }).join('\n');
  }
}

// ─── Convenience Functions ──────────────────────────────────────────────────

/**
 * Create an audit query instance.
 */
export function createAuditQuery(): AuditQuery {
  return new AuditQuery();
}

/**
 * Query authorization events by principal.
 */
export async function queryPrincipalAuthorizations(principalId: string, limit = 100): Promise<AuditQueryResult> {
  const query = new AuditQuery();
  return query.queryAuthorization({ principalId, limit });
}

/**
 * Query policy events by policy ID.
 */
export async function queryPolicyEvents(policyId: string, limit = 100): Promise<AuditQueryResult> {
  const query = new AuditQuery();
  return query.queryPolicyManagement({ policyId, limit });
}

/**
 * Get authorization statistics.
 */
export async function getAuthorizationStats(options: {
  since?: Date;
  until?: Date;
  groupBy?: 'decision' | 'principal' | 'policy' | 'action';
}): Promise<{ total: number; permitted: number; denied: number; breakdown?: Record<string, number> }> {
  const query = new AuditQuery();
  const result = await query.queryAuthorization({
    since: options.since,
    until: options.until,
    limit: 10000, // Large limit for stats
  });

  const events = result.events as PolicyDecisionEvent[];
  const permitted = events.filter(e => e.decision === 'permit').length;
  const denied = events.filter(e => e.decision === 'deny').length;

  let breakdown: Record<string, number> | undefined;
  if (options.groupBy) {
    breakdown = {};
    for (const event of events) {
      const key = options.groupBy === 'decision'
        ? event.decision
        : options.groupBy === 'action'
          ? event.action
          : options.groupBy === 'principal'
            ? event.principal.id
            : event.policyId ?? 'unknown';
      breakdown[key] = (breakdown[key] ?? 0) + 1;
    }
  }

  return {
    total: events.length,
    permitted,
    denied,
    breakdown,
  };
}