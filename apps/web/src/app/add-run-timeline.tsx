'use client';

import React, { useMemo, useState } from 'react';
import type { FuzzingRun, RunStatus } from './types';

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

interface RunTimelineProps {
  runs: FuzzingRun[];
  onSelectRun: (runId: string) => void;
}

export default function AddRunTimeline({ runs, onSelectRun }: RunTimelineProps) {
  const [hoveredRunId, setHoveredRunId] = useState<string | null>(null);

  // Take the 10 most recent runs that have startedAt and either finishedAt or duration
  const timelineRuns = useMemo(() => {
    return runs
      .filter(r => r.startedAt)
      .slice(0, 10)
      .sort((a, b) => new Date(a.startedAt!).getTime() - new Date(b.startedAt!).getTime());
  }, [runs]);

  const { minTime, maxTime, timeRange } = useMemo(() => {
    if (timelineRuns.length === 0) return { minTime: 0, maxTime: 0, timeRange: 0 };

    const startTimes = timelineRuns.map(r => new Date(r.startedAt!).getTime());
    const endTimes = timelineRuns.map(r => {
      if (r.finishedAt) return new Date(r.finishedAt).getTime();
      return new Date(r.startedAt!).getTime() + (r.duration || 0);
    });

    const min = Math.min(...startTimes);
    const max = Math.max(...endTimes);
    
    // Add 5% padding to the range
    const range = max - min;
    const padding = range * 0.05;
    
    return {
      minTime: min - padding,
      maxTime: max + padding,
      timeRange: range + (padding * 2)
    };
  }, [timelineRuns]);

  if (timelineRuns.length === 0) return null;

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <section className="w-full rounded-[2.5rem] border border-black/[.08] bg-white/80 p-8 shadow-xl backdrop-blur-md dark:border-white/[.145] dark:bg-zinc-950/80">
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-blue-600 dark:text-blue-400">
              Live Operations
            </p>
          </div>
          <h2 className="text-4xl font-extrabold tracking-tight">Run Timeline</h2>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-zinc-500 dark:text-zinc-400">
            A high-fidelity visualization of concurrent execution blocks and their respective lifecycle states.
          </p>
        </div>
        
        <div className="hidden lg:flex items-center gap-4 text-xs font-bold text-zinc-400">
           {Object.entries(STATUS_COLORS).map(([status, color]) => (
             <div key={status} className="flex items-center gap-2">
               <div className={`h-2 w-2 rounded-full ${color.split(' ')[0]}`} />
               <span className="capitalize">{status}</span>
             </div>
           ))}
        </div>
      </div>

      <div className="relative mt-12 pb-6">
        {/* Time Markers */}
        <div className="absolute inset-0 flex justify-between pointer-events-none border-x border-zinc-100 dark:border-zinc-800">
          {[0, 0.25, 0.5, 0.75, 1].map((p) => (
            <div key={p} className="relative h-full border-r border-zinc-100 dark:border-zinc-800 last:border-0">
               <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold text-zinc-400 bg-white px-2 py-0.5 rounded-full dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                 {formatTime(minTime + (p * timeRange))}
               </span>
            </div>
          ))}
        </div>

        {/* Timeline Rows */}
        <div className="relative space-y-3 z-10 pt-4">
          {timelineRuns.map((run) => {
            const start = new Date(run.startedAt!).getTime();
            const end = run.finishedAt ? new Date(run.finishedAt).getTime() : start + (run.duration || 0);
            
            const left = ((start - minTime) / timeRange) * 100;
            const width = Math.max(((end - start) / timeRange) * 100, 1.5); // Min width for visibility

            const isHovered = hoveredRunId === run.id;

            return (
              <div 
                key={run.id} 
                className="group relative h-10 w-full"
                onMouseEnter={() => setHoveredRunId(run.id)}
                onMouseLeave={() => setHoveredRunId(null)}
              >
                <div
                  className={`absolute h-full rounded-full transition-all duration-300 cursor-pointer flex items-center px-4 overflow-hidden border-2 border-transparent hover:border-white/20 hover:scale-[1.02] shadow-sm ${STATUS_COLORS[run.status]} ${STATUS_HOVER_COLORS[run.status]}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  onClick={() => onSelectRun(run.id)}
                >
                  <span className={`text-[10px] font-black uppercase tracking-tighter text-white whitespace-nowrap opacity-60 group-hover:opacity-100 transition-opacity`}>
                    {run.id}
                  </span>
                </div>

                {/* Tooltip on Hover */}
                {isHovered && (
                  <div 
                    className="absolute z-50 bottom-full mb-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 p-4 rounded-2xl shadow-2xl border border-white/10 dark:border-zinc-200 min-w-[240px] animate-in fade-in slide-in-from-bottom-2 duration-200"
                    style={{ left: `${left + (width / 2)}%`, transform: 'translateX(-50%)' }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-xs font-bold opacity-60">{run.id}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                         run.status === 'failed' ? 'bg-rose-500 text-white' : 
                         run.status === 'completed' ? 'bg-emerald-500 text-white' : 
                         'bg-blue-500 text-white'
                      }`}>
                        {run.status}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                      <div>
                        <div className="text-[10px] font-bold uppercase opacity-50 tracking-widest text-zinc-400 dark:text-zinc-500">Duration</div>
                        <div className="text-sm font-bold">{(run.duration / 1000).toFixed(1)}s</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase opacity-50 tracking-widest text-zinc-400 dark:text-zinc-500">Area</div>
                        <div className="text-sm font-bold capitalize">{run.area}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase opacity-50 tracking-widest text-zinc-400 dark:text-zinc-500">CPU Instr</div>
                        <div className="text-sm font-bold">{(run.cpuInstructions / 1000).toFixed(0)}k</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase opacity-50 tracking-widest text-zinc-400 dark:text-zinc-500">Seeds</div>
                        <div className="text-sm font-bold">{run.seedCount.toLocaleString()}</div>
                      </div>
                    </div>
                    
                    <div className="mt-4 pt-3 border-t border-white/10 dark:border-zinc-100 text-[10px] font-medium opacity-50 text-center">
                      Click block for full execution trace
                    </div>
                    
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-zinc-900 dark:bg-white rotate-45" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
