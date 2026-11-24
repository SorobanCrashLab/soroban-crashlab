"use client";

import { useWorkspaceContext } from "./WorkspaceProvider";

export function WorkspaceSwitcher() {
  const { memberships, activeWorkspace, setActiveWorkspace, loading, error } =
    useWorkspaceContext();

  if (loading) return <span aria-live="polite">Loading workspaces…</span>;
  if (error) return <span role="alert">{error}</span>;
  if (memberships.length === 0) return <span>No workspaces available</span>;

  return (
    <label className="inline-flex items-center gap-2">
      <span className="sr-only">Current workspace</span>
      <select
        aria-label="Switch workspace"
        value={activeWorkspace?.orgId ?? ""}
        onChange={(event) => setActiveWorkspace(event.target.value)}
        className="rounded-md border bg-background px-3 py-2 text-sm"
      >
        {memberships.map((membership) => (
          <option key={membership.orgId} value={membership.orgId}>
            {membership.orgId}
          </option>
        ))}
      </select>
    </label>
  );
}
