'use client';

import React from 'react';
import { FaultInjectionConfig, FaultType } from '@/lib/mocks/scenario-runtime';

interface FaultInjectionPanelProps {
  fault: FaultInjectionConfig;
  onChange: (fault: FaultInjectionConfig) => void;
}

export function FaultInjectionPanel({ fault, onChange }: FaultInjectionPanelProps) {
  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
      <h3 className="text-sm font-semibold text-zinc-200">Fault & Latency Injection</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Fault Type</label>
          <select
            value={fault.type}
            onChange={(e) => onChange({ ...fault, type: e.target.value as FaultType })}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
          >
            <option value="none">None</option>
            <option value="timeout">Timeout</option>
            <option value="network_error">Network Error</option>
            <option value="http_500">HTTP 5xx</option>
            <option value="rate_limit">Rate Limit (429)</option>
            <option value="partial_data">Partial Data</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Latency (ms)</label>
          <input
            type="number"
            value={fault.latencyMs}
            onChange={(e) => onChange({ ...fault, latencyMs: Number(e.target.value) || 0 })}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Jitter (ms)</label>
          <input
            type="number"
            value={fault.jitterMs}
            onChange={(e) => onChange({ ...fault, jitterMs: Number(e.target.value) || 0 })}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Failure Rate (0-1)</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="1"
            value={fault.failureRate}
            onChange={(e) => onChange({ ...fault, failureRate: Number(e.target.value) || 0 })}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
          />
        </div>
      </div>
    </div>
  );
}
