'use client';

import React from 'react';
import { MockRule, ProtocolType } from '@/lib/mocks/scenario-runtime';

interface EndpointRuleEditorProps {
  rule: MockRule;
  onChange: (updated: MockRule) => void;
}

export function EndpointRuleEditor({ rule, onChange }: EndpointRuleEditorProps) {
  return (
    <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="flex items-center justify-between">
        <input
          type="text"
          value={rule.name}
          onChange={(e) => onChange({ ...rule, name: e.target.value })}
          aria-label="Rule name"
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-100"
        />
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={(e) => onChange({ ...rule, enabled: e.target.checked })}
          />
          Enabled
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Protocol</label>
          <select
            value={rule.matcher.protocol}
            onChange={(e) =>
              onChange({
                ...rule,
                matcher: { ...rule.matcher, protocol: e.target.value as ProtocolType },
              })
            }
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100"
          >
            <option value="rest">REST</option>
            <option value="sse">SSE Stream</option>
            <option value="rpc">Soroban RPC</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-400">Path Pattern</label>
          <input
            type="text"
            value={rule.matcher.pathPattern}
            onChange={(e) =>
              onChange({
                ...rule,
                matcher: { ...rule.matcher, pathPattern: e.target.value },
              })
            }
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-sm text-zinc-100"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-400">HTTP Status</label>
          <input
            type="number"
            value={rule.statusCode}
            onChange={(e) => onChange({ ...rule, statusCode: Number(e.target.value) || 200 })}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-400">Response Body (JSON)</label>
        <textarea
          rows={6}
          value={rule.responseBody}
          onChange={(e) => onChange({ ...rule, responseBody: e.target.value })}
          className="w-full rounded border border-zinc-700 bg-zinc-900 p-2.5 font-mono text-xs text-emerald-300"
        />
      </div>
    </div>
  );
}
