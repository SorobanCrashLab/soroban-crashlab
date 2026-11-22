'use client';

import React from 'react';
import { WhiteboardNode } from '../canvas/CanvasEngine';

interface EvidenceNodeCardProps {
  node: WhiteboardNode;
  selected: boolean;
  onSelect: (id: string, multi: boolean) => void;
}

export function EvidenceNodeCard({ node, selected, onSelect }: EvidenceNodeCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${node.kind} node: ${node.title}`}
      aria-pressed={selected}
      onClick={(e) => onSelect(node.id, e.shiftKey)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(node.id, e.shiftKey);
        }
      }}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        minHeight: node.height,
      }}
      className={`absolute cursor-pointer rounded-lg border p-3 text-xs shadow-md transition-colors ${
        selected
          ? 'border-indigo-400 bg-zinc-900 ring-2 ring-indigo-500/40'
          : 'border-zinc-700 bg-zinc-900/90 hover:border-zinc-500'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-zinc-100">{node.title}</span>
        {node.entityRef && (
          <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300">
            {node.entityRef.type}:{node.entityRef.id}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-zinc-400">{node.content}</p>
      {node.entityRef && (
        <div className="mt-2 text-[10px] uppercase tracking-wider text-emerald-400">
          Status: {node.entityRef.status}
        </div>
      )}
    </div>
  );
}
