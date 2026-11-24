// WIP scaffold for issue #2283. Per-project/team/campaign mapping scoping not implemented
// yet — flat mapping list only.
"use client";

import type { StatusMapping } from "@/lib/integrations/issue-trackers/syncEngine";

export function SyncMappingEditor({ mappings }: { mappings: StatusMapping[] }) {
  return (
    <table aria-label="Status mapping" className="sync-mapping-editor">
      <thead>
        <tr>
          <th>CrashLab state</th>
          <th>Provider status</th>
        </tr>
      </thead>
      <tbody>
        {mappings.map((mapping) => (
          <tr key={mapping.crashLabState}>
            <td>{mapping.crashLabState}</td>
            <td>{mapping.providerStatus}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
