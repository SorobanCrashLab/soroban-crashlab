'use client';

import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { FuzzingRun } from './types';

interface TimelineScrubberProps {
  runs: FuzzingRun[];
  onSelectRun: (runId: string) => void;
  isLoading?: boolean;
  error?: string | null;
}

export default function TimelineScrubber({ 
  runs, 
  onSelectRun, 
  isLoading = false, 
  error = null 
}: TimelineScrubberProps) {
  const [index, setIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (runs.length > 0 && index >= runs.length) {
      setIndex(runs.length - 1);
    }
  }, [runs.length, index]);

  const handleIndexChange = (newIndex: number) => {
    if (newIndex >= 0 && newIndex < runs.length) {
      setIndex(newIndex);
      onSelectRun(runs[newIndex].id);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      handleIndexChange(index + 1);
    } else if (e.key === 'ArrowLeft') {
      handleIndexChange(index - 1);
    } else if (e.key === 'Home') {
      handleIndexChange(0);
    } else if (e.key === 'End') {
      handleIndexChange(runs.length - 1);
    }
  };

  if (error) {
    return (
      <div className="w-full p-8 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-2xl flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-red-900 dark:text-red-100">Failed to load timeline</h3>
        <p className="text-sm text-red-700 dark:text-red-300 mt-1 max-w-md">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-6 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full p-6 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl animate-pulse">
        <div className="flex justify-between mb-8">
          <div className="space-y-3">
            <div className="h-6 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
            <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
          </div>
          <div className="h-10 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
        </div>
        <div className="h-3 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full mb-8" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
              <div className="h-5 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (runs.length === 0) return null;

  const currentRun = runs[index] || runs[0];
  const progress = (index / (runs.length - 1)) * 100;

  return (
    <div 
      className="w-full p-6 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl transition-all duration-300 hover:shadow-2xl hover:border-blue-500/30 group"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="slider"
      aria-label="Timeline Scrubber"
      aria-valuemin={0}
      aria-valuemax={runs.length - 1}
      aria-valuenow={index}
      aria-valuetext={`Run ${currentRun.id}, Status: ${currentRun.status}`}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            <h3 className="text-xl font-bold bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent">
              Timeline Explorer
            </h3>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Interactive replay of {runs.length} fuzzing cycles
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <button 
              onClick={() => handleIndexChange(index - 1)}
              disabled={index <= 0}
              className="p-2 rounded-lg hover:bg-white dark:hover:bg-zinc-800 disabled:opacity-30 transition-all active:scale-90"
              title="Previous Run"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button 
              onClick={() => handleIndexChange(index + 1)}
              disabled={index >= runs.length - 1}
              className="p-2 rounded-lg hover:bg-white dark:hover:bg-zinc-800 disabled:opacity-30 transition-all active:scale-90"
              title="Next Run"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-3 bg-zinc-100 dark:bg-zinc-900 p-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest pl-2">Selected</span>
            <span className="text-sm font-mono font-bold text-blue-600 dark:text-blue-400 bg-white dark:bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm">
              {currentRun.id}
            </span>
          </div>
        </div>
      </div>
      
      <div className="relative h-20 flex flex-col justify-center mb-8 px-2">
        {/* Track */}
        <div className="absolute left-0 right-0 h-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300 ease-out shadow-[0_0_15px_rgba(37,99,235,0.3)]"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Interaction Layer */}
        <input
          type="range"
          min="0"
          max={runs.length - 1}
          value={index}
          onChange={(e) => handleIndexChange(parseInt(e.target.value, 10))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />

        {/* Thumb */}
        <div 
          className="absolute h-6 w-6 bg-white dark:bg-zinc-950 border-4 border-blue-600 rounded-full shadow-lg transition-all duration-300 ease-out z-0 pointer-events-none group-focus-within:ring-4 group-focus-within:ring-blue-500/30"
          style={{ 
            left: `calc(${progress}% - 12px)`,
            transform: 'scale(1)' 
          }}
        />

        {/* Ticks */}
        <div className="flex justify-between w-full px-1 mt-10">
          {runs.map((run, i) => {
            const isSelected = i === index;
            const isNear = Math.abs(i - index) < 2;
            const isEndpoint = i === 0 || i === runs.length - 1;
            
            if (!isEndpoint && !isSelected && runs.length > 20) return null;

            return (
              <div 
                key={run.id}
                className={`flex flex-col items-center transition-all duration-300 ${isSelected ? 'scale-110' : 'scale-100 opacity-40'}`}
              >
                <div className={`w-1 h-2 rounded-full mb-2 ${isSelected ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-700'}`} />
                <span className={`text-[9px] font-bold tracking-tighter ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400'}`}>
                  {isEndpoint || isSelected ? run.id.slice(-4) : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 p-5 bg-zinc-50/50 dark:bg-zinc-900/30 rounded-2xl border border-zinc-200 dark:border-zinc-800/50 backdrop-blur-sm">
        <div className="space-y-1">
          <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Status</div>
          <div className="flex items-center gap-2">
             <StatusBadge status={currentRun.status} />
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Product Area</div>
          <div className="text-sm font-bold text-zinc-800 dark:text-zinc-200 capitalize">{currentRun.area}</div>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Risk Level</div>
          <div className="flex items-center gap-2">
            <SeverityBadge severity={currentRun.severity} />
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Seeds / Instructions</div>
          <div className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
            {currentRun.seedCount.toLocaleString()} <span className="text-zinc-400 font-normal">/</span> {(currentRun.cpuInstructions / 1_000_000).toFixed(1)}M
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    failed: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-800',
    cancelled: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700',
  };

  return (
    <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${colors[status] || colors.cancelled}`}>
      {status}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    low: 'text-zinc-600 dark:text-zinc-400',
    medium: 'text-amber-600 dark:text-amber-400',
    high: 'text-orange-600 dark:text-orange-400',
    critical: 'text-rose-600 dark:text-rose-400',
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full ${severity === 'critical' ? 'animate-ping' : ''} bg-current ${colors[severity]}`} />
      <span className={`text-sm font-bold capitalize ${colors[severity]}`}>{severity}</span>
    </div>
  );
}