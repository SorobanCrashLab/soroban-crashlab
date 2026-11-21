/**
 * Audit - Export all audit-related modules.
 */

export {
  AuditLogger,
  AuditStore,
  getAuditLogger,
  logAuthorizationEvent,
  logPolicyEvent,
  type BaseAuditEvent,
  type PolicyDecisionEvent,
  type PolicyManagementEvent,
  type BreakGlassEvent,
  type AuditEventCategory,
  type AuditEventSeverity,
  type AuditPrincipal,
  type AuditResource,
  type AuditContext,
  type PolicyObligation,
  type PolicyCondition,
  type PolicyOplogEntry,
  AUDIT_LOG_KEY,
  AUDIT_MAX_ENTRIES,
  AUDIT_RETENTION_DAYS,
} from './AuditLogger';

// SIEMExporter is also exported from AuditLogger
export { SIEMExporter } from './AuditLogger';

export {
  HashChain,
  MerkleTree,
  TamperEvidenceManager,
  Commitment,
  type HashChainEntry,
  type MerkleNode,
} from './TamperEvidence';

export {
  AuditQuery,
  createAuditQuery,
  queryPrincipalAuthorizations,
  queryPolicyEvents,
  getAuthorizationStats,
  type AuditQueryOptions,
  type AuditQueryResult,
} from './AuditQuery';

// Re-export types that are used externally from useAuditLog hooks
export {
  type AuditLogFilters,
  type AuditLogEntry,
  type UseAuditLogResult,
  type AuthorizationStats,
} from '../hooks/useAuditLog';