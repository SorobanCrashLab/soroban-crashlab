'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FuzzingRun } from '../types';
import { dedupedFetchJson } from '../../lib/request-dedup';

export default function AnalyticsPage() {
  const [runs, setRuns] = useState<FuzzingRun[]>([]);
  const [dataState, setDataState] = useState<'loading' | 'error' | 'success'>('loading');

  useEffect(() => {
    let cancelled = false;
    dedupedFetchJson<{ runs?: FuzzingRun[] }>('/api/runs')
      .then((data) => {
        if (!cancelled) {
          setRuns(data.runs ?? []);
          setDataState('success');
        }
      })
      .catch(() => {
        if (!cancelled) setDataState('error');
      });
    return () => { cancelled = true; };
  }, []);

  const byStatus = runs.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const bySeverity = runs.reduce((acc, r) => {
    acc[r.severity] = (acc[r.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byArea = runs.reduce((acc, r) => {
    acc[r.area] = (acc[r.area] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="container-full page-padding fade-in">
      <div className="mb-4 sm:mb-6">
        <h1 className="heading-page">Analytics</h1>
        <p className="text-meta mt-0.5 sm:mt-1">Failure clustering, heatmaps, trends and run comparisons</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8">
        {[
          { href: '/analytics/clusters', title: 'Failure Clusters', desc: 'View grouped failure signatures and crash patterns', icon: '◈' },
          { href: '/analytics/comparison', title: 'Run Comparison', desc: 'Compare two runs side by side to inspect metrics and metadata differences', icon: '⇄' },
          { href: '/analytics/heatmap', title: 'Performance Heatmap', desc: 'Visualize run duration, CPU and memory usage patterns', icon: '⊟' },
          { href: '/analytics/flaky', title: 'Flaky Test Detection', desc: 'Identify non-deterministic crashes and unstable tests', icon: '⊕' },
          { href: '/trends', title: 'Crash Trends', desc: 'Time series crash trend visualization and analysis', icon: '⊞' },
          { href: '/analytics/calendar', title: 'Run Heatmap Calendar', desc: 'Visualize run activity by date with GitHub-style contribution calendar', icon: '⊡' },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="card card-padding card-interactive flex items-start gap-3 sm:gap-4 text-decoration-none">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-base sm:text-lg flex-shrink-0" style={{ background: '#E7F0F9', color: '#0A66C2' }}>
              {item.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm sm:text-base" style={{ color: 'var(--text-primary)' }}>{item.title}</h3>
              <p className="text-meta mt-0.5 text-xs sm:text-sm">{item.desc}</p>
            </div>
            <span className="text-meta shrink-0">→</span>
          </Link>
        ))}
      </div>

      {dataState === 'loading' && (
        <div className="card card-padding flex items-center justify-center py-8 sm:py-12">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#0A66C2', borderTopColor: 'transparent' }} />
            <span className="text-meta">Loading analytics...</span>
          </div>
        </div>
      )}

      {dataState === 'success' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          <div className="card card-padding">
            <h3 className="font-semibold text-xs sm:text-sm mb-3 sm:mb-4" style={{ color: 'var(--text-secondary)' }}>By Status</h3>
            <div className="space-y-1.5 sm:space-y-2">
              {Object.entries(byStatus).map(([key, count]) => (
                <div key={key} className="flex justify-between items-center py-0.5 sm:py-1">
                  <span className="text-meta text-xs sm:text-sm">{key}</span>
                  <span className="font-semibold text-sm sm:text-base">{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card card-padding">
            <h3 className="font-semibold text-xs sm:text-sm mb-3 sm:mb-4" style={{ color: 'var(--text-secondary)' }}>By Severity</h3>
            <div className="space-y-1.5 sm:space-y-2">
              {Object.entries(bySeverity).map(([key, count]) => (
                <div key={key} className="flex justify-between items-center py-0.5 sm:py-1">
                  <span className="text-meta text-xs sm:text-sm">{key}</span>
                  <span className="font-semibold text-sm sm:text-base">{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card card-padding">
            <h3 className="font-semibold text-xs sm:text-sm mb-3 sm:mb-4" style={{ color: 'var(--text-secondary)' }}>By Area</h3>
            <div className="space-y-1.5 sm:space-y-2">
              {Object.entries(byArea).map(([key, count]) => (
                <div key={key} className="flex justify-between items-center py-0.5 sm:py-1">
                  <span className="text-meta text-xs sm:text-sm">{key}</span>
                  <span className="font-semibold text-sm sm:text-base">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
