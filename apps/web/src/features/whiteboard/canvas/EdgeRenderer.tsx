'use client';

import React from 'react';
import { WhiteboardEdge, WhiteboardNode } from './CanvasEngine';

interface EdgeRendererProps {
  nodes: WhiteboardNode[];
  edges: WhiteboardEdge[];
}

export function EdgeRenderer({ nodes, edges }: EdgeRendererProps) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      {edges.map((edge) => {
        const from = nodeMap.get(edge.fromNodeId);
        const to = nodeMap.get(edge.toNodeId);
        if (!from || !to) return null;
        const x1 = from.x + from.width / 2;
        const y1 = from.y + from.height / 2;
        const x2 = to.x + to.width / 2;
        const y2 = to.y + to.height / 2;
        return (
          <g key={edge.id}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#6366f1" strokeWidth={2} />
            {edge.label && (
              <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} fill="#a5b4fc" fontSize={11}>
                {edge.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
