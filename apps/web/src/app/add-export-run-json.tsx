'use client';

import React, { useState } from 'react';
import type { FuzzingRun } from './types';

type ExportRunJsonProps = {
  runs: FuzzingRun[];
};

export default function AddExportRunJson({ runs }: ExportRunJsonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    setIsExporting(true);
    
    // Simulate slight delay for UX
    setTimeout(() => {
      try {
        const jsonString = JSON.stringify(runs, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `soroban-runs-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Export failed:', error);
      } finally {
        setIsExporting(false);
      }
    }, 600);
  };

  return (
    <div className="group relative overflow-hidden rounded-[2rem] border border-blue-200 bg-blue-50/50 p-8 shadow-sm transition-all hover:shadow-md dark:border-blue-900/30 dark:bg-blue-950/20">
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-blue-500/10 blur-3xl transition-transform group-hover:scale-150" />
      
      <div className="relative z-10">
        <div className="flex items-center gap-4 mb-4">
          <div className="h-12 w-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Export as JSON</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Download primary run data for programmatic analysis.</p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Total records</span>
            <span className="text-2xl font-black text-blue-600 dark:text-blue-400">{runs.length}</span>
          </div>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className={`relative flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all active:scale-95 ${
              isExporting 
                ? 'bg-zinc-200 text-zinc-500 cursor-not-allowed dark:bg-zinc-800' 
                : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-500/30'
            }`}
          >
            {isExporting ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </>
            ) : (
              <>
                <span>Generate Export</span>
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
