/**
 * Tenant-scoped repository (#1894).
 *
 * Every method takes a `TenantScope` first; the type has no unscoped method,
 * and `tenancy-gate.test.ts` fails the build if one is added. Records are
 * stored under the scope's key prefix, so a lookup physically cannot reach
 * another tenant's key. A lookup that misses here but names a record owned by
 * another tenant is an IDOR attempt: it answers "not found" (no existence
 * oracle) and is audited.
 */

import { recordAuditEvent } from '../audit/audit-sink';
import {
  auditTenantDenial,
  newTenantId,
  scopedStorageKey,
  scopePrefix,
  type TenantAuditSink,
  type TenantScope,
} from './tenant-scope';

export interface KeyValueBackend<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): boolean;
  keys(): Iterable<string>;
}

export function createMapBackend<T>(map: Map<string, T> = new Map()): KeyValueBackend<T> {
  return {
    get: (key) => map.get(key),
    set: (key, value) => void map.set(key, value),
    delete: (key) => map.delete(key),
    keys: () => map.keys(),
  };
}

export interface ScopedRepositoryOptions<T> {
  /** Collection name, also the id prefix (`run`, `art`, ...). */
  collection: string;
  backend?: KeyValueBackend<T & { id: string }>;
  audit?: TenantAuditSink;
}

export class ScopedRepository<T extends object> {
  private readonly collection: string;
  private readonly backend: KeyValueBackend<T & { id: string }>;
  private readonly audit: TenantAuditSink;
  /** id → owning key, to recognise (and audit) cross-tenant lookups. */
  private readonly owners = new Map<string, string>();

  constructor(options: ScopedRepositoryOptions<T>) {
    if (!/^[a-z]{2,8}$/.test(options.collection)) throw new Error('collection must be 2–8 lowercase letters');
    this.collection = options.collection;
    this.backend = options.backend ?? createMapBackend();
    this.audit = options.audit ?? recordAuditEvent;
    for (const key of this.backend.keys()) {
      const id = key.split('/').at(-1);
      if (id) this.owners.set(id, key);
    }
  }

  create(scope: TenantScope, record: T): T & { id: string } {
    const id = newTenantId(this.collection);
    const stored = { ...record, id };
    const key = this.key(scope, id);
    this.backend.set(key, stored);
    this.owners.set(id, key);
    return stored;
  }

  get(scope: TenantScope, id: string): (T & { id: string }) | null {
    const key = this.key(scope, id);
    const found = this.backend.get(key);
    if (found) return found;
    this.auditIfForeign(scope, id, key, 'read');
    return null;
  }

  list(scope: TenantScope): Array<T & { id: string }> {
    const prefix = `${scopePrefix(scope)}${this.collection}/`;
    const out: Array<T & { id: string }> = [];
    for (const key of this.backend.keys()) {
      if (!key.startsWith(prefix)) continue;
      const value = this.backend.get(key);
      if (value) out.push(value);
    }
    return out;
  }

  update(scope: TenantScope, id: string, patch: Partial<T>): (T & { id: string }) | null {
    const key = this.key(scope, id);
    const existing = this.backend.get(key);
    if (!existing) {
      this.auditIfForeign(scope, id, key, 'update');
      return null;
    }
    const updated = { ...existing, ...patch, id };
    this.backend.set(key, updated);
    return updated;
  }

  delete(scope: TenantScope, id: string): boolean {
    const key = this.key(scope, id);
    if (this.backend.delete(key)) {
      this.owners.delete(id);
      return true;
    }
    this.auditIfForeign(scope, id, key, 'delete');
    return false;
  }

  private key(scope: TenantScope, id: string): string {
    // joinTenantKey rejects separators and dot-segments in a caller-supplied id.
    return scopedStorageKey(scope, `${this.collection}/${id}`);
  }

  private auditIfForeign(scope: TenantScope, id: string, attemptedKey: string, operation: string): void {
    const owner = this.owners.get(id);
    if (owner && owner !== attemptedKey) {
      auditTenantDenial(this.audit, scope.principal, `${this.collection}/${id}`, 'cross_tenant', {
        operation,
        scope: scopePrefix(scope),
      });
    }
  }
}
