'use client';

/**
 * Issue #XXX – Add Report Generator UI
 *
 * This component allows users to configure parameters, generate a
 * structured JSON report from fuzzing data, and download the results.
 */

import React, { useState } from 'react';
import { FuzzingRun, RunArea, RunSeverity } from './types';

// --- Types ---

export type Report = {
  generatedAt: string;
  filters: {
    dateRange?: string;
    severity?: string | 'all';
    area?: string | 'all';
  };
  summary: {
    totalRuns: number;
    totalCrashes: number;
    averageDurationMs: number;
    mostFrequentArea?: string;
    mostFrequentSeverity?: string;
  };
  data: FuzzingRun[];
};

interface ReportGeneratorProps {
  availableRuns: FuzzingRun[];
}

// --- Main Component ---

export default function ReportGenerator({ availableRuns }: ReportGeneratorProps) {
  const [dateRange, setDateRange] = useState('last-7-days');
  const [severity, setSeverity] = useState<RunSeverity | 'all'>('all');
  const [area, setArea] = useState<RunArea | 'all'>('all');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setGeneratedReport(null);

    // Artificial delay to simulate processing
    await new Promise((resolve) => setTimeout(resolve, 1200));

    try {
      // Filter logic
      const filteredData = availableRuns.filter((run) => {
        const severityMatch = severity === 'all' || run.severity === severity;
        const areaMatch = area === 'all' || run.area === area;
        return severityMatch && areaMatch;
      });

      if (filteredData.length === 0) {
        throw new Error('No data found matching the selected filters.');
      }

      // Calculate summary stats
      const totalRuns = filteredData.length;
      const totalCrashes = filteredData.filter((r) => r.crashDetail !== null).length;
      const totalDuration = filteredData.reduce((acc, r) => acc + r.duration, 0);
      
      const areaCounts = filteredData.reduce((acc, r) => {
        acc[r.area] = (acc[r.area] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const mostFrequentArea = Object.entries(areaCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

      const severityCounts = filteredData.reduce((acc, r) => {
        acc[r.severity] = (acc[r.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const mostFrequentSeverity = Object.entries(severityCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

      const report: Report = {
        generatedAt: new Date().toISOString(),
        filters: { dateRange, severity, area },
        summary: {
          totalRuns,
          totalCrashes,
          averageDurationMs: totalDuration / totalRuns,
          mostFrequentArea,
          mostFrequentSeverity,
        },
        data: filteredData,
      };

      setGeneratedReport(report);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate report.';
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedReport) return;

    const blob = new Blob([JSON.stringify(generatedReport, null, 2)], {
      type: 'application/json',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crashlab-report-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-zinc-100 dark:border-zinc-900">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Report Generator</h2>
          <p className="text-sm text-zinc-500 mt-1">Configure parameters to export run datasets.</p>
        </div>
        <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
          <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Date Range Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 px-1">Date Range</label>
          <select 
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="w-full p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          >
            <option value="today">Today</option>
            <option value="last-24-hours">Last 24 Hours</option>
            <option value="last-7-days">Last 7 Days</option>
            <option value="last-30-days">Last 30 Days</option>
            <option value="all-time">All Time</option>
          </select>
        </div>

        {/* Severity Filter */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 px-1">Severity</label>
          <select 
            value={severity}
            onChange={(e) => setSeverity(e.target.value as RunSeverity | 'all')}
            className="w-full p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          >
            <option value="all">All Severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        {/* Area Filter */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 px-1">Contract Area</label>
          <select 
            value={area}
            onChange={(e) => setArea(e.target.value as RunArea | 'all')}
            className="w-full p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          >
            <option value="all">All Areas</option>
            <option value="auth">Auth</option>
            <option value="state">State</option>
            <option value="budget">Budget</option>
            <option value="xdr">XDR</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <button 
          onClick={handleGenerate}
          disabled={isGenerating}
          className={`
            w-full py-3.5 rounded-xl font-bold text-sm transition-all shadow-sm
            flex items-center justify-center gap-2
            ${isGenerating 
              ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-400 cursor-not-allowed' 
              : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 dark:shadow-indigo-900/20'}
          `}
        >
          {isGenerating ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Generating Dataset...
            </>
          ) : 'Generate Report'}
        </button>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 p-4 rounded-xl text-sm text-red-600 dark:text-red-400 flex gap-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {generatedReport && (
          <div className="animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
              <div className="p-4 bg-zinc-100/50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Report Preview</span>
                <span className="text-[10px] font-mono text-zinc-400">{generatedReport.generatedAt}</span>
              </div>
              
              <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex flex-col">
                  <span className="text-2xl font-black text-zinc-900 dark:text-zinc-100">{generatedReport.summary.totalRuns}</span>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase">Runs Analyzed</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-2xl font-black text-red-600">{generatedReport.summary.totalCrashes}</span>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase">Total Crashes</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-2xl font-black text-zinc-900 dark:text-zinc-100">{(generatedReport.summary.averageDurationMs / 1000).toFixed(1)}s</span>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase">Avg Duration</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-lg font-black text-zinc-900 dark:text-zinc-100 uppercase truncate">
                    {generatedReport.summary.mostFrequentArea || 'N/A'}
                  </span>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase">Peak Area</span>
                </div>
              </div>

              <div className="px-6 pb-6">
                <button 
                  onClick={handleDownload}
                  className="w-full py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download JSON Dataset
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
