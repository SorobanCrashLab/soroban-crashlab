/**
 * Tenant isolation suite (#1894).
 *
 * The property test generates random principals, memberships and operations
 * and checks the one invariant that matters: no principal ever reads, lists,
 * updates or deletes a record outside a project it is a member of — and every
 * cross-tenant attempt is denied and audited.
 */

import { describe, expect, it } from 'vitest';
import type { AuditEntryInput } from '../audit/audit-log';
import { getArtifact, listArtifactMetadata, putArtifact } from '../artifact-store';
import { isResourceInTenantScope, requestedTenantFromHeaders } from '../api-scope-enforcer';
import fixture from './fixtures/legacy-store.json';
import { findUnscopedKeys, rollbackBackfill, runBackfill, type BackfillStore } from './backfill';
import { createMapBackend, ScopedRepository } from './scoped-repository';
import { isTenantKey, joinTenantKey, RESOURCE_ID_PATTERN, tenantKeyPrefix } from './storage-keys';
import {
  createInMemoryMembershipDirectory,
  isKeyInScope,
  newTenantId,
  resolveTenantScope,
  scopedCacheKey,
  systemTenantScope,
  TenantAccessDeniedError,
  type Membership,
  type TenantScope,
} from './tenant-scope';

/** Small deterministic PRNG so failures reproduce from the printed seed. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function auditCollector() {
  const entries: AuditEntryInput[] = [];
  return { entries, sink: (entry: AuditEntryInput) => void entries.push(entry) };
}

describe('scope resolution', () => {
  const orgA = newTenantId('org');
  const orgB = newTenantId('org');
  const p1 = newTenantId('prj');
  const p2 = newTenantId('prj');
  const p3 = newTenantId('prj');
  const directory = createInMemoryMembershipDirectory([
    { principal: 'github:alice', orgId: orgA, projects: [p1], role: 'maintainer' },
    { principal: 'github:bob', orgId: orgA, projects: '*', role: 'analyst' },
    { principal: 'github:carol', orgId: orgB, projects: [p3, p2], role: 'analyst' },
  ]);

  it('resolves a member to the requested project', () => {
    const { sink } = auditCollector();
    const scope = resolveTenantScope('github:alice', directory, { orgId: orgA, projectId: p1 }, sink);
    expect(scope).toMatchObject({ orgId: orgA, projectId: p1, role: 'maintainer' });
    expect(resolveTenantScope('github:bob', directory, { orgId: orgA, projectId: p2 }, sink).projectId).toBe(p2);
  });

  it('defaults only when exactly one project is reachable', () => {
    const { entries, sink } = auditCollector();
    expect(resolveTenantScope('github:alice', directory, {}, sink).projectId).toBe(p1);
    expect(() => resolveTenantScope('github:carol', directory, {}, sink)).toThrow(TenantAccessDeniedError);
    expect(() => resolveTenantScope('github:bob', directory, {}, sink)).toThrow(TenantAccessDeniedError);
    expect(entries).toHaveLength(2);
  });

  it('denies and audits tenant hopping', () => {
    const { entries, sink } = auditCollector();
    expect(() => resolveTenantScope('github:alice', directory, { orgId: orgA, projectId: p2 }, sink)).toThrow(
      TenantAccessDeniedError,
    );
    expect(() => resolveTenantScope('github:alice', directory, { orgId: orgB, projectId: p3 }, sink)).toThrow();
    expect(() => resolveTenantScope('anonymous', directory, { orgId: orgA, projectId: p1 }, sink)).toThrow();
    expect(entries.map((e) => [e.action, e.actor, e.metadata?.reason])).toEqual([
      ['tenant.access.denied', 'github:alice', 'not_a_member'],
      ['tenant.access.denied', 'github:alice', 'not_a_member'],
      ['tenant.access.denied', 'anonymous', 'no_membership'],
    ]);
  });

  it('rejects malformed ids before they reach a key', () => {
    expect(() => tenantKeyPrefix('org_../../etc', 'prj_default')).toThrow();
    expect(() => systemTenantScope('org_default', 'prj_x/../y')).toThrow();
    const scope = systemTenantScope('org_default', 'prj_default');
    expect(() => joinTenantKey(tenantKeyPrefix(scope.orgId, scope.projectId), '../other')).toThrow();
  });

  it('reads the requested tenant from headers', () => {
    const headers = new Headers({ 'x-crashlab-org': ` ${orgA} `, 'x-crashlab-project': p1 });
    expect(requestedTenantFromHeaders(headers)).toEqual({ orgId: orgA, projectId: p1 });
    expect(requestedTenantFromHeaders(new Headers())).toEqual({ orgId: null, projectId: null });
  });
});

describe('ids', () => {
  it('are random, unique and not enumerable', () => {
    const ids = Array.from({ length: 2000 }, () => newTenantId('run'));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(RESOURCE_ID_PATTERN);
    const sorted = [...ids].sort();
    expect(sorted).not.toEqual(ids);
  });
});

describe('cross-principal property test', () => {
  it.each([1, 7, 42, 1894, 31337])('seed %i: no principal touches another tenant', (seed) => {
    const random = mulberry32(seed);
    const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)];

    const orgs = Array.from({ length: 3 }, () => newTenantId('org'));
    const projects = new Map(orgs.map((org) => [org, Array.from({ length: 3 }, () => newTenantId('prj'))]));
    const memberships: Membership[] = [];
    const principals = Array.from({ length: 6 }, (_, i) => `github:user${i}`);
    for (const principal of principals) {
      const org = pick(orgs);
      memberships.push({ principal, orgId: org, projects: [pick(projects.get(org)!)], role: 'analyst' });
    }
    const directory = createInMemoryMembershipDirectory(memberships);
    const { entries, sink } = auditCollector();
    const backingMap = new Map<string, { owner: string; value: number } & { id: string }>();
    const repo = new ScopedRepository<{ owner: string; value: number }>({
      collection: 'run',
      backend: createMapBackend(backingMap),
      audit: sink,
    });

    const scopes = new Map(principals.map((p) => [p, resolveTenantScope(p, directory, {}, sink)]));
    const tenantOf = (scope: TenantScope) => `${scope.orgId}/${scope.projectId}`;
    const created: Array<{ id: string; tenant: string }> = [];
    let expectedDenials = 0;

    for (let step = 0; step < 400; step += 1) {
      const principal = pick(principals);
      const scope = scopes.get(principal)!;
      const op = random();

      if (op < 0.3 || created.length === 0) {
        const record = repo.create(scope, { owner: principal, value: step });
        created.push({ id: record.id, tenant: tenantOf(scope) });
        continue;
      }

      const target = pick(created);
      const sameTenant = target.tenant === tenantOf(scope);
      if (op < 0.6) {
        const got = repo.get(scope, target.id);
        expect(got === null).toBe(!sameTenant);
      } else if (op < 0.8) {
        const updated = repo.update(scope, target.id, { value: -1 });
        expect(updated === null).toBe(!sameTenant);
      } else if (op < 0.9) {
        for (const record of repo.list(scope)) {
          expect(created.find((c) => c.id === record.id)?.tenant).toBe(tenantOf(scope));
        }
        continue;
      } else {
        if (!sameTenant) {
          expect(repo.delete(scope, target.id)).toBe(false);
        } else {
          expect(repo.delete(scope, target.id)).toBe(true);
          created.splice(created.indexOf(target), 1);
          continue;
        }
      }
      if (!sameTenant) expectedDenials += 1;
    }

    expect(entries.filter((e) => e.metadata?.reason === 'cross_tenant')).toHaveLength(expectedDenials);
    // Storage-level scan: every key is tenant-prefixed and sits under its owner's scope.
    for (const [key, record] of backingMap) {
      expect(isTenantKey(key)).toBe(true);
      expect(isKeyInScope(scopes.get(record.owner)!, key)).toBe(true);
    }
  });
});

describe('artifact store and cache keys', () => {
  it('scopes artifact objects and listings', () => {
    const a = systemTenantScope(newTenantId('org'), newTenantId('prj'));
    const b = systemTenantScope(newTenantId('org'), newTenantId('prj'));
    const stored = putArtifact(a, { name: 'seed.bin', buffer: Buffer.from('x') });

    expect(getArtifact(a, stored.id)?.name).toBe('seed.bin');
    expect(getArtifact(b, stored.id)).toBeNull();
    expect(listArtifactMetadata(b)).toEqual([]);
    expect(listArtifactMetadata(a).map((m) => m.id)).toEqual([stored.id]);

    const raw = (globalThis as { crashlabArtifactStore?: Map<string, unknown> }).crashlabArtifactStore!;
    expect(findUnscopedKeys(raw.keys(), [''])).toEqual([]);
    for (const key of raw.keys()) {
      if (key.includes(stored.id)) expect(isResourceInTenantScope(a, key)).toBe(true);
    }
  });

  it('never shares a cache key between tenants', () => {
    const a = systemTenantScope(newTenantId('org'), 'prj_default');
    const b = systemTenantScope(newTenantId('org'), 'prj_default');
    expect(scopedCacheKey(a, 'runs/list')).not.toBe(scopedCacheKey(b, 'runs/list'));
    expect(isKeyInScope(a, scopedCacheKey(a, 'runs/list'))).toBe(true);
    expect(isKeyInScope(b, scopedCacheKey(a, 'runs/list'))).toBe(false);
  });
});

describe('default-org backfill', () => {
  const OWNED = ['run:', 'artifact:', 'settings:'];
  const fresh = () => {
    const data = new Map<string, unknown>(Object.entries(structuredClone(fixture)));
    const store: BackfillStore = {
      get: (key) => data.get(key),
      set: (key, value) => void data.set(key, value),
      delete: (key) => data.delete(key),
      keys: () => data.keys(),
    };
    return { data, store };
  };

  it('dry-run reports without writing', () => {
    const { data, store } = fresh();
    const before = JSON.stringify([...data]);
    const report = runBackfill(store, { tenantOwnedPrefixes: OWNED });

    expect(report).toMatchObject({ dryRun: true, total: 7, alreadyScoped: 1, conflicts: [] });
    expect(report.global).toEqual(['crashlab:audit-log:v1', 'rbac:role:github:octocat']);
    expect(report.moves.map((m) => m.from)).toEqual([
      'artifact:crash/seed-17.bin',
      'run:run-001',
      'run:run-002',
      'settings:notifications',
    ]);
    expect(JSON.stringify([...data])).toBe(before);
    expect(findUnscopedKeys(data.keys(), OWNED)).toHaveLength(4);
  });

  it('apply leaves no unscoped tenant keys and rollback restores the original', () => {
    const { data, store } = fresh();
    const original = new Map(data);
    const report = runBackfill(store, { tenantOwnedPrefixes: OWNED, dryRun: false });

    expect(findUnscopedKeys(data.keys(), OWNED)).toEqual([]);
    expect(data.get('org/org_default/project/prj_default/legacy/run%3Arun-001')).toEqual(original.get('run:run-001'));
    expect(data.get('rbac:role:github:octocat')).toEqual(original.get('rbac:role:github:octocat'));

    expect(rollbackBackfill(store, report)).toBe(4);
    expect(new Map(data)).toEqual(original);
  });

  it('reports a conflicting target instead of overwriting it', () => {
    const { data, store } = fresh();
    data.set('run:run-000', { id: 'run-000', status: 'different' });
    const report = runBackfill(store, { tenantOwnedPrefixes: OWNED, dryRun: false });
    expect(report.conflicts).toEqual([
      { from: 'run:run-000', to: 'org/org_default/project/prj_default/legacy/run%3Arun-000' },
    ]);
    expect(data.get('run:run-000')).toEqual({ id: 'run-000', status: 'different' });
  });
});
