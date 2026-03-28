'use client';

import { useState, useEffect } from 'react';
import { FuzzingRun } from './types';

interface TimelineScrubberProps {
  runs: FuzzingRun[];
  onSelectRun: (runId: string) => void;
}

export default function TimelineScrubber({ runs, onSelectRun }: TimelineScrubberProps) {
  const [index, setIndex] = useState(0);

  // Reset index or clamp it if the runs list changes significantly
  useEffect(() => {
    if (index >= runs.length && runs.length > 0) {
      const timer = setTimeout(() => {
        setIndex(runs.length - 1);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [runs.length, index]);

  if (runs.length === 0) return null;

  const currentRun = runs[index] || runs[0];

  return (
    <div className="w-full p-6 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm mb-12">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold">Timeline Scrubber</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Navigate through fuzzing history</p>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Selected Run</span>
          <span className="text-sm font-mono bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-3 py-1 rounded-lg border border-blue-100 dark:border-blue-800">
            {currentRun.id}
          </span>
        </div>
      </div>
      
      <div className="relative pt-4 pb-2 px-2">
        <input
          type="range"
          min="0"
          max={runs.length - 1}
          value={index}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            setIndex(val);
            onSelectRun(runs[val].id);
          }}
          className="w-full h-3 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600 hover:accent-blue-500 transition-all"
        />
        <div className="flex justify-between mt-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">
          <span>{runs[0]?.id || 'Oldest'}</span>
          <span>{runs[runs.length - 1]?.id || 'Latest'}</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-zinc-100 dark:border-zinc-800">
        <div>
          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Status</div>
          <div className="text-sm font-semibold capitalize">{currentRun.status}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Area</div>
          <div className="text-sm font-semibold capitalize">{currentRun.area}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Severity</div>
          <div className="text-sm font-semibold capitalize">{currentRun.severity}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Seeds</div>
          <div className="text-sm font-semibold">{currentRun.seedCount.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}