/**
 * Utility functions for aggregating crash data into trend charts.
 * Transforms FuzzingRun data into bucketed, chart-ready formats.
 */

import {
  FuzzingRun,
  RunArea,
  RunSeverity,
  CrashEvent,
  SignatureFrequency,
  CrashTrendPoint,
} from '../types';

/**
 * Convert FuzzingRun array into flattened CrashEvent array.
 * Only includes runs with crash data (status === 'failed' and crashDetail present).
 *
 * @param runs - Array of FuzzingRun objects
 * @returns Array of CrashEvent objects with date, signature, area, severity
 */
export function transformRunsToCrashEvents(runs: FuzzingRun[]): CrashEvent[] {
  const events: CrashEvent[] = [];

  for (const run of runs) {
    // Only process failed runs with crash details
    if (run.status !== 'failed' || !run.crashDetail) {
      continue;
    }

    // Extract date from finishedAt or queuedAt (ISO format)
    const timestamp = run.finishedAt || run.queuedAt || new Date().toISOString();
    const date = extractDateFromISO(timestamp);

    events.push({
      signature: run.crashDetail.signature,
      date,
      area: run.area,
      severity: run.severity,
    });
  }

  return events;
}

/**
 * Extract YYYY-MM-DD from ISO timestamp string.
 *
 * @param isoString - ISO date string or empty
 * @returns Date string in YYYY-MM-DD format, or today's date if invalid
 */
function extractDateFromISO(isoString: string): string {
  if (!isoString) {
    return formatDateToISO(new Date());
  }
  try {
    const date = new Date(isoString);
    return formatDateToISO(date);
  } catch {
    return formatDateToISO(new Date());
  }
}

/**
 * Format Date to YYYY-MM-DD string.
 *
 * @param date - JavaScript Date object
 * @returns Formatted date string
 */
function formatDateToISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Group CrashEvents by date, optionally filtering by area and severity.
 *
 * @param events - Array of CrashEvent objects
 * @param areaFilter - Optional area filter; if empty, all areas included
 * @param severityFilter - Optional severity filter; if empty, all severities included
 * @returns Map keyed by date (YYYY-MM-DD), value is array of filtered events
 */
export function bucketByDay(
  events: CrashEvent[],
  areaFilter: RunArea[] = [],
  severityFilter: RunSeverity[] = []
): Map<string, CrashEvent[]> {
  const buckets = new Map<string, CrashEvent[]>();

  // Apply filters
  const filtered = events.filter((event) => {
    const areaMatch = areaFilter.length === 0 || areaFilter.includes(event.area);
    const severityMatch =
      severityFilter.length === 0 || severityFilter.includes(event.severity);
    return areaMatch && severityMatch;
  });

  // Bucket by date
  for (const event of filtered) {
    if (!buckets.has(event.date)) {
      buckets.set(event.date, []);
    }
    buckets.get(event.date)!.push(event);
  }

  return buckets;
}

/**
 * Transform bucketed events into chart-ready data format.
 * Each data point includes a date and counts for each signature.
 *
 * @param buckets - Map of date -> CrashEvent array
 * @param selectedSignatures - Optional signature whitelist; if empty, all included
 * @returns Array of CrashTrendPoint objects sorted by date
 */
export function buildChartData(
  buckets: Map<string, CrashEvent[]>,
  selectedSignatures: string[] = []
): CrashTrendPoint[] {
  const dataMap = new Map<string, CrashTrendPoint>();

  // Process each bucket
  for (const [date, events] of buckets) {
    const point: CrashTrendPoint = { date };

    // Count occurrences per signature in this day
    const signatureCounts = new Map<string, number>();
    for (const event of events) {
      // Skip if filtering by signature and event not in list
      if (selectedSignatures.length > 0 && !selectedSignatures.includes(event.signature)) {
        continue;
      }

      signatureCounts.set(
        event.signature,
        (signatureCounts.get(event.signature) || 0) + 1
      );
    }

    // Add signature counts to point
    for (const [sig, count] of signatureCounts) {
      point[sig] = count;
    }

    dataMap.set(date, point);
  }

  // Sort by date ascending
  const sortedData = Array.from(dataMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  return sortedData;
}

/**
 * Extract unique signatures from CrashEvent array with metadata.
 * Useful for building signature selector options and coloring.
 *
 * @param events - Array of CrashEvent objects
 * @returns Array of SignatureFrequency objects, sorted by total count (descending)
 */
export function extractSignatureMetadata(
  events: CrashEvent[]
): SignatureFrequency[] {
  const signatureMap = new Map<string, SignatureFrequency>();

  for (const event of events) {
    if (!signatureMap.has(event.signature)) {
      signatureMap.set(event.signature, {
        signature: event.signature,
        totalCount: 0,
        area: event.area,
        severity: event.severity,
      });
    }

    const freq = signatureMap.get(event.signature)!;
    freq.totalCount += 1;
    // Update to highest severity if needed
    freq.severity = maxSeverity(freq.severity, event.severity);
  }

  // Sort by total count descending
  return Array.from(signatureMap.values()).sort(
    (a, b) => b.totalCount - a.totalCount
  );
}

/**
 * Compare two severity levels and return the higher one.
 *
 * @param a - First severity
 * @param b - Second severity
 * @returns Higher severity
 */
function maxSeverity(a: RunSeverity, b: RunSeverity): RunSeverity {
  const severityRank: Record<RunSeverity, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  return severityRank[a] >= severityRank[b] ? a : b;
}

/**
 * Check if the aggregated data is empty (no crashes).
 *
 * @param chartData - Array of CrashTrendPoint objects
 * @returns True if empty or all points have only date field
 */
export function isChartDataEmpty(chartData: CrashTrendPoint[]): boolean {
  if (chartData.length === 0) {
    return true;
  }

  // Check if any point has signature data (more than just 'date' field)
  return chartData.every((point) => Object.keys(point).length === 1);
}

/**
 * Extract all unique signatures currently present in chart data.
 *
 * @param chartData - Array of CrashTrendPoint objects
 * @returns Array of signature identifiers (not including 'date')
 */
export function extractSignaturesFromChartData(
  chartData: CrashTrendPoint[]
): string[] {
  const sigs = new Set<string>();

  for (const point of chartData) {
    for (const key of Object.keys(point)) {
      if (key !== 'date') {
        sigs.add(key);
      }
    }
  }

  return Array.from(sigs).sort();
}
