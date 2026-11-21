/**
 * Break Glass - Export break-glass emergency access modules.
 */

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
} from './BreakGlassManager';

export {
  BreakGlassAudit,
  type BreakGlassAuditEvent,
  type BreakGlassAuditEntry,
} from './BreakGlassAudit';