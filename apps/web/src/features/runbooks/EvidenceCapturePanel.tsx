"use client";

import { useState } from 'react';
import type { EvidenceItem, EvidenceKind } from './model';

const KINDS: EvidenceKind[] = ['log', 'trace', 'diff', 'artifact', 'screenshot', 'note'];

export default function EvidenceCapturePanel({
  evidence,
  required,
  onAdd,
}: {
  evidence: EvidenceItem[];
  required: EvidenceKind[];
  onAdd: (item: { kind: EvidenceKind; label: string; ref: string }) => void;
}) {
  const [kind, setKind] = useState<EvidenceKind>(required[0] ?? 'note');
  const [label, setLabel] = useState('');
  const [ref, setRef] = useState('');
  const have = new Set(evidence.map((e) => e.kind));

  return (
    <section aria-label="Evidence" className="space-y-2">
      {required.length > 0 && (
        <p className="text-xs text-zinc-600 dark:text-zinc-300">
          Required:{' '}
          {required.map((k) => (
            <span key={k} className={`mr-1 rounded px-1.5 py-0.5 ${have.has(k) ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100' : 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'}`}>
              {k} {have.has(k) ? '✓' : '(missing)'}
            </span>
          ))}
        </p>
      )}
      <ul className="space-y-1 text-xs">
        {evidence.map((e) => (
          <li key={e.id} className="rounded border border-zinc-200 px-2 py-1 dark:border-zinc-800">
            <span className="font-semibold">{e.kind}</span> · {e.label} <span className="text-zinc-500">({e.ref})</span>
          </li>
        ))}
        {evidence.length === 0 && <li className="text-zinc-500">No evidence attached yet.</li>}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2 text-xs"
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          onAdd({ kind, label: label.trim(), ref: ref.trim() });
          setLabel('');
          setRef('');
        }}
      >
        <label className="flex flex-col gap-1">
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value as EvidenceKind)} className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700">
            {KINDS.map((k) => (<option key={k} value={k}>{k}</option>))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} required className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" />
        </label>
        <label className="flex flex-col gap-1">
          Link / reference
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="run-1234 or URL" className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" />
        </label>
        <button type="submit" className="rounded bg-zinc-900 px-3 py-1.5 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900">Attach</button>
      </form>
    </section>
  );
}
