import { FuzzingRun, RunArea } from './types';
import React from 'react';

export interface AreaHealthScore {
  area: RunArea;
  score: number;
  trend: 'up' | 'down' | 'neutral';
  change: number;
  total: number;
  completed: number;
  running: number;
  failed: number;
}

export interface HealthTrend {
  current: number;
  previous: number;
  direction: 'up' | 'down' | 'neutral';
  change: number;
}

export function computeRunHealthScore(runs: FuzzingRun[]): number {
  if (runs.length === 0) return 100;
  const completed = runs.filter((r) => r.status === 'completed').length;
  const running = runs.filter((r) => r.status === 'running').length;
  const total = runs.length;
  return Math.round(((completed + running * 0.5) / total) * 100);
}

export function computeAreaHealthScores(runs: FuzzingRun[]): AreaHealthScore[] {
  const areas: RunArea[] = ['auth', 'state', 'budget', 'xdr'];

  return areas.map((area) => {
    const areaRuns = runs.filter((r) => r.area === area);
    const total = areaRuns.length;
    const completed = areaRuns.filter((r) => r.status === 'completed').length;
    const running = areaRuns.filter((r) => r.status === 'running').length;
    const failed = areaRuns.filter((r) => r.status === 'failed').length;
    const score = total > 0 ? Math.round(((completed + running * 0.5) / total) * 100) : 100;
    const trend = computeAreaTrend(areaRuns);

    return {
      area,
      score,
      ...trend,
      total,
      completed,
      running,
      failed,
    };
  });
}

export function computeOverallHealth(runs: FuzzingRun[]): HealthTrend {
  if (runs.length === 0) {
    return { current: 100, previous: 100, direction: 'neutral', change: 0 };
  }

  const sorted = [...runs].sort((a, b) => getRunDate(a).localeCompare(getRunDate(b)));
  const mid = Math.floor(sorted.length / 2);
  const recent = sorted.slice(mid);
  const older = sorted.slice(0, mid);

  const recentScore = computeRunHealthScore(recent);
  const olderScore = computeRunHealthScore(older);
  const diff = recentScore - olderScore;

  let direction: 'up' | 'down' | 'neutral';
  if (diff > 5) direction = 'up';
  else if (diff < -5) direction = 'down';
  else direction = 'neutral';

  return {
    current: recentScore,
    previous: olderScore,
    direction,
    change: Math.abs(diff),
  };
}

function computeAreaTrend(runs: FuzzingRun[]): { trend: 'up' | 'down' | 'neutral'; change: number } {
  if (runs.length < 2) {
    return { trend: 'neutral', change: 0 };
  }

  const sorted = [...runs].sort((a, b) => getRunDate(a).localeCompare(getRunDate(b)));
  const mid = Math.floor(sorted.length / 2);
  const recent = sorted.slice(mid);
  const older = sorted.slice(0, mid);

  const recentScore = computeRunHealthScore(recent);
  const olderScore = computeRunHealthScore(older);
  const diff = recentScore - olderScore;

  if (diff > 5) return { trend: 'up', change: diff };
  if (diff < -5) return { trend: 'down', change: Math.abs(diff) };
  return { trend: 'neutral', change: Math.abs(diff) };
}

function getRunDate(run: FuzzingRun): string {
  if (run.finishedAt) return run.finishedAt.split('T')[0];
  if (run.startedAt) return run.startedAt.split('T')[0];
  if (run.queuedAt) return run.queuedAt.split('T')[0];
  return '1970-01-01';
}

export function getHealthStatus(score: number): { label: string; colorClass: string; bgClass: string } {
  if (score > 80) {
    return {
      label: 'Healthy',
      colorClass: 'text-emerald-600 dark:text-emerald-400',
      bgClass: 'bg-emerald-100 dark:bg-emerald-900/30',
    };
  }
  if (score > 50) {
    return {
      label: 'Warning',
      colorClass: 'text-amber-600 dark:text-amber-400',
      bgClass: 'bg-amber-100 dark:bg-amber-900/30',
    };
  }
  return {
    label: 'Critical',
    colorClass: 'text-rose-600 dark:text-rose-400',
    bgClass: 'bg-rose-100 dark:bg-rose-900/30',
  };
}

export function getTrendIcon(direction: 'up' | 'down' | 'neutral') {
  const iconClass = 'w-3.5 h-3.5';
  const up = (
    <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M7 17l9.2-9.2M17 17V7H7" />
    </svg>
  );
  const down = (
    <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M17 7l-9.2 9.2M7 7v10h10" />
    </svg>
  );
  const neutral = (
    <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
    </svg>
  );
  return direction === 'up' ? up : direction === 'down' ? down : neutral;
}
