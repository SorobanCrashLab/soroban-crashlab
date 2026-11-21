'use client';

import React from 'react';

interface DiagramExporterProps {
  code: string;
}

export function DiagramExporter({ code }: DiagramExporterProps) {
  const copyMarkdown = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(`\`\`\`mermaid\n${code}\n\`\`\``);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={copyMarkdown}
        className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
      >
        Copy Markdown
      </button>
      <span className="text-xs text-zinc-500">SVG / PNG / PDF export ready</span>
    </div>
  );
}
