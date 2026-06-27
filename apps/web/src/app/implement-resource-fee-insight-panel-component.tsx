"use client";

import React, { useMemo } from "react";
import { FuzzingRun } from "./types";

export type ResourceFeeInsightDataState = "loading" | "error" | "success";

interface ResourceFeeInsightProps {
  runs: FuzzingRun[];
  dataState?: ResourceFeeInsightDataState;
  onRetry?: () => void;
  errorMessage?: string;
  onRunClick?: (runId: string) => void;
}

export interface ResourceThresholds {
  cpuWarning: number;
  cpuCritical: number;
  memoryWarning: number;
  memoryCritical: number;
  feeWarning: number;
  feeCritical: number;
}

export interface ResourceMetrics {
  avgCpu: number;
  maxCpu: number;
  avgMemory: number;
  maxMemory: number;
  avgFee: number;
  maxFee: number;
  expensiveRuns: FuzzingRun[];
  totalRuns: number;
}

const DEFAULT_THRESHOLDS: ResourceThresholds = {
  cpuWarning: 1000000, // 1M instructions
  cpuCritical: 5000000, // 5M instructions
  memoryWarning: 1000000, // 1MB
  memoryCritical: 10000000, // 10MB
  feeWarning: 1000, // 1000 stroops
  feeCritical: 5000, // 5000 stroops
};

export function computeResourceMetrics(runs: FuzzingRun[]): ResourceMetrics {
  if (runs.length === 0) {
    return {
      avgCpu: 0,
      maxCpu: 0,
      avgMemory: 0,
      maxMemory: 0,
      avgFee: 0,
      maxFee: 0,
      expensiveRuns: [],
      totalRuns: 0,
    };
  }

  const totalCpu = runs.reduce((sum, run) => sum + run.cpuInstructions, 0);
  const totalMemory = runs.reduce((sum, run) => sum + run.memoryBytes, 0);
  const totalFee = runs.reduce((sum, run) => sum + run.minResourceFee, 0);

  const avgCpu = Math.round(totalCpu / runs.length);
  const maxCpu = Math.max(...runs.map(run => run.cpuInstructions));
  const avgMemory = Math.round(totalMemory / runs.length);
  const maxMemory = Math.max(...runs.map(run => run.memoryBytes));
  const avgFee = Math.round(totalFee / runs.length);
  const maxFee = Math.max(...runs.map(run => run.minResourceFee));

  // Find runs that exceed critical thresholds
  const expensiveRuns = runs.filter(run =>
    run.cpuInstructions >= DEFAULT_THRESHOLDS.cpuCritical ||
    run.memoryBytes >= DEFAULT_THRESHOLDS.memoryCritical ||
    run.minResourceFee >= DEFAULT_THRESHOLDS.feeCritical
  );

  return {
    avgCpu,
    maxCpu,
    avgMemory,
    maxMemory,
    avgFee,
    maxFee,
    expensiveRuns,
    totalRuns: runs.length,
  };
}

