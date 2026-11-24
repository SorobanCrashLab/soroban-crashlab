'use client';

/**
 * Logs route – /logs
 * Issue #075: Structured Log Query Engine UI.
 *
 * The page is intentionally thin: the workbench owns query state, URL sync,
 * faceted search, live tail, correlation and export.
 */

import LogQueryWorkbench from '../../features/logs/query-engine/LogQueryWorkbench';

export default function LogsPage() {
  return <LogQueryWorkbench />;
}
