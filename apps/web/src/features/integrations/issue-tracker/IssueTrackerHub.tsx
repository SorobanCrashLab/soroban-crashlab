// WIP scaffold for issue #2283 (Issue Tracker Sync Hub). Not wired to real provider APIs
// or /api/integrations/issues/* yet — complements the existing single-run linking UI at
// apps/web/src/features/runs/create-run-issue-link-page-page.tsx, which is untouched.
"use client";

import { ProviderConnections } from "./ProviderConnections";
import { SyncHistory } from "./SyncHistory";
import { useIssueSync } from "./hooks/useIssueSync";

export function IssueTrackerHub() {
  const { connections, history } = useIssueSync();

  return (
    <div role="region" aria-label="Issue tracker sync hub">
      <ProviderConnections connections={connections} />
      <SyncHistory entries={history} />
    </div>
  );
}
