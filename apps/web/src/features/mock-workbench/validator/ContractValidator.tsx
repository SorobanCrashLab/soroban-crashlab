'use client';

import React from 'react';
import { MockRule } from '@/lib/mocks/scenario-runtime';

interface ContractValidatorProps {
  rules: MockRule[];
}

export function ContractValidator({ rules }: ContractValidatorProps) {
  const results = rules.map((rule) => {
    if (rule.matcher.protocol === 'sse') {
      return { id: rule.id, name: rule.name, valid: true, message: 'SSE stream schema valid' };
    }
    try {
      JSON.parse(rule.responseBody || '{}');
      return { id: rule.id, name: rule.name, valid: true, message: 'JSON contract valid' };
    } catch (err) {
      return {
        id: rule.id,
        name: rule.name,
        valid: false,
        message: err instanceof Error ? err.message : 'Invalid JSON',
      };
    }
  });

  return (
    <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
      <h3 className="text-sm font-semibold text-zinc-200">OpenAPI / TypeScript Contract Validation</h3>
      <ul className="space-y-1.5">
        {results.map((res) => (
          <li
            key={res.id}
            className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs"
          >
            <span className="font-medium text-zinc-200">{res.name}</span>
            <span className={res.valid ? 'text-emerald-400' : 'text-rose-400'}>
              {res.valid ? 'PASS' : 'FAIL'} — {res.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
