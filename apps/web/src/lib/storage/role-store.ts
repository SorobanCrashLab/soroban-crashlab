/**
 * Persisted role assignments and their change log (#1548).
 *
 * Roles used to live in two module-level arrays. That is fine on a long-lived
 * server and meaningless on serverless, where the next invocation starts with
 * an empty pair — so a maintainer grant evaporated between requests and every
 * authorization decision was unattributable. Assignments and their audit trail
 * now go through the record driver layer, which is Redis/Upstash when the
 * environment provides it.
 *
 * Web Crypto only, no `node:crypto`: this module is reached from `rbac.ts`,
 * which the Edge middleware graph imports.
 */

import { selectRecordDriver, readPositiveIntegerEnv } from './record-driver';

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

export const ROLE_INDEX_KEY = 'rbac:roles:index';
export const ROLE_RECORD_PREFIX = 'rbac:role:';
export const ROLE_AUDIT_KEY = 'rbac:role-audit';

/**
 * Cap on retained role-change entries. Append-only up to this point; the oldest
 * are dropped once it is reached, which is the retention policy for this log.
 */
export const ROLE_AUDIT_MAX_ENTRIES = readPositiveIntegerEnv(
  'CRASHLAB_RBAC_ROLE_AUDIT_MAX_ENTRIES',
  1_000,
);

export function roleRecordKey(identityType: UserIdentity, identityValue: string): string {
  return `${ROLE_RECORD_PREFIX}${identityType}:${identityValue.toLowerCase()}`;
}

function randomId(prefix: string): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}

function parseAssignment(raw: string): RoleAssignment | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<RoleAssignment>;
    if (
      typeof candidate.id !== 'string' ||
      (candidate.identityType !== 'github' && candidate.identityType !== 'api-key') ||
      typeof candidate.identityValue !== 'string' ||
      (candidate.role !== 'analyst' && candidate.role !== 'maintainer')
    ) {
      return null;
    }
    return candidate as RoleAssignment;
  } catch {
    return null;
  }
}

function parseAuditLog(raw: string): RoleAuditLog | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<RoleAuditLog>;
    if (typeof candidate.id !== 'string' || typeof candidate.timestamp !== 'string') return null;
    return candidate as RoleAuditLog;
  } catch {
    return null;
  }
}

async function appendRoleAudit(entry: Omit<RoleAuditLog, 'id' | 'timestamp'> & { timestamp?: string }): Promise<void> {
  const record: RoleAuditLog = {
    id: randomId('log'),
    timestamp: entry.timestamp ?? new Date().toISOString(),
    action: entry.action,
    identityType: entry.identityType,
    identityValue: entry.identityValue,
    previousRole: entry.previousRole,
    newRole: entry.newRole,
    performedBy: entry.performedBy,
    reason: entry.reason,
  };
  await selectRecordDriver().appendEntry(ROLE_AUDIT_KEY, JSON.stringify(record), ROLE_AUDIT_MAX_ENTRIES);
}

export async function assignRole(params: {
  identityType: UserIdentity;
  identityValue: string;
  role: UserRole;
  performedBy?: string;
  nowMs?: number;
}): Promise<RoleAssignment> {
  const driver = selectRecordDriver();
  const nowMs = params.nowMs ?? Date.now();
  const now = new Date(nowMs).toISOString();
  const key = roleRecordKey(params.identityType, params.identityValue);
  const identityValue = params.identityValue.trim();

  const existingRaw = await driver.getRecord(key);
  const existing = existingRaw ? parseAssignment(existingRaw) : null;

  if (existing) {
    const updated: RoleAssignment = {
      ...existing,
      identityValue: existing.identityValue || identityValue,
      role: params.role,
      updatedAt: now,
    };
    await driver.putRecord(key, JSON.stringify(updated));
    await appendRoleAudit({
      timestamp: now,
      action: 'update',
      identityType: params.identityType,
      identityValue: updated.identityValue,
      previousRole: existing.role,
      newRole: params.role,
      performedBy: params.performedBy,
    });
    return updated;
  }

  const assignment: RoleAssignment = {
    id: randomId('role'),
    identityType: params.identityType,
    identityValue,
    role: params.role,
    createdAt: now,
    updatedAt: now,
    createdBy: params.performedBy,
  };

  await driver.putRecord(key, JSON.stringify(assignment));
  await driver.addToIndex(ROLE_INDEX_KEY, key);
  await appendRoleAudit({
    timestamp: now,
    action: 'assign',
    identityType: params.identityType,
    identityValue,
    newRole: params.role,
    performedBy: params.performedBy,
  });

  return assignment;
}

