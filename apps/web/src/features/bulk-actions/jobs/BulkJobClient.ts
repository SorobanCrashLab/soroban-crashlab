// WIP scaffold for issue #2272. TODO: replace polling placeholder with SSE once the
// backend job runner exists.

export type BulkJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface BulkJobProgress {
  jobId: string;
  status: BulkJobStatus;
  processedCount: number;
  totalCount: number;
}

export async function submitBulkJob(
  actionId: string,
  entityIds: string[],
): Promise<{ jobId: string }> {
  const response = await fetch("/api/bulk-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actionId, entityIds }),
  });
  return response.json();
}
