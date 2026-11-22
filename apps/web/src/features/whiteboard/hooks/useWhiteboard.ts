'use client';

import { useCallback, useState } from 'react';
import { WhiteboardEdge, WhiteboardNode, WhiteboardNodeKind } from '../canvas/CanvasEngine';
import { NODE_REGISTRY } from '../canvas/NodeRegistry';
import { toggleSelection } from '../canvas/SelectionManager';
import { CollaboratorPresence, getInitialPresence, SyncStatus } from '../collaboration/RealtimeSync';

const INITIAL_NODES: WhiteboardNode[] = [
  {
    id: 'node-run-1',
    kind: 'evidence',
    x: 48,
    y: 64,
    width: 240,
    height: 130,
    title: 'Fuzz Run #run-001',
    content: 'Panic triggered at ledger 482190 during token_transfer.',
    entityRef: { type: 'run', id: 'run-001', status: 'crashed' },
    updatedAt: 1700000001,
  },
  {
    id: 'node-note-1',
    kind: 'sticky',
    x: 360,
    y: 96,
    width: 220,
    height: 130,
    title: 'RCA Hypothesis',
    content: 'Unchecked i128 addition when fee_pool approaches max_supply.',
    updatedAt: 1700000002,
  },
];

const INITIAL_EDGES: WhiteboardEdge[] = [
  { id: 'edge-1', fromNodeId: 'node-run-1', toNodeId: 'node-note-1', label: 'root cause' },
];

export function useWhiteboard(boardId: string) {
  const [nodes, setNodes] = useState<WhiteboardNode[]>(INITIAL_NODES);
  const [edges] = useState<WhiteboardEdge[]>(INITIAL_EDGES);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [collaborators] = useState<CollaboratorPresence[]>(getInitialPresence);
  const [syncStatus] = useState<SyncStatus>('connected');

  const selectNode = useCallback((id: string, multi: boolean) => {
    setSelectedIds((prev) => toggleSelection(prev, id, multi));
  }, []);

  const addNode = useCallback((kind: WhiteboardNodeKind) => {
    const def = NODE_REGISTRY[kind];
    setNodes((prev) => [
      ...prev,
      {
        id: `node-${Date.now()}`,
        kind,
        x: 80 + prev.length * 32,
        y: 80 + prev.length * 24,
        width: def.defaultWidth,
        height: def.defaultHeight,
        title: `New ${def.label}`,
        content: 'Double-click to edit details.',
        updatedAt: Date.now(),
      },
    ]);
  }, []);

  return {
    boardId,
    nodes,
    edges,
    selectedIds,
    collaborators,
    syncStatus,
    selectNode,
    addNode,
  };
}
