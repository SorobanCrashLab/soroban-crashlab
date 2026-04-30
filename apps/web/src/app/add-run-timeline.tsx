'use client';

import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import type { FuzzingRun, RunStatus } from './types';

type DataState = 'loading' | 'error' | 'success';

const STATUS_COLORS: Record<RunStatus, string> = {
  completed: 'bg-emerald-500 shadow-emerald-500/20',
  failed: 'bg-rose-500 shadow-rose-500/20',
  running: 'bg-blue-500 shadow-blue-500/20',
  cancelled: 'bg-zinc-500 shadow-zinc-500/20',
};

const STATUS_HOVER_COLORS: Record<RunStatus, string> = {
  completed: 'hover:bg-emerald-400',
  failed: 'hover:bg-rose-400',
  running: 'hover:bg-blue-400',
  cancelled: 'hover:bg-zinc-400',
};

const STATUS_FOCUS_COLORS: Record<RunStatus, string> = {
  completed: 'focus:ring-emerald-500',
  failed: 'focus:ring-rose-500',
  running: 'focus:ring-blue-500',
  cancelled: 'focus:ring-zinc-500',
};

interface RunTimelineProps {
  runs: FuzzingRun[];
  onSelectRun: (runId: string) => void;
  dataState?: DataState;
  onRetry?: () => void;
  errorMessage?: string;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

function TimelineSkeleton() {
  return (
    <section className="w-full rounded-[2.5rem] border border-black/[.08] bg-white/80 p-8 shadow-xl backdrop-blur-md dark:border-white/[.145] dark:bg-zinc-950/80">
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700 animate-pulse" />
            <div className="h-3 w-24 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
          </div>
          <div className="h-10 w-40 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
          <div className="mt-4 h-5 w-80 bg-zinc-100 dark:bg-zinc-900 rounded animate-pulse" />
        </div>
      </div>
      <div className="relative mt-12 pb-6">
        <div className="flex justify-between mb-8">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-4 w-12 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-zinc-100 dark:bg-zinc-800 rounded-full animate-pulse" style={{ width: `${60 + Math.random() * 30}%`, marginLeft: `${Math.random() * 10}%` }} />
          ))}
        </div>
      </div>
    </section>
  );
}

function TimelineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <section className="w-full rounded-[2.5rem] border border-rose-200 dark:border-rose-900/50 bg-rose-50/80 dark:bg-rose-950/30 p-8 shadow-lg">
      <div className="flex flex-col items-center justify-center py-8">
        <div className="h-12 w-12 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center mb-4">
          <svg className="h-6 w-6 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-rose-700 dark:text-rose-400 mb-2">Unable to Load Timeline</h3>
        <p className="text-sm text-rose-600 dark:text-rose-500 text-center max-w-md mb-4">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
          >
            Retry
          </button>
        )}
      </div>
    </section>
  );
}

function EmptyTimeline() {
  return (
    <section className="w-full rounded-[2.5rem] border border-black/[.08] bg-white/80 p-8 shadow-xl backdrop-blur-md dark:border-white/[.145] dark:bg-zinc-950/80">
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-600" />
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-blue-600 dark:text-blue-400">
              Live Operations
            </p>
          </div>
          <h2 className="text-4xl font-extrabold tracking-tight">Run Timeline</h2>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-zinc-500 dark:text-zinc-400">
            A high-fidelity visualization of concurrent execution blocks and their respective lifecycle states.
          </p>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
        <div className="h-12 w-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
          <svg className="h-6 w-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-zinc-500 dark:text-zinc-400 font-medium">No runs with timeline data available</p>
        <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">Start a campaign to see execution timeline</p>
      </div>
    </section>
  );
}