export async function revokeRole(params: {
  identityType: UserIdentity;
  identityValue: string;
  performedBy?: string;
  nowMs?: number;
}): Promise<boolean> {
  const driver = selectRecordDriver();
  const key = roleRecordKey(params.identityType, params.identityValue);
  const existingRaw = await driver.getRecord(key);
  if (!existingRaw) return false;

  const existing = parseAssignment(existingRaw);
  await driver.deleteRecord(key);
  await driver.removeFromIndex(ROLE_INDEX_KEY, key);

  await appendRoleAudit({
    timestamp: new Date(params.nowMs ?? Date.now()).toISOString(),
    action: 'revoke',
    identityType: params.identityType,
    identityValue: existing?.identityValue ?? params.identityValue.trim(),
    previousRole: existing?.role,
    performedBy: params.performedBy,
  });

  return true;
}

export async function getRoleAssignment(
  identityType: UserIdentity,
  identityValue: string,
): Promise<RoleAssignment | undefined> {
  const raw = await selectRecordDriver().getRecord(roleRecordKey(identityType, identityValue));
  return raw ? (parseAssignment(raw) ?? undefined) : undefined;
}

export async function listRoleAssignments(): Promise<RoleAssignment[]> {
  const driver = selectRecordDriver();
  const keys = await driver.listIndex(ROLE_INDEX_KEY);
  const assignments: RoleAssignment[] = [];

  for (const key of keys) {
    const raw = await driver.getRecord(key);
    if (!raw) {
      // The index outlived the record — drop the dangling member.
      await driver.removeFromIndex(ROLE_INDEX_KEY, key);
      continue;
    }
    const assignment = parseAssignment(raw);
    if (assignment) assignments.push(assignment);
  }

  return assignments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function countMaintainers(): Promise<number> {
  const assignments = await listRoleAssignments();
  return assignments.filter((assignment) => assignment.role === 'maintainer').length;
}

function byNewestFirst(a: RoleAuditLog, b: RoleAuditLog): number {
  return b.timestamp.localeCompare(a.timestamp);
}

export async function listAuditLogs(limit = 100): Promise<RoleAuditLog[]> {
  const raws = await selectRecordDriver().listEntries(ROLE_AUDIT_KEY, limit);
  return raws
    .map(parseAuditLog)
    .filter((entry): entry is RoleAuditLog => entry !== null)
    .sort(byNewestFirst)
    .slice(0, limit);
}

export async function getAuditLogsForIdentity(
  identityType: UserIdentity,
  identityValue: string,
  limit = 50,
): Promise<RoleAuditLog[]> {
  const driver = selectRecordDriver();
  const retained = await driver.countEntries(ROLE_AUDIT_KEY);
  const logs = await listAuditLogs(retained > 0 ? retained : limit);
  return logs
    .filter((entry) => entry.identityType === identityType && entry.identityValue === identityValue)
    .slice(0, limit);
}

/** Test seam: empties both the assignments and the change log. */
export async function resetRoleStore(): Promise<void> {
  const driver = selectRecordDriver();
  for (const key of await driver.listIndex(ROLE_INDEX_KEY)) {
    await driver.deleteRecord(key);
  }
  await driver.clearIndex(ROLE_INDEX_KEY);
  await driver.trimEntries(ROLE_AUDIT_KEY, 0);
}
