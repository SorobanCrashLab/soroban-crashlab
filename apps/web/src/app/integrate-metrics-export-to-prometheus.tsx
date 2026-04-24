'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

/**
 * Issue: Integrate Metrics export to Prometheus
 * 
 * This component provides a dashboard for configuring and monitoring 
 * the export of Soroban CrashLab metrics to a Prometheus instance.
 */

// ---------------------------------------------------------------------------
// Types & Mock Data
// ---------------------------------------------------------------------------

interface MetricPoint {
  time: string;
  value: number;
}

interface ExportConfig {
  endpoint: string;
  interval: number;
  enabled: boolean;
  labels: Record<string, string>;
}

const DEFAULT_CONFIG: ExportConfig = {
  endpoint: 'https://prometheus.internal.crashlab.io/metrics',
  interval: 15, // seconds
  enabled: true,
  labels: {
    env: 'production',
    service: 'soroban-fuzzer',
    region: 'us-east-1'
  }
};

// Generate some initial sparkline data
const generateInitialData = (points: number): MetricPoint[] => {
  return Array.from({ length: points }, (_, i) => ({
    time: `${i}:00`,
    value: Math.floor(Math.random() * 40) + 10
  }));
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusPulse({ active }: { active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex h-3 w-3">
        {active && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        )}
        <span className={`relative inline-flex rounded-full h-3 w-3 ${active ? 'bg-emerald-500' : 'bg-zinc-400'}`}></span>
      </div>
      <span className={`text-xs font-semibold uppercase tracking-wider ${active ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'}`}>
        {active ? 'Live Exporting' : 'Export Paused'}
      </span>
    </div>
  );
}

function MetricCard({ label, value, unit, trend }: { label: string; value: string | number; unit?: string; trend?: 'up' | 'down' | 'stable' }) {
  return (
    <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-tight">{label}</p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value}</span>
        {unit && <span className="text-xs text-zinc-400 dark:text-zinc-500">{unit}</span>}
      </div>
      {trend && (
        <div className={`mt-2 flex items-center gap-1 text-[10px] font-bold uppercase ${
          trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-rose-600' : 'text-zinc-400'
        }`}>
          {trend === 'up' ? '▲ Increasing' : trend === 'down' ? '▼ Decreasing' : '● Stable'}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function MetricsExportToPrometheus() {
  const [config, setConfig] = useState<ExportConfig>(DEFAULT_CONFIG);
  const [latencyData, setLatencyData] = useState<MetricPoint[]>(generateInitialData(20));
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  // Simulate live data updates
  useEffect(() => {
    if (!config.enabled) return;

    const interval = setInterval(() => {
      setLatencyData(prev => {
        const newData = [...prev.slice(1), {
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          value: Math.max(10, Math.min(150, prev[prev.length - 1].value + (Math.random() * 20 - 10)))
        }];
        return newData;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [config.enabled]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    await new Promise(r => setTimeout(r, 1500));
    const success = Math.random() > 0.1;
    setTestResult(success ? 'success' : 'error');
    setIsTesting(false);

    // Clear result after 3s
    setTimeout(() => setTestResult(null), 3000);
  };

  const currentLatency = latencyData[latencyData.length - 1].value.toFixed(1);

  return (
    <section className="w-full space-y-8 p-1">
      {/* Header & Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Prometheus Metrics Integration
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 max-w-2xl">
            Export high-resolution fuzzing performance data, crash signatures, and resource 
            utilization to your centralized observability stack.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusPulse active={config.enabled} />
          <div className="flex gap-2">
            <button
              onClick={() => setConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm ${
                config.enabled 
                ? 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700' 
                : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200 dark:shadow-none'
              }`}
            >
              {config.enabled ? 'Pause Export' : 'Resume Export'}
            </button>
          </div>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Active Exporters" value={1} trend="stable" />
        <MetricCard label="Metrics Scraped" value="1.2k" unit="per min" trend="up" />
        <MetricCard label="Avg Latency" value={currentLatency} unit="ms" trend={parseFloat(currentLatency) > 80 ? 'down' : 'up'} />
        <MetricCard label="Export Uptime" value="99.98" unit="%" trend="stable" />
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Latency Chart */}
        <div className="lg:col-span-2 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Push Latency</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">crashlab_exporter_push_latency_ms</p>
            </div>
            <div className="flex gap-2 text-[10px] uppercase font-bold tracking-widest text-zinc-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> P95</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400"></span> Mean</span>
            </div>
          </div>
          
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={latencyData}>
                <defs>
                  <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.3} />
                <XAxis 
                  dataKey="time" 
                  hide 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  unit="ms"
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    fontSize: '12px'
                  }} 
                />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#6366f1" 
                  fillOpacity={1} 
                  fill="url(#colorLatency)" 
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Configuration Panel */}
        <div className="rounded-[2rem] border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 p-6 flex flex-col">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4">Export Config</h3>
          
          <div className="flex-1 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase">Prometheus Endpoint</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={config.endpoint}
                  onChange={(e) => setConfig(prev => ({ ...prev, endpoint: e.target.value }))}
                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase">Scrape Interval (Seconds)</label>
              <input 
                type="number" 
                value={config.interval}
                onChange={(e) => setConfig(prev => ({ ...prev, interval: parseInt(e.target.value) }))}
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
            </div>

            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-bold text-zinc-500 uppercase">Custom Labels</label>
              <div className="p-3 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl space-y-2">
                {Object.entries(config.labels).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-zinc-500">{key}</span>
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <button 
              onClick={handleTestConnection}
              disabled={isTesting}
              className={`w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all border ${
                testResult === 'success' 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-400' 
                : testResult === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/20 dark:border-rose-800 dark:text-rose-400'
                : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900'
              }`}
            >
              {isTesting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Testing Connection...
                </>
              ) : testResult === 'success' ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Connection Successful
                </>
              ) : testResult === 'error' ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Endpoint Unreachable
                </>
              ) : (
                'Test Connection'
              )}
            </button>
            <button className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 dark:shadow-none">
              Save Changes
            </button>
          </div>
        </div>
      </div>

      {/* Observability Guide */}
      <div className="flex items-start gap-4 p-6 rounded-[2rem] border border-blue-100 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/10">
        <div className="flex-shrink-0 p-3 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-none">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="space-y-2">
          <p className="font-bold text-blue-900 dark:text-blue-200">Scrape Job Configuration</p>
          <p className="text-sm text-blue-800/80 dark:text-blue-300/80 max-w-3xl leading-relaxed">
            To view these metrics in Prometheus, add the following scrape job to your 
            <code className="mx-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 rounded font-mono text-xs">prometheus.yml</code>. 
            Ensure your internal network allows traffic from the Prometheus poller to the CrashLab exporter endpoint.
          </p>
          <pre className="mt-4 p-4 rounded-xl bg-zinc-950 text-emerald-400 text-xs font-mono overflow-x-auto border border-zinc-800">
{`scrape_configs:
  - job_name: 'crashlab_exporter'
    scrape_interval: ${config.interval}s
    static_configs:
      - targets: ['${config.endpoint.replace('https://', '').split('/')[0]}']`}
          </pre>
        </div>
      </div>
    </section>
  );
}
