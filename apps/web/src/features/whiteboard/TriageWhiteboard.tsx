'use client';

import React, { useState } from 'react';
import { useWhiteboard } from './hooks/useWhiteboard';
import { EdgeRenderer } from './canvas/EdgeRenderer';
import { PresenceLayer } from './collaboration/PresenceLayer';
import { EvidenceNodeCard } from './evidence/EvidenceNodeCards';
import { exportBoardAsMarkdownReport } from './export/WhiteboardExporter';

interface TriageWhiteboardProps {
  boardId: string;
}

export function TriageWhiteboard({ boardId }: TriageWhiteboardProps) {
  const { nodes, edges, selectedIds, collaborators, syncStatus, selectNode, addNode } =
    useWhiteboard(boardId);
  const [exportPreview, setExportPreview] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6 text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold">Collaborative Triage Whiteboard</h1>
          <p className="text-xs text-zinc-400">
            Board: <code>{boardId}</code> • Sync: <span className="text-emerald-400">{syncStatus}</span> •{' '}
            Collaborators: {collaborators.map((c) => c.name).join(', ')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => addNode('evidence')}
            className="rounded bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500"
          >
            + Evidence Node
          </button>
          <button
            type="button"
            onClick={() => addNode('sticky')}
            className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
          >
            + Sticky Note
          </button>
          <button
            type="button"
            onClick={() => setExportPreview(exportBoardAsMarkdownReport(boardId, nodes, edges))}
            className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
          >
            Export Report
          </button>
        </div>
      </header>

      <div
        role="region"
        aria-label="Triage Whiteboard Canvas"
        className="relative h-[480px] w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950"
      >
        <EdgeRenderer nodes={nodes} edges={edges} />
        {nodes.map((node) => (
          <EvidenceNodeCard
            key={node.id}
            node={node}
            selected={selectedIds.includes(node.id)}
            onSelect={selectNode}
          />
        ))}
        <PresenceLayer collaborators={collaborators} />
      </div>

      {exportPreview && (
        <pre className="overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-emerald-300">
          {exportPreview}
        </pre>
      )}
    </div>
  );
}
