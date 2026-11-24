// WIP scaffold for issue #2272. Downloadable error-report generation not implemented yet.

export interface BulkItemResult {
  entityId: string;
  success: boolean;
  error?: string;
}

export interface BulkJobResultReport {
  jobId: string;
  total: number;
  succeeded: number;
  failed: number;
  items: BulkItemResult[];
}

export function summarizeResults(jobId: string, items: BulkItemResult[]): BulkJobResultReport {
  const succeeded = items.filter((item) => item.success).length;
  return { jobId, total: items.length, succeeded, failed: items.length - succeeded, items };
}

export function failedOnly(report: BulkJobResultReport): string[] {
  return report.items.filter((item) => !item.success).map((item) => item.entityId);
}
