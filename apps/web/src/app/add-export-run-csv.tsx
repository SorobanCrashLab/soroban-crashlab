'use client';

import React, { useState } from 'react';
import type { FuzzingRun } from './types';

type ExportRunCsvProps = {
  runs: FuzzingRun[];
};

export default function AddExportRunCsv({ runs }: ExportRunCsvProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    setIsExporting(true);
    
    setTimeout(() => {
      try {
        const headers = ['ID', 'Status', 'Area', 'Severity', 'Duration (ms)', 'Seed Count', 'CPU Instructions', 'Memory (Bytes)', 'Min Fee'];
        const csvRows = [
          headers.join(','),
          ...runs.map(run => [
            run.id,
            run.status,
            run.area,
            run.severity,
            run.duration.toFixed(0),
            run.seedCount,
            run.cpuInstructions,
            run.memoryBytes,
            run.minResourceFee
          ].join(','))
        ];
        
        const csvString = csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `soroban-runs-export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('CSV Export failed:', error);
      } finally {
        setIsExporting(false);
      }
    }, 800);
  };

  return (
    <div className="group relative overflow-hidden rounded-[2rem] border border-emerald-200 bg-emerald-50/50 p-8 shadow-sm transition-all hover:shadow-md dark:border-emerald-900/30 dark:bg-emerald-950/20">
      <div className="absolute -left-8 -bottom-8 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl transition-transform group-hover:scale-150" />
      
      <div className="relative z-10">
        <div className="flex items-center gap-4 mb-4">
          <div className="h-12 w-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Export as CSV</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Download tabular run data for spreadsheets or reporting.</p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">File format</span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">CSV-UTF8</span>
          </div>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className={`relative flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all active:scale-95 ${
              isExporting 
                ? 'bg-zinc-200 text-zinc-500 cursor-not-allowed dark:bg-zinc-800' 
                : 'bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-500/30'
            }`}
          >
            {isExporting ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Building...
              </>
            ) : (
              <>
                <span>Export Spreadsheet</span>
                <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
