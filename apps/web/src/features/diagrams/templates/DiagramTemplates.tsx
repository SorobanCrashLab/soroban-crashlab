'use client';

import React from 'react';

const TEMPLATES: Array<{ id: string; label: string; code: string }> = [
  {
    id: 'tpl-seq',
    label: 'Contract Call Sequence',
    code: 'sequenceDiagram\n  Caller->>ContractA: invoke()\n  ContractA->>ContractB: cross_call()\n  ContractB-->>Caller: Result',
  },
  {
    id: 'tpl-flow',
    label: 'Failure Flow',
    code: 'flowchart TD\n  Seed[Fuzz Seed] --> Exec[WASM VM]\n  Exec -->|Panic| Triage[Crash Triage]',
  },
  {
    id: 'tpl-state',
    label: 'State Transition',
    code: 'stateDiagram-v2\n  [*] --> Queued\n  Queued --> Running\n  Running --> Crashed',
  },
];

interface DiagramTemplatesProps {
  onSelect: (code: string) => void;
}

export function DiagramTemplates({ onSelect }: DiagramTemplatesProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-zinc-400">Templates:</span>
      {TEMPLATES.map((tpl) => (
        <button
          key={tpl.id}
          type="button"
          onClick={() => onSelect(tpl.code)}
          className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
        >
          {tpl.label}
        </button>
      ))}
    </div>
  );
}
