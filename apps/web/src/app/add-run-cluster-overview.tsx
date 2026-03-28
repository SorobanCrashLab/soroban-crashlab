'use client';

import React, { useMemo } from 'react';
import { FuzzingRun, RunArea, RunStatus, RunSeverity } from './types';

interface RunClusterOverviewProps {
  runs: FuzzingRun[];
}

export interface ClusterStats {
  area: RunArea;
  total: number;
  failed: number;
  running: number;
  completed: number;
  avgCpu: number;
  criticalIssues: number;
  healthScore: number;
}

export function computeClusterStats(runs: FuzzingRun[]): ClusterStats[] {
  const areas: RunArea[] = ['auth', 'state', 'budget', 'xdr'];

  return areas.map((area) => {
    const areaRuns = runs.filter((r) => r.area === area);
    const total = areaRuns.length;
    const failed = areaRuns.filter((r) => r.status === 'failed').length;
    const running = areaRuns.filter((r) => r.status === 'running').length;
    const completed = areaRuns.filter((r) => r.status === 'completed').length;

    const avgCpu =
      total > 0
        ? Math.round(areaRuns.reduce((acc, r) => acc + r.cpuInstructions, 0) / total)
        : 0;

    const criticalIssues = areaRuns.filter((r) => r.severity === 'critical').length;

    const healthScore =
      total > 0 ? Math.round(((completed + running * 0.5) / total) * 100) : 100;

    return { area, total, failed, running, completed, avgCpu, criticalIssues, healthScore };
  });
}

const AREA_CONFIG: Record<RunArea, { label: string; icon: React.ReactNode; color: string; description: string }> = {
  auth: {
    label: 'Authentication',
    description: 'Access control and identity verification',
    color: 'indigo',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  state: {
    label: 'State Management',
    description: 'Contract storage and state transitions',
    color: 'emerald',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
  },
  budget: {
    label: 'Budgeting & Fees',
    description: 'Resource consumption and fee limits',
    color: 'amber',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  xdr: {
    label: 'XDR Serialization',
    description: 'Data encoding and decoding protocols',
    color: 'rose',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 11-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 011-1h1a2 2 0 100-4H7a1 1 0 01-1-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
      </svg>
    ),
  },
};

const COLOR_CLASSES: Record<string, { topBar: string; icon: string; healthText: string }> = {
  indigo: {
    topBar: 'from-indigo-500 to-indigo-300',
    icon: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
    healthText: 'text-indigo-600 dark:text-indigo-400',
  },
  emerald: {
    topBar: 'from-emerald-500 to-emerald-300',
    icon: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
    healthText: 'text-emerald-600 dark:text-emerald-400',
  },
  amber: {
    topBar: 'from-amber-500 to-amber-300',
    icon: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    healthText: 'text-amber-600 dark:text-amber-400',
  },
  rose: {
    topBar: 'from-rose-500 to-rose-300',
    icon: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400',
    healthText: 'text-rose-600 dark:text-rose-400',
  },
};

const HEALTH_COLORS = {
  emerald: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
  rose: 'text-rose-600 dark:text-rose-400',
};

export function getHealthColor(score: number): string {
  const colorKey = score > 80 ? 'emerald' : score > 50 ? 'amber' : 'rose';
  return HEALTH_COLORS[colorKey];
}

const RunClusterOverview: React.FC<RunClusterOverviewProps> = ({ runs }) => {
  const clusterStats = useMemo(() => computeClusterStats(runs), [runs]);

  return (
    <div className="w-full space-y-6" aria-label="Cluster Health Overview">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cluster Health Overview</h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            Real-time diagnostics and health scoring across all fuzzer focus areas.
          </p>
        </div>
        <div className="flex gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                System Healthy
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {clusterStats.map((stats) => {
          const config = AREA_CONFIG[stats.area];
          const healthColorClass = getHealthColor(stats.healthScore);
          const styleConfig = COLOR_CLASSES[config.color];
          
          return (
            <div 
              key={stats.area}
              className="group relative bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
            >
              <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${styleConfig.topBar}`} />
              
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2.5 rounded-xl ${styleConfig.icon}`}>
                    {config.icon}
                  </div>
                  <div className="text-right">
                    <span className={`text-2xl font-bold ${healthColorClass}`}>
                      {stats.healthScore}%
                    </span>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-400">Health Index</p>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1">{config.label}</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6">{config.description}</p>

                <div className="space-y-4">
                  {/* Progress bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight text-zinc-500">
                      <span>Coverage Status</span>
                      <span>{stats.total} total runs</span>
                    </div>
                    <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden flex">
                      <div 
                        className="h-full bg-emerald-500 transition-all duration-500" 
                        style={{ width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}%` }}
                        title="Completed"
                      />
                      <div 
                        className="h-full bg-blue-500 transition-all duration-500" 
                        style={{ width: `${stats.total > 0 ? (stats.running / stats.total) * 100 : 0}%` }}
                        title="Running"
                      />
                      <div 
                        className="h-full bg-rose-500 transition-all duration-500" 
                        style={{ width: `${stats.total > 0 ? (stats.failed / stats.total) * 100 : 0}%` }}
                        title="Failed"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50">
                      <p className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Avg CPU</p>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {stats.avgCpu.toLocaleString()}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50">
                      <p className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Criticals</p>
                      <p className={`text-sm font-semibold ${stats.criticalIssues > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                        {stats.criticalIssues}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800/50 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">View detailed metrics</span>
                <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* High-level system insight */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-lg overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-10">
            <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
        </div>
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
            <div className="flex-1">
                <h3 className="text-xl font-bold mb-2">Cross-Cluster Predictive Risk</h3>
                <p className="text-indigo-100 text-sm leading-relaxed max-w-2xl">
                    Based on current mutation patterns and invariant breach history, the <strong>State Management</strong> cluster shows a 14% increase in resource exhaustion probability. Consider increasing budget limits for state-heavy runs.
                </p>
            </div>
            <button className="px-6 py-2.5 bg-white text-indigo-600 rounded-xl font-bold text-sm hover:bg-indigo-50 transition-colors shadow-sm">
                Analyze Risk vectors
            </button>
        </div>
      </div>
    </div>
  );
};

export default RunClusterOverview;
