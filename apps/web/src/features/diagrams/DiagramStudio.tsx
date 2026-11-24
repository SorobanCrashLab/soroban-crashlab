'use client';

import React from 'react';
import { useDiagrams } from './hooks/useDiagrams';
import { MermaidEditor } from './MermaidEditor';
import { DiagramPreview } from './DiagramPreview';
import { AnnotationPanel } from './annotations/AnnotationPanel';
import { DiagramTemplates } from './templates/DiagramTemplates';
import { DiagramExporter } from './exporters/DiagramExporter';

interface DiagramStudioProps {
  diagramId: string;
}

export function DiagramStudio({ diagramId }: DiagramStudioProps) {
  const {
    code,
    setCode,
    theme,
    setTheme,
    diagnostics,
    annotations,
    addAnnotation,
    versions,
    saveVersion,
  } = useDiagrams(diagramId);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold">Mermaid & Architecture Diagramming Studio</h1>
          <p className="text-xs text-zinc-400">
            Diagram ID: <code>{diagramId}</code> • Versions: {versions.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
          >
            Theme: {theme}
          </button>
          <button
            type="button"
            onClick={saveVersion}
            className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
          >
            Save Snapshot
          </button>
          <DiagramExporter code={code} />
        </div>
      </header>

      <DiagramTemplates onSelect={setCode} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MermaidEditor code={code} onChange={setCode} diagnostics={diagnostics} />
        <DiagramPreview code={code} theme={theme} diagnostics={diagnostics} />
      </div>

      <AnnotationPanel annotations={annotations} onAdd={addAnnotation} />
    </div>
  );
}
