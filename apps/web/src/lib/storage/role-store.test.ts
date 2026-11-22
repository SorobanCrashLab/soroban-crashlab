import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
import { InMemoryRecordDriver, setRecordDriver, resetRecordDriver } from './record-driver';

describe('Role Store', () => {
  beforeEach(async () => {
    setRecordDriver(new InMemoryRecordDriver());
    await resetRoleStore();
  });

  afterEach(() => {
    resetRecordDriver();
  });

  it('should assign roles', async () => {
    const assignment = await assignRole({
      identityType: 'github',
      identityValue: 'alice',
      role: 'maintainer',
    });

    expect(assignment.id).toBeDefined();
    expect(assignment.role).toBe('maintainer');
  });

  it('should retrieve assigned roles', async () => {
    await assignRole({
      identityType: 'github',
      identityValue: 'alice',
      role: 'maintainer',
    });

    const retrieved = await getRoleAssignment('github', 'alice');
    expect(retrieved?.role).toBe('maintainer');
  });

  it('should match identities case-insensitively so one login cannot dodge its own grant', async () => {
    await assignRole({ identityType: 'github', identityValue: 'Alice', role: 'maintainer' });

    expect((await getRoleAssignment('github', 'alice'))?.role).toBe('maintainer');
    expect((await getRoleAssignment('github', 'ALICE'))?.role).toBe('maintainer');
  });

  it('should return undefined for an identity with no assignment', async () => {
    expect(await getRoleAssignment('github', 'nobody')).toBeUndefined();
  });

  it('should update existing role assignments', async () => {
    await assignRole({
      identityType: 'github',
      identityValue: 'alice',
      role: 'analyst',
    });

    const updated = await assignRole({
      identityType: 'github',
      identityValue: 'alice',
      role: 'maintainer',
    });

    expect(updated.role).toBe('maintainer');

    const all = await listRoleAssignments();
    expect(all).toHaveLength(1);
  });

  it('should preserve createdAt across an update', async () => {
    const created = await assignRole({
      identityType: 'github',
      identityValue: 'alice',
      role: 'analyst',
      nowMs: 1_000_000,
    });

    const updated = await assignRole({
      identityType: 'github',
      identityValue: 'alice',
      role: 'maintainer',
      nowMs: 2_000_000,
    });

    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).not.toBe(created.updatedAt);
  });

  it('should revoke roles', async () => {
    await assignRole({
      identityType: 'github',
      identityValue: 'alice',
      role: 'maintainer',
    });

    const success = await revokeRole({
      identityType: 'github',
      identityValue: 'alice',
    });

    expect(success).toBe(true);
    expect(await getRoleAssignment('github', 'alice')).toBeUndefined();
  });

  it('should report a revoke of an unknown identity as not found', async () => {
    expect(await revokeRole({ identityType: 'github', identityValue: 'ghost' })).toBe(false);
  });

  it('should count maintainers', async () => {
    await assignRole({
      identityType: 'github',
      identityValue: 'alice',
      role: 'maintainer',
    });
    await assignRole({
      identityType: 'github',
      identityValue: 'bob',
      role: 'analyst',
    });

    expect(await countMaintainers()).toBe(1);
  });

  it('should track audit logs', async () => {
    await assignRole({
      identityType: 'github',
      identityValue: 'alice',
      role: 'maintainer',
      performedBy: 'admin',
    });

    const logs = await listAuditLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('assign');
    expect(logs[0].performedBy).toBe('admin');
  });

  it('should record an update entry carrying the previous role', async () => {
    await assignRole({ identityType: 'github', identityValue: 'alice', role: 'analyst' });
    await assignRole({ identityType: 'github', identityValue: 'alice', role: 'maintainer' });

    const logs = await listAuditLogs();
    const update = logs.find((entry) => entry.action === 'update');
    expect(update?.previousRole).toBe('analyst');
    expect(update?.newRole).toBe('maintainer');
  });

  it('should filter audit logs by identity', async () => {
    await assignRole({
      identityType: 'github',
      identityValue: 'alice',
      role: 'maintainer',
    });
    await assignRole({
      identityType: 'github',
      identityValue: 'bob',
      role: 'analyst',
    });

    const aliceLogs = await getAuditLogsForIdentity('github', 'alice');
    expect(aliceLogs).toHaveLength(1);
    expect(aliceLogs[0].identityValue).toBe('alice');
  });

  it('should keep assignments across a discarded module state', async () => {
    const durable = new InMemoryRecordDriver();
    setRecordDriver(durable);
    await assignRole({ identityType: 'github', identityValue: 'alice', role: 'maintainer' });

    // Stands in for a fresh serverless invocation against the same backend.
    resetRecordDriver();
    setRecordDriver(durable);

    expect((await getRoleAssignment('github', 'alice'))?.role).toBe('maintainer');
  });
});
