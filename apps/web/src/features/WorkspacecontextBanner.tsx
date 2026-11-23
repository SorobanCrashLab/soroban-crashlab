"use client";

import { useWorkspaceContext } from "./WorkspaceProvider";

export function WorkspaceContextBanner() {
  const { activeWorkspace, loading } = useWorkspaceContext();

  if (loading || !activeWorkspace) return null;

  return (
    <div
      role="status"
      className="border-b px-4 py-2 text-sm"
      data-workspace-id={activeWorkspace.orgId}
    >
      <strong>Workspace:</strong> {activeWorkspace.orgId}
      <span className="ml-3">Role: {activeWorkspace.role}</span>
    </div>
  );
}
