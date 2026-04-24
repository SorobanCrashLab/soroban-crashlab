'use client';

import { useMemo, useState } from 'react';
import { RunArea, RunSeverity, FuzzingRun } from '../types';
import { FilterBar } from './FilterBar';
import { CrashTrendChart } from './CrashTrendChart';
import {
  transformRunsToCrashEvents,
  bucketByDay,
  buildChartData,
  extractSignatureMetadata,
  isChartDataEmpty,
} from '../utils/trendAggregation';

/**
 * Crash Signature Frequency Trend page.
 *
 * Visualizes crash signature frequency over time with interactive
 * filtering by area, severity, and specific signatures.
 *
 * TODO: Integrate with real API to fetch FuzzingRun data instead of using mock data.
 */
export default function CrashTrendPage() {
  // TODO: Replace with real data source (API call, context, etc.)
  const runs = useMockFuzzingRuns();

  // Filter state
  const [selectedAreas, setSelectedAreas] = useState<RunArea[]>([]);
  const [selectedSeverities, setSelectedSeverities] = useState<RunSeverity[]>([]);
  const [selectedSignatures, setSelectedSignatures] = useState<string[]>([]);

  // Aggregate and filter data reactively
  const { chartData, availableAreas, availableSignatures } = useMemo(() => {
    // Step 1: Transform runs to crash events
    const events = transformRunsToCrashEvents(runs);

    // Step 2: Get unique areas from all events
    const areasSet = new Set(events.map((e) => e.area));
    const allAreas = Array.from(areasSet).sort();

    // Step 3: Bucket events by day with area/severity filters
    const buckets = bucketByDay(events, selectedAreas, selectedSeverities);

    // Step 4: Extract signatures from filtered data
    const sigMetadata = extractSignatureMetadata(
      Array.from(buckets.values()).flat()
    );

    // Step 5: Build chart data with signature filter
    const chartDataRaw = buildChartData(buckets, selectedSignatures);

    return {
      chartData: chartDataRaw,
      availableAreas: allAreas,
      availableSignatures: sigMetadata,
    };
  }, [runs, selectedAreas, selectedSeverities, selectedSignatures]);

  // Determine which signatures are in the filtered data
  const availableSignaturesFiltered = useMemo(() => {
    return availableSignatures.filter((sig) =>
      chartData.some((point) => point[sig.signature] !== undefined)
    );
  }, [availableSignatures, chartData]);

  // Auto-select all signatures on first render if none selected
  const effectiveSelectedSignatures = useMemo(() => {
    if (
      selectedSignatures.length === 0 &&
      availableSignaturesFiltered.length > 0
    ) {
      return availableSignaturesFiltered.map((s) => s.signature);
    }
    return selectedSignatures;
  }, [selectedSignatures, availableSignaturesFiltered]);

  const isEmpty = isChartDataEmpty(chartData);
  const hasNoRuns = runs.length === 0;

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            Crash Signature Trends
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Visualize crash signature frequency over time across fuzzing runs.
            Filter by area, severity, and specific signatures to focus on
            trends that matter.
          </p>
        </div>

        {/* No data state */}
        {hasNoRuns ? (
          <div className="rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/30 p-12 text-center">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
              No fuzzing runs available
            </h3>
            <p className="text-zinc-600 dark:text-zinc-400">
              Run fuzzing campaigns to collect crash data for trend analysis.
            </p>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="mb-8">
              <FilterBar
                selectedAreas={selectedAreas}
                selectedSeverities={selectedSeverities}
                selectedSignatures={effectiveSelectedSignatures}
                availableAreas={availableAreas}
                availableSignatures={availableSignaturesFiltered}
                onAreasChange={setSelectedAreas}
                onSeveritiesChange={setSelectedSeverities}
                onSignaturesChange={setSelectedSignatures}
              />
            </div>

            {/* Chart */}
            {isEmpty ? (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-12 text-center">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                  No matching crash data
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400">
                  No crashes found for the selected filters. Try adjusting your
                  filter criteria.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <CrashTrendChart
                  data={chartData}
                  selectedSignatures={effectiveSelectedSignatures}
                />

                {/* Summary stats */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-6">
                  <StatCard
                    label="Total Days"
                    value={chartData.length.toString()}
                  />
                  <StatCard
                    label="Active Signatures"
                    value={effectiveSelectedSignatures.length.toString()}
                  />
                  <StatCard
                    label="Unique Signatures"
                    value={availableSignatures.length.toString()}
                  />
                  <StatCard
                    label="Total Crashes"
                    value={calculateTotalCrashes(chartData).toString()}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Display helper: statistics card for summary metrics.
 */
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
        {value}
      </p>
    </div>
  );
}

/**
 * Calculate total crashes across all chart data points.
 */
function calculateTotalCrashes(chartData: Record<string, string | number>[]): number {
  let total = 0;
  for (const point of chartData) {
    for (const [key, value] of Object.entries(point)) {
      if (key !== 'date' && typeof value === 'number') {
        total += value;
      }
    }
  }
  return total;
}

/**
 * Generate mock FuzzingRun data for demo/testing.
 * TODO: Replace with real API call after integration.
 */
function useMockFuzzingRuns(): FuzzingRun[] {
  // In a real implementation, this would fetch from an API or receive via props.
  // For now, we generate realistic mock data for testing the visualization.

  const areas: RunArea[] = ['auth', 'state', 'budget', 'xdr'];
  const severities: RunSeverity[] = ['low', 'medium', 'high', 'critical'];
  const baseDate = new Date('2026-03-20');

  const runs: FuzzingRun[] = [];
  let runId = 1;

  // Generate 50 mock crashes across the past 10 days
  for (let dayOffset = 0; dayOffset < 10; dayOffset++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - dayOffset);

    const crashCount = Math.floor(Math.random() * 8) + 1;

    for (let i = 0; i < crashCount; i++) {
      const area = areas[Math.floor(Math.random() * areas.length)];
      const severity = severities[Math.floor(Math.random() * severities.length)];

      // Generate stable signature hashes (in real data, these are FNV-1a hashes)
      const signature = `0x${(Math.random() * 0xffffffff | 0).toString(16).padStart(8, '0')}`;

      runs.push({
        id: `run-${runId++}`,
        status: 'failed',
        area,
        severity,
        duration: Math.floor(Math.random() * 60000) + 1000,
        seedCount: Math.floor(Math.random() * 1000) + 10,
        cpuInstructions: Math.floor(Math.random() * 1000000),
        memoryBytes: Math.floor(Math.random() * 10000000),
        minResourceFee: Math.floor(Math.random() * 100000),
        finishedAt: date.toISOString(),
        crashDetail: {
          failureCategory: area.toUpperCase(),
          signature,
          payload: `{"type":"${area}","test":true}`,
          replayAction: `crashlab replay --signature ${signature}`,
        },
      });
    }
  }

  return runs;
}
