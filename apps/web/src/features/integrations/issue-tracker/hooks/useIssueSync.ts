// WIP scaffold for issue #2283. TODO: back with /api/integrations/issues/* instead of
// local-only state.
"use client";

import { useState } from "react";
import type { ProviderConnection } from "../ProviderConnections";
import type { SyncHistoryEntry } from "../SyncHistory";

export function useIssueSync() {
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [history, setHistory] = useState<SyncHistoryEntry[]>([]);

  return { connections, setConnections, history, setHistory };
}
