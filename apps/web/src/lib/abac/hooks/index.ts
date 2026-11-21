/**
 * ABAC Hooks - Export all hooks from a single location.
 */

export {
  useAuthorization,
  useAuthorizationProvider,
  usePermission,
  useDecision,
  useResourcePermission,
  useABACCan,
  AuthorizationProvider,
  AuthorizationContext,
  type AuthorizationContextValue,
} from './useAuthorization';

export {
  useAuditLog,
  usePrincipalAuditEvents,
  useAuthorizationStats,
  useActivePolicies,
  usePolicyTests,
  type AuditLogFilters,
  type AuditLogEntry,
  type UseAuditLogResult,
  type AuthorizationStats,
  type ActivePolicy,
} from './useAuditLog';