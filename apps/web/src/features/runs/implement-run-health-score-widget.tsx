'use client';

import React, { useMemo } from 'react';
import { FuzzingRun, RunArea } from './types';
import {
  computeOverallHealth,
  computeAreaHealthScores,
  getHealthStatus,
  getTrendIcon,
  type AreaHealthScore,
} from './run-health-score-utils';

interface AreaConfig {
  label: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
}

const RUN_AREA_CONFIG: Record<RunArea, AreaConfig> = {
  auth: {
    label: 'Authentication',
    iconBg: 'bg-indigo-100 dark:bg-indigo-900/30',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  state: {
    label: 'State Management',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79-8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
  },
  budget: {
    label: 'Budgeting & Fees',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  xdr: {
    label: 'XDR Serialization',
    iconBg: 'bg-rose-100 dark:bg-rose-900/30',
    iconColor: 'text-rose-600 dark:text-rose-400',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 11-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 011-1h1a2 2 0 100-4H7a1 1 0 01-1-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
      </svg>
    ),
  },
};

export type RunHealthScoreDataState = 'loading' | 'error' | 'success';

interface RunHealthScoreWidgetProps {
  runs?: FuzzingRun[];
  dataState?: RunHealthScoreDataState;
  onRetry?: () => void;
  errorMessage?: string;
}

interface AreaCardProps {
  areaScore: AreaHealthScore;
}

const AreaCard: React.FC<AreaCardProps> = ({ areaScore }) => {
  const config = RUN_AREA_CONFIG[areaScore.area];
  const health = getHealthStatus(areaScore.score);
  const trendColor =
    areaScore.trend === 'up'
      ? 'text-emerald-600 dark:text-emerald-400'
      : areaScore.trend === 'down'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-zinc-500 dark:text-zinc-400';

  return (
    <article
      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-800 dark:bg-zinc-950"
      aria-label={`${config.label} health score`}
      tabIndex={0}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center justify-center rounded-lg p-1.5 ${config.iconBg} ${config.iconColor}`}>
            {config.icon}
          </span>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {config.label}
          </span>
        </div>
        <span className={`text-xs font-medium ${trendColor} inline-flex items-center gap-1`}>
          {getTrendIcon(areaScore.trend)}
          {areaScore.change > 0 ? `${areaScore.change}%` : ''}
        </span>
      </div>
      <div className={`text-3xl font-bold ${health.colorClass}`}>
        {areaScore.score}%
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
        <span>{areaScore.total} runs</span>
        <span className="capitalize">{health.label}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${health.bgClass.replace('bg-', 'bg-opacity-80 bg-')}`}
          style={{ width: `${areaScore.score}%` }}
          aria-hidden="true"
        />
      </div>
    </article>
  );
};

interface SkeletonCardProps {
  index: number;
}

const SkeletonCard: React.FC<SkeletonCardProps> = ({ index }) => (
  <div
    key={index}
    className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    aria-hidden="true"
  >
    <div className="flex items-center gap-2 mb-3">
      <div className="h-5 w-5 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-4 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
    </div>
    <div className="h-8 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
    <div className="mt-3 h-1.5 w-full animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
  </div>
);

const RunHealthScoreWidget: React.FC<RunHealthScoreWidgetProps> = ({
  runs = [],
  dataState = 'success',
  onRetry,
  errorMessage,
}) => {
  const areaScores = useMemo(() => computeAreaHealthScores(runs), [runs]);
  const trend = useMemo(() => computeOverallHealth(runs), [runs]);
  const overallStatus = getHealthStatus(trend.current);

  if (dataState === 'loading') {
    return (
      <section
        className="w-full space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        aria-busy="true"
        aria-label="Run health score loading"
      >
        <div className="h-8 w-48 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-64 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonCard key={i} index={i} />
          ))}
        </div>
      </section>
    );
  }

  if (dataState === 'error') {
    return (
      <section
        role="alert"
        className="w-full rounded-2xl border border-red-200 bg-red-50/60 p-6 shadow-sm dark:border-red-900/50 dark:bg-red-950/20"
        aria-label="Run health score error"
      >
        <h2 className="text-xl font-bold text-red-900 dark:text-red-100">
          Run Health Score
        </h2>
        <p className="mt-2 text-sm text-red-700 dark:text-red-300">
          {errorMessage ?? 'Health score is unavailable. Retry to refresh diagnostics.'}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            Retry health score
          </button>
        )}
      </section>
    );
  }

  if (runs.length === 0) {
    return (
      <section className="w-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Run Health Score
        </h2>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-full text-zinc-300 mb-4">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 002 2v6a2 2 0 002-2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            No fuzzing runs to analyze
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Run fuzzing campaigns to see health scores and trends.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            Run Health Score
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Overall health and trend indicators across fuzzer areas.
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${overallStatus.bgClass} ${overallStatus.colorClass}`}>
          <span className={`h-2 w-2 rounded-full ${overallStatus.bgClass.replace('/30', '').replace('bg-', 'bg-')}`} />
          Overall health {trend.current}%
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {areaScores.map((areaScore) => (
          <AreaCard key={areaScore.area} areaScore={areaScore} />
        ))}
      </div>

      <div
        className={`mt-6 flex flex-col items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row`}
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <div className={`inline-flex items-center justify-center rounded-full p-2 ${trend.direction === 'up' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : trend.direction === 'down' ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'}`}>
            {getTrendIcon(trend.direction)}
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {trend.direction === 'up'
                ? 'Improving'
                : trend.direction === 'down'
                  ? 'Declining'
                  : 'Stable'}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Recent runs are {trend.direction === 'up' ? 'more reliable' : trend.direction === 'down' ? 'less reliable' : 'performing consistently'} than older runs.
            </p>
          </div>
        </div>
        <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-medium">{trend.current}%</span>
          <span className="mx-1">vs</span>
          <span className="font-medium">{trend.previous}%</span>
        </div>
      </div>
    </section>
  );
};

export default RunHealthScoreWidget;
