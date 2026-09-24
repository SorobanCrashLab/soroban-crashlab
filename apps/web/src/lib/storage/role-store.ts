import crypto from 'node:crypto';

export type UserIdentity = 'github' | 'api-key';
export type UserRole = 'analyst' | 'maintainer';

export interface RoleAssignment {
  id: string;
  identityType: UserIdentity;
  identityValue: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface RoleAuditLog {
  id: string;
  timestamp: string;
  action: 'assign' | 'revoke' | 'update';
  identityType: UserIdentity;
  identityValue: string;
  previousRole?: UserRole;
  newRole?: UserRole;
  performedBy?: string;
  reason?: string;
}

let roleAssignments: RoleAssignment[] = [];
let auditLogs: RoleAuditLog[] = [];

export function assignRole(params: {
  identityType: UserIdentity;
  identityValue: string;
  role: UserRole;
  performedBy?: string;
  nowMs?: number;
}): RoleAssignment {
  const nowMs = params.nowMs ?? Date.now();
  const now = new Date(nowMs).toISOString();

  const existing = roleAssignments.find(
    (r) => r.identityType === params.identityType && r.identityValue === params.identityValue,
  );

  if (existing) {
    const log: RoleAuditLog = {
      id: `log_${crypto.randomBytes(8).toString('hex')}`,
      timestamp: now,
      action: 'update',
      identityType: params.identityType,
      identityValue: params.identityValue,
      previousRole: existing.role,
      newRole: params.role,
      performedBy: params.performedBy,
    };
    auditLogs.push(log);

    existing.role = params.role;
    existing.updatedAt = now;
    return existing;
  }

  const assignment: RoleAssignment = {
    id: `role_${crypto.randomBytes(8).toString('hex')}`,
    identityType: params.identityType,
    identityValue: params.identityValue,
    role: params.role,
    createdAt: now,
    updatedAt: now,
    createdBy: params.performedBy,
  };

  roleAssignments.push(assignment);

  const log: RoleAuditLog = {
    id: `log_${crypto.randomBytes(8).toString('hex')}`,
    timestamp: now,
    action: 'assign',
    identityType: params.identityType,
    identityValue: params.identityValue,
    newRole: params.role,
    performedBy: params.performedBy,
  };
  auditLogs.push(log);

  return assignment;
}

export function revokeRole(params: {
  identityType: UserIdentity;
  identityValue: string;
  performedBy?: string;
  nowMs?: number;
}): boolean {
  const index = roleAssignments.findIndex(
    (r) => r.identityType === params.identityType && r.identityValue === params.identityValue,
  );

  if (index === -1) return false;

  const removed = roleAssignments[index];
  roleAssignments.splice(index, 1);

  const nowMs = params.nowMs ?? Date.now();
  const log: RoleAuditLog = {
    id: `log_${crypto.randomBytes(8).toString('hex')}`,
    timestamp: new Date(nowMs).toISOString(),
    action: 'revoke',
    identityType: params.identityType,
    identityValue: params.identityValue,
    previousRole: removed.role,
    performedBy: params.performedBy,
  };
  auditLogs.push(log);

  return true;
}

export function getRoleAssignment(identityType: UserIdentity, identityValue: string): RoleAssignment | undefined {
  return roleAssignments.find(
    (r) => r.identityType === identityType && r.identityValue === identityValue,
  );
}

export function listRoleAssignments(): RoleAssignment[] {
  return [...roleAssignments];
}

export function countMaintainers(): number {
  return roleAssignments.filter((r) => r.role === 'maintainer').length;
}

export function listAuditLogs(limit = 100): RoleAuditLog[] {
  return auditLogs
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

export function getAuditLogsForIdentity(
  identityType: UserIdentity,
  identityValue: string,
  limit = 50,
): RoleAuditLog[] {
  return auditLogs
    .filter((l) => l.identityType === identityType && l.identityValue === identityValue)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

export function resetRoleStore(): void {
  roleAssignments = [];
  auditLogs = [];
}