export default function AddRunTimeline({ 
  runs, 
  onSelectRun, 
  dataState = 'success',
  onRetry,
  errorMessage = 'Failed to load run timeline data. Please try again.'
}: RunTimelineProps) {
  const [hoveredRunId, setHoveredRunId] = useState<string | null>(null);
  const [focusedRunIndex, setFocusedRunIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const runBlockRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const timelineRuns = useMemo(() => {
    return runs
      .filter(r => r.startedAt)
      .slice(0, 10)
      .sort((a, b) => new Date(a.startedAt!).getTime() - new Date(b.startedAt!).getTime());
  }, [runs]);

  const { minTime, timeRange } = useMemo(() => {
    if (timelineRuns.length === 0) return { minTime: 0, timeRange: 0 };

    const startTimes = timelineRuns.map(r => new Date(r.startedAt!).getTime());
    const endTimes = timelineRuns.map(r => {
      if (r.finishedAt) return new Date(r.finishedAt).getTime();
      return new Date(r.startedAt!).getTime() + (r.duration || 0);
    });

    const min = Math.min(...startTimes);
    const max = Math.max(...endTimes);
    const range = max - min;
    const padding = range * 0.05;
    
    return {
      minTime: min - padding,
      timeRange: range + (padding * 2)
    };
  }, [timelineRuns]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, runId: string, index: number) => {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelectRun(runId);
        break;
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        if (index < timelineRuns.length - 1) {
          const nextRun = timelineRuns[index + 1];
          const nextButton = runBlockRefs.current.get(nextRun.id);
          nextButton?.focus();
          setFocusedRunIndex(index + 1);
        }
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        if (index > 0) {
          const prevRun = timelineRuns[index - 1];
          const prevButton = runBlockRefs.current.get(prevRun.id);
          prevButton?.focus();
          setFocusedRunIndex(index - 1);
        }
        break;
      case 'Home':
        e.preventDefault();
        if (timelineRuns.length > 0) {
          const firstButton = runBlockRefs.current.get(timelineRuns[0].id);
          firstButton?.focus();
          setFocusedRunIndex(0);
        }
        break;
      case 'End':
        e.preventDefault();
        if (timelineRuns.length > 0) {
          const lastButton = runBlockRefs.current.get(timelineRuns[timelineRuns.length - 1].id);
          lastButton?.focus();
          setFocusedRunIndex(timelineRuns.length - 1);
        }
        break;
      case 'Escape':
        setHoveredRunId(null);
        setFocusedRunIndex(null);
        break;
    }
  }, [onSelectRun, timelineRuns]);

  const handleFocus = useCallback((runId: string, index: number) => {
    setFocusedRunIndex(index);
    setHoveredRunId(runId);
  }, []);

  const handleBlur = useCallback(() => {
    setFocusedRunIndex(null);
    setHoveredRunId(null);
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && hoveredRunId) {
        setHoveredRunId(null);
        setFocusedRunIndex(null);
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [hoveredRunId]);

  if (dataState === 'loading') {
    return <TimelineSkeleton />;
  }

  if (dataState === 'error') {
    return <TimelineError message={errorMessage} onRetry={onRetry} />;
  }

  if (timelineRuns.length === 0) {
    return <EmptyTimeline />;
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <section 
      className="w-full rounded-[2.5rem] border border-black/[.08] bg-white/80 p-4 sm:p-6 md:p-8 shadow-xl backdrop-blur-md dark:border-white/[.145] dark:bg-zinc-950/80"
      aria-label="Run Timeline"
      ref={containerRef}
    >
      <div className="mb-6 md:mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" aria-hidden="true" />
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-blue-600 dark:text-blue-400">
              Live Operations
            </p>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">Run Timeline</h2>
          <p className="mt-2 md:mt-4 max-w-xl text-base md:text-lg leading-relaxed text-zinc-500 dark:text-zinc-400">
            A high-fidelity visualization of concurrent execution blocks and their respective lifecycle states.
          </p>
        </div>
        
        <div className="hidden lg:flex items-center gap-4 text-xs font-bold text-zinc-400" role="list" aria-label="Status legend">
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} className="flex items-center gap-2" role="listitem">
              <div className={`h-2 w-2 rounded-full ${color.split(' ')[0]}`} aria-hidden="true" />
              <span className="capitalize">{status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative mt-8 md:mt-12 pb-4 md:pb-6 overflow-x-auto" role="application" aria-label="Timeline visualization">
        <div className="absolute inset-0 flex justify-between pointer-events-none border-x border-zinc-100 dark:border-zinc-800 min-w-[600px]" aria-hidden="true">
          {[0, 0.25, 0.5, 0.75, 1].map((p) => (
            <div key={p} className="relative h-full border-r border-zinc-100 dark:border-zinc-800 last:border-0">
              <span className="absolute -top-6 md:-top-8 left-1/2 -translate-x-1/2 text-[9px] md:text-[10px] font-mono font-bold text-zinc-400 bg-white px-1.5 md:px-2 py-0.5 rounded-full dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 whitespace-nowrap">
                {formatTime(minTime + (p * timeRange))}
              </span>
            </div>
          ))}
        </div>

        <div className="relative space-y-2 md:space-y-3 z-10 pt-4 min-w-[600px]" role="list" aria-label="Timeline runs">
          {timelineRuns.map((run, index) => {
            const start = new Date(run.startedAt!).getTime();
            const end = run.finishedAt ? new Date(run.finishedAt).getTime() : start + (run.duration || 0);
            
            const left = ((start - minTime) / timeRange) * 100;
            const width = Math.max(((end - start) / timeRange) * 100, 1.5);

            const isHovered = hoveredRunId === run.id;
            const isFocused = focusedRunIndex === index;

            return (
              <div 
                key={run.id} 
                className="group relative h-8 md:h-10 w-full"
                onMouseEnter={() => setHoveredRunId(run.id)}
                onMouseLeave={() => setHoveredRunId(null)}
                role="listitem"
              >
                <button
                  ref={(el) => { if (el) runBlockRefs.current.set(run.id, el); }}
                  type="button"
                  className={`absolute h-full rounded-full transition-all duration-300 flex items-center px-2 md:px-4 overflow-hidden border-2 border-transparent shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-zinc-950 ${STATUS_COLORS[run.status]} ${STATUS_HOVER_COLORS[run.status]} ${STATUS_FOCUS_COLORS[run.status]}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  onClick={() => onSelectRun(run.id)}
                  onKeyDown={(e) => handleKeyDown(e, run.id, index)}
                  onFocus={() => handleFocus(run.id, index)}
                  onBlur={handleBlur}
                  aria-label={`${run.id}: ${run.status}, duration ${formatDuration(run.duration)}, area ${run.area}`}
                  aria-describedby={isHovered ? `tooltip-${run.id}` : undefined}
                >
                  <span className="text-[9px] md:text-[10px] font-black uppercase tracking-tighter text-white whitespace-nowrap opacity-60 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
                    {run.id}
                  </span>
                </button>

                {(isHovered || isFocused) && (
                  <div 
                    id={`tooltip-${run.id}`}
                    role="tooltip"
                    className="absolute z-50 bottom-full mb-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 p-3 md:p-4 rounded-xl md:rounded-2xl shadow-2xl border border-white/10 dark:border-zinc-200 min-w-[200px] md:min-w-[240px]"
                    style={{ left: `${Math.min(Math.max(left + (width / 2), 20), 80)}%`, transform: 'translateX(-50%)' }}
                  >
                    <div className="flex items-center justify-between mb-2 md:mb-3">
                      <span className="font-mono text-xs font-bold opacity-60">{run.id}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                         run.status === 'failed' ? 'bg-rose-500 text-white' : 
                         run.status === 'completed' ? 'bg-emerald-500 text-white' : 
                         'bg-blue-500 text-white'
                      }`}>
                        {run.status}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-y-2 md:gap-y-3 gap-x-3 md:gap-x-4">
                      <div>
                        <div className="text-[9px] md:text-[10px] font-bold uppercase opacity-50 tracking-widest text-zinc-400 dark:text-zinc-500">Duration</div>
                        <div className="text-xs md:text-sm font-bold">{formatDuration(run.duration)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] md:text-[10px] font-bold uppercase opacity-50 tracking-widest text-zinc-400 dark:text-zinc-500">Area</div>
                        <div className="text-xs md:text-sm font-bold capitalize">{run.area}</div>
                      </div>
                      <div>
                        <div className="text-[9px] md:text-[10px] font-bold uppercase opacity-50 tracking-widest text-zinc-400 dark:text-zinc-500">CPU Instr</div>
                        <div className="text-xs md:text-sm font-bold">{(run.cpuInstructions / 1000).toFixed(0)}k</div>
                      </div>
                      <div>
                        <div className="text-[9px] md:text-[10px] font-bold uppercase opacity-50 tracking-widest text-zinc-400 dark:text-zinc-500">Seeds</div>
                        <div className="text-xs md:text-sm font-bold">{run.seedCount.toLocaleString()}</div>
                      </div>
                    </div>
                    
                    <div className="mt-3 md:mt-4 pt-2 md:pt-3 border-t border-white/10 dark:border-zinc-100 text-[9px] md:text-[10px] font-medium opacity-50 text-center">
                      Press Enter to view details
                    </div>
                    
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-zinc-900 dark:bg-white rotate-45" aria-hidden="true" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="lg:hidden mt-4 flex flex-wrap items-center gap-3 text-xs font-bold text-zinc-400" role="list" aria-label="Status legend">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-2" role="listitem">
            <div className={`h-2 w-2 rounded-full ${color.split(' ')[0]}`} aria-hidden="true" />
            <span className="capitalize">{status}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
