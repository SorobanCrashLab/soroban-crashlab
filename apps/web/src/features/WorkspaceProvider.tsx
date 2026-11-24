"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type WorkspaceMembership = {
  orgId: string;
  projects: string[] | "*";
  role: string;
};

type WorkspaceContextValue = {
  memberships: WorkspaceMembership[];
  activeWorkspace: WorkspaceMembership | null;
  setActiveWorkspace: (orgId: string) => void;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const STORAGE_KEY = "crashlab.activeWorkspace";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/workspaces", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? "Please sign in to view your workspaces."
            : "Unable to load workspaces.",
        );
      }
      const data: { memberships?: WorkspaceMembership[] } =
        await response.json();
      const next = Array.isArray(data.memberships) ? data.memberships : [];
      setMemberships(next);

      const saved =
        typeof window !== "undefined"
          ? window.localStorage.getItem(STORAGE_KEY)
          : null;
      setActiveOrgId(
        next.some((item) => item.orgId === saved)
          ? saved
          : next[0]?.orgId ?? null,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load workspaces.");
      setMemberships([]);
      setActiveOrgId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setActiveWorkspace = useCallback((orgId: string) => {
    setMemberships((current) => {
      if (!current.some((item) => item.orgId === orgId)) return current;
      setActiveOrgId(orgId);
      window.localStorage.setItem(STORAGE_KEY, orgId);
      return current;
    });
  }, []);

  const activeWorkspace = useMemo(
    () => memberships.find((item) => item.orgId === activeOrgId) ?? null,
    [memberships, activeOrgId],
  );

  const value = useMemo(
    () => ({
      memberships,
      activeWorkspace,
      setActiveWorkspace,
      loading,
      error,
      refresh,
    }),
    [memberships, activeWorkspace, setActiveWorkspace, loading, error, refresh],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceContext() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspaceContext must be used inside WorkspaceProvider.");
  }
  return value;
}