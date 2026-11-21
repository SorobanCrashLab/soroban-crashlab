// WIP scaffold for issue #2272. Cancellation and audit-link display not implemented yet.
"use client";

import type { BulkJobProgress } from "./jobs/BulkJobClient";

export function BulkJobDrawer({ job }: { job: BulkJobProgress | null }) {
  if (!job) return null;

  return (
    <aside aria-label="Bulk job progress" className="bulk-job-drawer">
      <p role="status">
        {job.status}: {job.processedCount}/{job.totalCount}
      </p>
    </aside>
  );
}
