'use client';

import { FuzzingRun } from './types';

interface IssueTriageBoardProps {
  runs: FuzzingRun[];
}

export default function IssueTriageBoard({ runs }: IssueTriageBoardProps) {
  const failedRuns = runs.filter(r => r.status === 'failed');
  const runningRuns = runs.filter(r => r.status === 'running');
  const cancelledRuns = runs.filter(r => r.status === 'cancelled');

  const columns = [
    { 
      title: 'Failed', 
      runs: failedRuns, 
      color: 'bg-rose-50/50 dark:bg-rose-950/10', 
      borderColor: 'border-rose-100 dark:border-rose-900/30',
      labelColor: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
    },
    { 
      title: 'Active', 
      runs: runningRuns, 
      color: 'bg-blue-50/50 dark:bg-blue-950/10', 
      borderColor: 'border-blue-100 dark:border-blue-900/30',
      labelColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
    },
    { 
      title: 'Cancelled', 
      runs: cancelledRuns, 
      color: 'bg-zinc-50/50 dark:bg-zinc-950/10', 
      borderColor: 'border-zinc-200 dark:border-zinc-800',
      labelColor: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
    },
  ];

  return (
    <div className="w-full mt-16 p-8 rounded-[2.5rem] bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800">
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-bold tracking-tight">Issue Triage Board</h2>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2">Manage failures and active campaigns in a kanban-style view</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {columns.map((col) => (
          <div key={col.title} className={`flex flex-col rounded-3xl border ${col.borderColor} ${col.color} p-5 min-h-[500px]`}>
            <div className="flex items-center justify-between mb-6 px-1">
              <h3 className="font-bold text-xl">{col.title}</h3>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${col.labelColor}`}>
                {col.runs.length}
              </span>
            </div>
            
            <div className="flex-1 space-y-4 overflow-y-auto pr-1">
              {col.runs.slice(0, 6).map((run) => (
                <div key={run.id} className="group bg-white dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all cursor-pointer">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">{run.id}</div>
                    <div className="h-1.5 w-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700 group-hover:bg-blue-500 transition-colors" />
                  </div>
                  <div className="text-sm font-semibold mb-3">{run.area}</div>
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{run.severity}</div>
                    <div className="text-[10px] text-zinc-500">{Math.round(run.seedCount / 1000)}k seeds</div>
                  </div>
                </div>
              ))}
              
              {col.runs.length === 0 && (
                <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl text-zinc-400">
                  <svg className="w-8 h-8 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <span className="text-xs font-medium">No active items</span>
                </div>
              )}

              {col.runs.length > 6 && (
                <button className="w-full py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-bold text-zinc-500 hover:bg-white dark:hover:bg-zinc-900 transition shadow-sm">
                  View all {col.runs.length} items
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}