'use client';

import React from 'react';

interface MermaidEditorProps {
  code: string;
  onChange: (next: string) => void;
  diagnostics: string[];
}

export function MermaidEditor({ code, onChange, diagnostics }: MermaidEditorProps) {
  return (
    <div className="flex flex-col space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">Mermaid Source</h2>
        <span className="text-xs text-zinc-500">{code.split('\n').length} lines</span>
      </div>
      <textarea
        rows={14}
        value={code}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Mermaid diagram source"
        className="w-full rounded border border-zinc-700 bg-zinc-900 p-3 font-mono text-xs text-emerald-300"
      />
      {diagnostics.length > 0 && (
        <div role="alert" className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-300">
          {diagnostics.map((d, i) => (
            <div key={i}>{d}</div>
          ))}
        </div>
      )}
    </div>
  );
}
