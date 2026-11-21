'use client';

import React from 'react';
import { StreamEventStep } from '@/lib/mocks/scenario-runtime';

interface StreamScenarioEditorProps {
  steps: StreamEventStep[];
  onChange: (steps: StreamEventStep[]) => void;
}

export function StreamScenarioEditor({ steps, onChange }: StreamScenarioEditorProps) {
  const addStep = () => {
    onChange([
      ...steps,
      {
        id: `st-${Date.now()}`,
        event: 'message',
        data: '{"status":"ok"}',
        delayMs: 300,
      },
    ]);
  };

  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">SSE Stream Sequence</h3>
        <button
          type="button"
          onClick={addStep}
          className="rounded bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500"
        >
          + Add Event
        </button>
      </div>
      {steps.length === 0 ? (
        <p className="text-xs text-zinc-500">No stream events configured.</p>
      ) : (
        <div className="space-y-2">
          {steps.map((step, idx) => (
            <div key={step.id} className="grid grid-cols-1 gap-2 rounded border border-zinc-800 bg-zinc-900/60 p-2.5 md:grid-cols-4">
              <input
                type="text"
                value={step.event}
                onChange={(e) => {
                  const next = [...steps];
                  next[idx] = { ...step, event: e.target.value };
                  onChange(next);
                }}
                placeholder="event name"
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
              />
              <input
                type="number"
                value={step.delayMs}
                onChange={(e) => {
                  const next = [...steps];
                  next[idx] = { ...step, delayMs: Number(e.target.value) || 0 };
                  onChange(next);
                }}
                placeholder="delay ms"
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
              />
              <input
                type="text"
                value={step.data}
                onChange={(e) => {
                  const next = [...steps];
                  next[idx] = { ...step, data: e.target.value };
                  onChange(next);
                }}
                placeholder="JSON payload"
                className="md:col-span-2 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-emerald-300"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
