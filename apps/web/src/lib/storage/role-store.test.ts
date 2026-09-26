import { describe, it, expect, beforeEach } from 'vitest';
import {
  assignRole,
  revokeRole,
  getRoleAssignment,
  listRoleAssignments,
  countMaintainers,
  listAuditLogs,
  getAuditLogsForIdentity,
  resetRoleStore,
} from './role-store';

describe('Role Store', () => {
  beforeEach(() => {
    resetRoleStore();
  });

  it('should assign roles', () => {
    const assignment = assignRole({
      identityType: 'github',
      identityValue: 'alice',
      role: 'maintainer',
    });

    expect(assignment.id).toBeDefined();
    expect(assignment.role).toBe('maintainer');
  });

  it('should retrieve assigned roles', () => {
    assignRole({
      identityType: 'github',
      identityValue: 'alice',
      role: 'maintainer',
    });

    const retrieved = getRoleAssignment('github', 'alice');
    expect(retrieved?.role).toBe('maintainer');
  });

  it('should update existing role assignments', () => {
    assignRole({
      identityType: 'github',
      identityValue: 'alice',
      role: 'analyst',
    });

    const updated = assignRole({
      identityType: 'github',
      identityValue: 'alice',
      role: 'maintainer',
    });

    expect(updated.role).toBe('maintainer');

    const all = listRoleAssignments();
    expect(all).toHaveLength(1);
  });

  it('should revoke roles', () => {
    assignRole({
      identityType: 'github',
      identityValue: 'alice',
      role: 'maintainer',
    });

    const success = revokeRole({
      identityType: 'github',
      identityValue: 'alice',
    });

    expect(success).toBe(true);
    expect(getRoleAssignment('github', 'alice')).toBeUndefined();
  });

  it('should count maintainers', () => {
    assignRole({
      identityType: 'github',
      identityValue: 'alice',
      role: 'maintainer',
    });
    assignRole({
      identityType: 'github',
      identityValue: 'bob',
      role: 'analyst',
    });

    expect(countMaintainers()).toBe(1);
  });

  it('should track audit logs', () => {
    assignRole({
      identityType: 'github',
      identityValue: 'alice',
      role: 'maintainer',
      performedBy: 'admin',
    });

    const logs = listAuditLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('assign');
    expect(logs[0].performedBy).toBe('admin');
  });

  it('should filter audit logs by identity', () => {
    assignRole({
      identityType: 'github',
      identityValue: 'alice',
      role: 'maintainer',
    });
    assignRole({
      identityType: 'github',
      identityValue: 'bob',
      role: 'analyst',
    });

    const aliceLogs = getAuditLogsForIdentity('github', 'alice');
    expect(aliceLogs).toHaveLength(1);
    expect(aliceLogs[0].identityValue).toBe('alice');
  });
});
