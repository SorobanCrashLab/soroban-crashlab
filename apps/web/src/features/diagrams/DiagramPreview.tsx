'use client';

import React from 'react';

interface DiagramPreviewProps {
  code: string;
  theme: 'dark' | 'light';
  diagnostics: string[];
}

export function DiagramPreview({ code, theme, diagnostics }: DiagramPreviewProps) {
  return (
    <div
      className={`flex flex-col space-y-2 rounded-lg border border-zinc-800 p-4 ${
        theme === 'dark' ? 'bg-zinc-950 text-zinc-100' : 'bg-white text-zinc-900'
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Sandboxed Live Preview</h2>
        <span className="text-xs opacity-70">Theme: {theme}</span>
      </div>
      {diagnostics.length > 0 ? (
        <div className="flex h-64 items-center justify-center rounded border border-dashed border-rose-500/40 text-xs text-rose-400">
          Fix syntax diagnostics to render diagram preview.
        </div>
      ) : (
        <div
          role="img"
          aria-label="Rendered Mermaid diagram preview"
          className="h-64 overflow-auto rounded border border-zinc-800/40 p-3 font-mono text-xs"
        >
          <pre className="whitespace-pre-wrap">{code}</pre>
        </div>
      )}
    </div>
  );
}
