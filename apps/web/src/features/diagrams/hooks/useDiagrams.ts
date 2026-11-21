'use client';

import { useCallback, useMemo, useState } from 'react';

export interface DiagramAnnotation {
  id: string;
  nodeId: string;
  entityType: 'run' | 'trace' | 'log' | 'issue';
  entityId: string;
  label: string;
}

export interface DiagramVersion {
  id: string;
  version: number;
  code: string;
  createdAt: string;
  author: string;
}

const DEFAULT_MERMAID = `sequenceDiagram
  participant Client
  participant SorobanRPC
  participant Contract
  Client->>SorobanRPC: simulateTransaction(tx)
  SorobanRPC->>Contract: invoke(fn, args)
  Contract-->>SorobanRPC: panic: arithmetic overflow
  SorobanRPC-->>Client: HostError(0x01)`;

export function useDiagrams(diagramId: string) {
  const [code, setCode] = useState<string>(DEFAULT_MERMAID);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [annotations, setAnnotations] = useState<DiagramAnnotation[]>([
    {
      id: 'ann-1',
      nodeId: 'Contract',
      entityType: 'run',
      entityId: 'run-001',
      label: 'Overflow repro in run-001',
    },
  ]);
  const [versions, setVersions] = useState<DiagramVersion[]>([
    {
      id: 'v-1',
      version: 1,
      code: DEFAULT_MERMAID,
      createdAt: '2026-11-21T10:00:00Z',
      author: '@engineer',
    },
  ]);

  const diagnostics = useMemo(() => {
    const trimmed = code.trim();
    if (!trimmed) return ['Diagram source is empty.'];
    const validHeaders = ['sequenceDiagram', 'flowchart', 'graph', 'stateDiagram', 'erDiagram'];
    const hasHeader = validHeaders.some((h) => trimmed.startsWith(h));
    return hasHeader ? [] : ['Diagram must start with a valid Mermaid header (e.g. sequenceDiagram, flowchart).'];
  }, [code]);

  const addAnnotation = useCallback((ann: Omit<DiagramAnnotation, 'id'>) => {
    setAnnotations((prev) => [...prev, { ...ann, id: `ann-${Date.now()}` }]);
  }, []);

  const saveVersion = useCallback(() => {
    setVersions((prev) => [
      {
        id: `v-${prev.length + 1}`,
        version: prev.length + 1,
        code,
        createdAt: new Date().toISOString(),
        author: '@engineer',
      },
      ...prev,
    ]);
  }, [code]);

  return {
    diagramId,
    code,
    setCode,
    theme,
    setTheme,
    diagnostics,
    annotations,
    addAnnotation,
    versions,
    saveVersion,
  };
}
