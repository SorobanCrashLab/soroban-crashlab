'use client';

import React from 'react';
import { RunSeverity } from './types';

interface RunSeverityFilterProps {
  value: 'all' | RunSeverity;
  onChange: (value: 'all' | RunSeverity) => void;
}

const SEVERITY_OPTIONS: Array<'all' | RunSeverity> = ['all', 'low', 'medium', 'high', 'critical'];

/**
 * Filter component for selecting run severity.
 */
export default function RunSeverityFilter({ value, onChange }: RunSeverityFilterProps) {
  return (
    <label className="flex items-center gap-3 group">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        <span className="text-zinc-500 dark:text-zinc-400 font-bold uppercase text-[10px] tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Severity</span>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as any)}
        className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-2 text-xs font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xl shadow-black/5 transition-all cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-700"
      >
        {SEVERITY_OPTIONS.map((opt) => (
          <option key={opt} value={opt} className="bg-white dark:bg-zinc-900 font-bold">
            {opt === 'all' ? 'All Levels' : opt}
          </option>
        ))}
      </select>
    </label>
  );
}
