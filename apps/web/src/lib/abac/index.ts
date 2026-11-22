/**
 * ABAC (Attribute-Based Access Control) Module.
 *
 * Provides a comprehensive ABAC system with Cedar policy engine support.
 * Replaces the role-based RBAC system with fine-grained, resource-level
 * permissions and dynamic policy evaluation.
 */

// ─── Core Attributes ───────────────────────────────────────────────────────────

export {
  type Resource,
  type ResourceAttributes,
  type ContextAttributes,
  type Action,
  type ResourceType,
  type IdentityType,
  type TeamId,
  type PrincipalId,
  type TimeWindow,
  roleHierarchy,
} from './attributes';

// Also re-export UserRole from attributes for ABAC usage
export type { UserRole } from './attributes';

// ─── Policy Engine ─────────────────────────────────────────────────────────────

export {
  PolicyEvaluator,
  CedarPolicyEngine,
  OpaPolicyEngine,
  type PolicyDecision,
  type PolicyEvalOptions,
  type PolicyObligation,
  type PolicyCondition,
} from './PolicyEngine';

// ─── Policy Cache ────────────────────────────────────────────────────────────

export {
  PolicyCache,
  getPolicyCache,
  resetPolicyCache,
  type CacheStats,
  type CacheConfig,
} from './PolicyCache';

// ─── Policies ────────────────────────────────────────────────────────────────

export { PolicyStore } from './policies/PolicyStore';
export { selectPolicyStore } from './policies/PolicyStore';
export { getActivePolicyVersion } from './policies';
export { PolicyTester } from './policies/PolicyTester';
export { TestCaseGenerator } from './policies/PolicyTester';
export { createPolicyTester } from './policies/PolicyTester';
export { createTestCaseGenerator } from './policies/PolicyTester';
export { validatePolicy } from './policies/PolicyStore';
export { validatePolicyString } from './policies/PolicyValidator';
export { validatePolicies } from './policies/PolicyValidator';
export { VALIDATION_ERROR_CODES } from './policies/PolicyValidator';
export { GitSync } from './policies/GitOpsSync';

// Re-export types that are defined in PolicyStore
export type {
  PolicyRecord,
  PolicyMetadata,
  PolicyValidationResult,
  PolicyTestResult,
  TestResultDetail,
} from './policies/PolicyStore';

// Re-export types from PolicyTester (avoiding duplicate PolicyTestResult)
export type {
  PolicyTestCase,
} from './policies/PolicyTester';

// Re-export types from GitOpsSync
export type {
  GitOpsConfig,
  PolicyFile,
  SyncResult,
  GitOpsSyncResult,
} from './policies/GitOpsSync';

// Re-export types from PolicyValidator
export type {
  ValidationError,
  ValidationWarning,
  ValidationConfig,
} from './policies/PolicyValidator';

// ─── Resources ────────────────────────────────────────────────────────────────

export {
  ResourceRegistry,
  getResourceRegistry,
  type ResourceTypeDefinition,
  type CampaignAttributes as CampaignAttributes2,
  type RunAttributes as RunAttributes2,
  type ArtifactAttributes as ArtifactAttributes2,
  type NetworkAttributes as NetworkAttributes2,
  type TokenAttributes as TokenAttributes2,
} from './resources';

export {
  ResourceResolver,
  getResourceResolver,
  resolveResource,
  parseResourceReference,
  type CampaignStorage,
  type RunStorage,
  type ArtifactStorage,
} from './resources/ResourceResolver';

export {
  CampaignResource,
  getCampaignResource,
} from './resources/CampaignResource';

export {
  RunResource,
  getRunResource,
} from './resources/RunResource';

// Export ArtifactResource with SensitivityLevel type
export {
  ArtifactResource,
  getArtifactResource,
} from './resources/ArtifactResource';

export type { SensitivityLevel } from './resources';

// ─── Audit ───────────────────────────────────────────────────────────────────

export {
  AuditLogger,
  AuditStore,
  SIEMExporter,
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
  type PolicyObligation as PolicyObligationType,
  type PolicyCondition as PolicyConditionType,
  type PolicyOplogEntry,
  AUDIT_LOG_KEY,
  AUDIT_MAX_ENTRIES,
  AUDIT_RETENTION_DAYS,
} from './audit/AuditLogger';

export {
  HashChain,
  MerkleTree,
  TamperEvidenceManager,
  Commitment,
  type HashChainEntry,
  type MerkleNode,
} from './audit/TamperEvidence';

export {
  AuditQuery,
  createAuditQuery,
  queryPrincipalAuthorizations,
  queryPolicyEvents,
  getAuthorizationStats,
  type AuditQueryOptions,
  type AuditQueryResult,
} from './audit/AuditQuery';

// Re-export types that are used externally from useAuditLog hooks
export {
  type AuditLogFilters,
  type AuditLogEntry,
  type UseAuditLogResult,
  type AuthorizationStats,
} from './hooks/useAuditLog';

// ─── Break Glass ─────────────────────────────────────────────────────────────

export {
  BreakGlassManager,
  ApprovalWorkflow,
  getBreakGlassManager,
  requestEmergencyAccess,
  checkExpiredBreakGlass,
  type BreakGlassRequest,
  type BreakGlassAccess,
  type BreakGlassStatus,
  type ApprovalConfig,
} from './breakglass/BreakGlassManager';

export {
  BreakGlassAudit,
  type BreakGlassAuditEvent,
  type BreakGlassAuditEntry,
} from './breakglass/BreakGlassAudit';

// ─── Hooks ───────────────────────────────────────────────────────────────────

export {
  AuthorizationProvider,
  AuthorizationContext,
  useAuthorization,
  usePermission,
  useDecision,
  useResourcePermission,
  useABACCan,
  useAuthorizationProvider,
  type AuthorizationContextValue,
} from './hooks/useAuthorization';

export {
  useAuditLog,
  usePrincipalAuditEvents,
  useAuthorizationStats,
  useActivePolicies,
  usePolicyTests,
} from './hooks/useAuditLog';

// ─── Re-exports from existing systems for migration ───────────────────────────

export {
  resolvePrincipal as resolvePrincipalABAC,
  resolveRoleForPrincipal as resolveRoleForPrincipalABAC,
  describePrincipal as describePrincipalABAC,
  hasRequiredRole as hasRequiredRoleABAC,
  getRequiredRoleForRequest as getRequiredRoleForRequestABAC,
} from '../rbac';