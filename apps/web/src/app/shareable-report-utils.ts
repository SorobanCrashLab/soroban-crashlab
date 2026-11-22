import type { Report } from '../features/misc/add-report-generator';

/**
 * Utility functions for generating shareable report links
 * Reports are stored with unique tokens for easy sharing
 */

// In-memory store for reports (in production, use a database)
const reportStore = new Map<string, { report: Report; createdAt: Date }>();

/**
 * Generate a unique token for a report
 */
export function generateReportToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Store a report and return its shareable token
 */
export function storeReportForSharing(report: Report): string {
  const token = generateReportToken();
  reportStore.set(token, {
    report,
    createdAt: new Date(),
  });
  return token;
}

/**
 * Retrieve a report by its token
 */
export function getReportByToken(token: string): Report | null {
  const entry = reportStore.get(token);
  if (!entry) return null;

  // Check if report has expired (7 days)
  const expiryTime = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - entry.createdAt.getTime() > expiryTime) {
    reportStore.delete(token);
    return null;
  }

  return entry.report;
}

/**
 * Generate a shareable report URL
 */
export function generateShareableReportUrl(token: string, baseUrl?: string): string {
  const base = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/reports/shared/${token}`;
}

/**
 * Generate a shareable report link from a report
 */
export function generateShareableReportLink(report: Report, baseUrl?: string): {
  token: string;
  url: string;
  expiresIn: string;
} {
  const token = storeReportForSharing(report);
  const url = generateShareableReportUrl(token, baseUrl);

  return {
    token,
    url,
    expiresIn: '7 days',
  };
}

/**
 * Delete a report by its token
 */
export function deleteReportByToken(token: string): boolean {
  return reportStore.delete(token);
}

/**
 * List all stored reports (for admin/debug purposes)
 */
export function listStoredReports(): Array<{
  token: string;
  createdAt: Date;
  expiresAt: Date;
}> {
  const expiryTime = 7 * 24 * 60 * 60 * 1000;
  return Array.from(reportStore.entries())
    .map(([token, entry]) => ({
      token,
      createdAt: entry.createdAt,
      expiresAt: new Date(entry.createdAt.getTime() + expiryTime),
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Clean up expired reports
 */
export function cleanupExpiredReports(): number {
  const expiryTime = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let removedCount = 0;

  reportStore.forEach((entry, token) => {
    if (now - entry.createdAt.getTime() > expiryTime) {
      reportStore.delete(token);
      removedCount++;
    }
  });

  return removedCount;
}

/**
 * Get storage statistics
 */
export function getReportStorageStats(): {
  totalReports: number;
  totalSizeEstimate: string;
} {
  let totalSize = 0;

  reportStore.forEach((entry) => {
    totalSize += JSON.stringify(entry.report).length;
  });

  const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);

  return {
    totalReports: reportStore.size,
    totalSizeEstimate: `${sizeInMB} MB`,
  };
}
