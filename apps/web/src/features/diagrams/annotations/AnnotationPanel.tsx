'use client';

import React from 'react';
import { DiagramAnnotation } from '../hooks/useDiagrams';

interface AnnotationPanelProps {
  annotations: DiagramAnnotation[];
  onAdd: (ann: Omit<DiagramAnnotation, 'id'>) => void;
}

export function AnnotationPanel({ annotations, onAdd }: AnnotationPanelProps) {
  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">Evidence Annotations</h3>
        <button
          type="button"
          onClick={() =>
            onAdd({
              nodeId: 'SorobanRPC',
              entityType: 'trace',
              entityId: 'tr-991',
              label: 'Linked trace span',
            })
          }
          className="rounded bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500"
        >
          + Link Evidence
        </button>
      </div>
      <ul className="space-y-1.5 text-xs">
        {annotations.map((ann) => (
          <li key={ann.id} className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2">
            <span>
              <strong className="text-indigo-300">{ann.nodeId}</strong> → {ann.label}
            </span>
            <span className="font-mono text-zinc-400">
              {ann.entityType}:{ann.entityId}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
