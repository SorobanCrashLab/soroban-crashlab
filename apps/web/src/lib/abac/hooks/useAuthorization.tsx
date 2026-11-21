/**
 * Authorization hooks for React components.
 *
 * Provides hooks for checking permissions, managing access state,
 * and integrating with the ABAC system in React components.
 */

'use client';

import { useCallback, useEffect, useState, useContext, createContext } from 'react';
import type { Action, PrincipalAttributes, Resource, ContextAttributes } from '../attributes';
import type { PolicyDecision } from '../PolicyEngine';
import { getPolicyCache } from '../PolicyCache';
import { logger } from '@/lib/logger';

// ─── Authorization Context ───────────────────────────────────────────────────

export interface AuthorizationContextValue {
  /** Current principal */
  principal: PrincipalAttributes | null;
  /** Current context */
  context: ContextAttributes;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: string | null;
  /** Check if a principal has permission */
  checkPermission: (action: Action, resource: Resource) => Promise<boolean>;
  /** Get policy decision */
  getDecision: (action: Action, resource: Resource) => Promise<PolicyDecision | null>;
  /** Refresh principal info */
  refresh: () => void;
}

const AuthorizationContext = createContext<AuthorizationContextValue | null>(null);

export { AuthorizationContext };

/**
 * Provider for authorization context.
 */
export function AuthorizationProvider({
  children,
  initialPrincipal,
}: {
  children: React.ReactNode;
  initialPrincipal?: PrincipalAttributes | null;
}) {
  const [principal, setPrincipal] = useState<PrincipalAttributes | null>(initialPrincipal ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch principal info from server
    fetchPrincipal();
  }, []);

  const fetchPrincipal = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/abac/me', {
        headers: { 'Accept': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json() as PrincipalAttributes;
        setPrincipal(data);
      } else {
        setError('Failed to fetch principal');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const context: ContextAttributes = {
    time: Date.now(),
    ip: undefined,
    mfaVerified: false,
    isDryRun: false,
  };

  const checkPermission = useCallback(async (action: Action, resource: Resource): Promise<boolean> => {
    if (!principal) return false;

    try {
      const response = await fetch('/api/abac/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, resource, context }),
      });

      if (response.ok) {
        const data = await response.json() as PolicyDecision;
        return data.permitted;
      }

      return false;
    } catch (e) {
      logger.warn('Permission check failed', { error: e });
      return false;
    }
  }, [principal, context]);

  const getDecision = useCallback(async (action: Action, resource: Resource): Promise<PolicyDecision | null> => {
    if (!principal) return null;

    try {
      const response = await fetch('/api/abac/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, resource, context }),
      });

      if (response.ok) {
        return await response.json() as PolicyDecision;
      }

      return null;
    } catch (e) {
      logger.warn('Decision fetch failed', { error: e });
      return null;
    }
  }, [principal, context]);

  return (
    <AuthorizationContext.Provider value={{
      principal,
      context,
      loading,
      error,
      checkPermission,
      getDecision,
      refresh: fetchPrincipal,
    }}>
      {children}
    </AuthorizationContext.Provider>
  );
}

/**
 * Hook to access the authorization context.
 */
export function useAuthorization() {
  const context = useContext(AuthorizationContext);
  if (!context) {
    throw new Error('useAuthorization must be used within AuthorizationProvider');
  }
  return context;
}

/**
 * Hook alias for compatibility.
 */
export const useAuthorizationProvider = AuthorizationProvider;

/**
 * Hook to check if a principal has permission.
 */
export function usePermission(action: Action, resource: Resource) {
  const { checkPermission, principal } = useAuthorization();
  const [permitted, setPermitted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!principal) {
      setPermitted(null);
      return;
    }

    setLoading(true);
    checkPermission(action, resource)
      .then(setPermitted)
      .finally(() => setLoading(false));
  }, [checkPermission, action, resource, principal]);

  return { permitted, loading };
}

/**
 * Hook to get detailed policy decision.
 */
export function useDecision(action: Action, resource: Resource) {
  const { getDecision, principal } = useAuthorization();
  const [decision, setDecision] = useState<PolicyDecision | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!principal) {
      setDecision(null);
      return;
    }

    setLoading(true);
    getDecision(action, resource)
      .then(setDecision)
      .finally(() => setLoading(false));
  }, [getDecision, action, resource, principal]);

  return { decision, loading };
}

/**
 * Hook for resource-level permissions.
 */
export function useResourcePermission(resource: Resource & { type: string; id: string }) {
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<{
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canManage: boolean;
  }>({
    canView: false,
    canEdit: false,
    canDelete: false,
    canManage: false,
  });

  useEffect(() => {
    async function loadPermissions() {
      setLoading(true);

      const actions: Action[] = ['view', 'update', 'delete', 'manage'];

      const promises = actions.map(action =>
        fetch('/api/abac/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            resource,
            context: { time: Date.now() },
          }),
        }).then(r => r.json()).then((d: PolicyDecision) => d.permitted).catch(() => false)
      );

      const results = await Promise.allSettled(promises);
      const [view, update, del, manage] = results.map(r => r.status === 'fulfilled' ? r.value : false);

      setPermissions({
        canView: view,
        canEdit: update,
        canDelete: del,
        canManage: manage,
      });

      setLoading(false);
    }

    loadPermissions();
  }, [resource]);

  return { permissions, loading };
}

// ─── Shims for Existing Permissions Hook ───────────────────────────────────

/**
 * Enhanced can() function for ABAC with backward compatibility.
 * Replaces the simple role-based check with ABAC evaluation.
 */
export function useABACCan(role: string | null | undefined, code: string): boolean {
  const { checkPermission, principal } = useAuthorization();

  const [result, setResult] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!role || !principal) {
      setResult(false);
      setLoading(false);
      return;
    }

    // Map legacy capability codes to ABAC actions and resources
    const capabilityMap: Record<string, { action: Action; resourceType: string }> = {
      'runs:create': { action: 'create', resourceType: 'run' },
      'runs:annotate': { action: 'annotate', resourceType: 'run' },
      'runs:replay': { action: 'replay', resourceType: 'run' },
      'runs:delete': { action: 'delete', resourceType: 'run' },
      'campaigns:create': { action: 'create', resourceType: 'campaign' },
      'schedules:manage': { action: 'manage', resourceType: 'schedule' },
      'artifacts:manage': { action: 'manage', resourceType: 'artifact' },
      'audit:checkpoint': { action: 'manage', resourceType: 'audit' },
      'database:migrate': { action: 'manage', resourceType: 'database' },
      'networks:manage': { action: 'manage', resourceType: 'network' },
      'settings:write': { action: 'update', resourceType: 'settings' },
      'roles:manage': { action: 'manage', resourceType: 'roles' },
      'tokens:manage': { action: 'manage', resourceType: 'token' },
    };

    const mapped = capabilityMap[code];
    if (!mapped) {
      setResult(false);
      setLoading(false);
      return;
    }

    // For a simple check, use a generic resource
    const resource: Resource = {
      type: mapped.resourceType as any,
      attributes: { id: 'check' },
    };

    checkPermission(mapped.action, resource)
      .then(setResult)
      .finally(() => setLoading(false));
  }, [role, code, checkPermission, principal]);

  return result;
}