function getResourceLevel(value: number, warning: number, critical: number): 'normal' | 'warning' | 'critical' {
  if (value >= critical) return 'critical';
  if (value >= warning) return 'warning';
  return 'normal';
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

export function ResourceFeeInsightPanel({
  runs,
  dataState = "success",
  onRetry,
  errorMessage,
  onRunClick,
}: ResourceFeeInsightProps) {
  const metrics = useMemo(() => computeResourceMetrics(runs), [runs]);

  if (dataState === "loading") {
    return (
      <section
        className="w-full space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        aria-busy="true"
        aria-label="Resource Fee Insight loading"
      >
        <div className="h-8 w-64 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100/60 dark:border-zinc-800 dark:bg-zinc-900/30"
            />
          ))}
        </div>
      </section>
    );
  }

  if (dataState === "error") {
    return (
      <section role="alert" className="w-full rounded-2xl border border-red-200 bg-red-50/60 p-6 shadow-sm dark:border-red-900/50 dark:bg-red-950/20">
        <h2 className="text-xl font-bold text-red-900 dark:text-red-100">
          Resource Fee Insight
        </h2>
        <p className="mt-2 text-sm text-red-700 dark:text-red-300">
          {errorMessage ??
            "Resource metrics are unavailable. Retry to refresh resource diagnostics."}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            Retry resource insight
          </button>
        )}
      </section>
    );
  }

  const cpuLevel = getResourceLevel(metrics.maxCpu, DEFAULT_THRESHOLDS.cpuWarning, DEFAULT_THRESHOLDS.cpuCritical);
  const memoryLevel = getResourceLevel(metrics.maxMemory, DEFAULT_THRESHOLDS.memoryWarning, DEFAULT_THRESHOLDS.memoryCritical);
  const feeLevel = getResourceLevel(metrics.maxFee, DEFAULT_THRESHOLDS.feeWarning, DEFAULT_THRESHOLDS.feeCritical);

  const getLevelStyles = (level: 'normal' | 'warning' | 'critical') => {
    switch (level) {
      case 'critical':
        return {
          bg: 'bg-red-50 dark:bg-red-950/20',
          border: 'border-red-200 dark:border-red-900/50',
          text: 'text-red-900 dark:text-red-100',
          icon: 'text-red-600 dark:text-red-400',
        };
      case 'warning':
        return {
          bg: 'bg-amber-50 dark:bg-amber-950/20',
          border: 'border-amber-200 dark:border-amber-900/50',
          text: 'text-amber-900 dark:text-amber-100',
          icon: 'text-amber-600 dark:text-amber-400',
        };
      default:
        return {
          bg: 'bg-emerald-50 dark:bg-emerald-950/20',
          border: 'border-emerald-200 dark:border-emerald-900/50',
          text: 'text-emerald-900 dark:text-emerald-100',
          icon: 'text-emerald-600 dark:text-emerald-400',
        };
    }
  };

  return (
    <section className="w-full space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Resource Fee Insight
        </h2>
        {metrics.expensiveRuns.length > 0 && (
          <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800 dark:bg-red-900/30 dark:text-red-200">
            {metrics.expensiveRuns.length} expensive run{metrics.expensiveRuns.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* CPU Instructions */}
        <div className={`rounded-xl border p-4 ${getLevelStyles(cpuLevel).bg} ${getLevelStyles(cpuLevel).border}`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              CPU Instructions
            </h3>
            <div className={`p-1.5 rounded-lg ${getLevelStyles(cpuLevel).icon}`}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
          </div>
          <div className="space-y-1">
            <p className={`text-2xl font-bold ${getLevelStyles(cpuLevel).text}`}>
              {formatNumber(metrics.maxCpu)}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Avg: {formatNumber(metrics.avgCpu)} • Max: {formatNumber(metrics.maxCpu)}
            </p>
          </div>
        </div>

        {/* Memory Usage */}
        <div className={`rounded-xl border p-4 ${getLevelStyles(memoryLevel).bg} ${getLevelStyles(memoryLevel).border}`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Memory Usage
            </h3>
            <div className={`p-1.5 rounded-lg ${getLevelStyles(memoryLevel).icon}`}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
          </div>
          <div className="space-y-1">
            <p className={`text-2xl font-bold ${getLevelStyles(memoryLevel).text}`}>
              {formatNumber(metrics.maxMemory)}B
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Avg: {formatNumber(metrics.avgMemory)}B • Max: {formatNumber(metrics.maxMemory)}B
            </p>
          </div>
        </div>

        {/* Resource Fee */}
        <div className={`rounded-xl border p-4 ${getLevelStyles(feeLevel).bg} ${getLevelStyles(feeLevel).border}`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Min Resource Fee
            </h3>
            <div className={`p-1.5 rounded-lg ${getLevelStyles(feeLevel).icon}`}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
          </div>
          <div className="space-y-1">
            <p className={`text-2xl font-bold ${getLevelStyles(feeLevel).text}`}>
              {metrics.maxFee.toLocaleString()}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Avg: {metrics.avgFee.toLocaleString()} • Max: {metrics.maxFee.toLocaleString()} stroops
            </p>
          </div>
        </div>
      </div>

      {/* Expensive Runs List */}
      {metrics.expensiveRuns.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900/50 dark:bg-red-950/20">
          <h3 className="text-sm font-semibold text-red-900 dark:text-red-100 mb-3">
            Expensive Runs Requiring Attention
          </h3>
          <div className="space-y-2">
            {metrics.expensiveRuns.slice(0, 5).map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between rounded-lg bg-white/60 p-3 dark:bg-zinc-900/30"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      Run {run.id}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      run.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' :
                      run.status === 'running' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' :
                      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
                    }`}>
                      {run.status}
                    </span>
                  </div>
                  <div className="mt-1 flex gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>CPU: {formatNumber(run.cpuInstructions)}</span>
                    <span>Mem: {formatNumber(run.memoryBytes)}B</span>
                    <span>Fee: {run.minResourceFee.toLocaleString()}</span>
                  </div>
                </div>
                {onRunClick && (
                  <button
                    type="button"
                    onClick={() => onRunClick(run.id)}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    View Details
                  </button>
                )}
              </div>
            ))}
            {metrics.expensiveRuns.length > 5 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
                And {metrics.expensiveRuns.length - 5} more expensive runs...
              </p>
            )}
          </div>
        </div>
      )}

      {/* Threshold Information */}
      <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900/30">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          Threshold Levels
        </h4>
        <div className="grid grid-cols-1 gap-2 text-xs text-zinc-600 dark:text-zinc-400 md:grid-cols-3">
          <div>
            <span className="font-medium">CPU:</span> Warning ≥{formatNumber(DEFAULT_THRESHOLDS.cpuWarning)}, Critical ≥{formatNumber(DEFAULT_THRESHOLDS.cpuCritical)}
          </div>
          <div>
            <span className="font-medium">Memory:</span> Warning ≥{formatNumber(DEFAULT_THRESHOLDS.memoryWarning)}B, Critical ≥{formatNumber(DEFAULT_THRESHOLDS.memoryCritical)}B
          </div>
          <div>
            <span className="font-medium">Fee:</span> Warning ≥{DEFAULT_THRESHOLDS.feeWarning.toLocaleString()}, Critical ≥{DEFAULT_THRESHOLDS.feeCritical.toLocaleString()} stroops
          </div>
        </div>
      </div>
    </section>
  );
}
