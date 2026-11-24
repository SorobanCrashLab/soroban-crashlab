'use client';
import { useState } from 'react';
import type { Selection, XdrNode, SchemaField } from '@/lib/xdr/types';
interface Props {
  selection: Selection;
  busy: boolean;
  schema?: SchemaField;
  onApply: (json: string) => void;
  onVariant: (value: string) => void;
  onArray: (action: 'add' | 'remove', index?: number) => void;
  onOption: (present: boolean) => void;
}
export function SchemaForm({
  selection,
  busy,
  schema,
  onApply,
  onVariant,
  onArray,
  onOption,
}: Props) {
  const [draft, setDraft] = useState(selection.editor ?? '');
  const [index, setIndex] = useState('0');
  const node: XdrNode | null = selection.editor ? (JSON.parse(selection.editor) as XdrNode) : null;
  return (
    <section
      aria-labelledby="xdr-editor-heading"
      className="rounded-xl border border-zinc-300 p-4 dark:border-zinc-700"
    >
      <h2 id="xdr-editor-heading" className="text-lg font-semibold">
        Edit and verify
      </h2>
      <p className="my-2 break-all font-mono text-xs">
        {selection.row.path || '(root)'} | {selection.row.type}
      </p>
      {schema && (
        <p className="mb-3 text-sm">
          <strong>{schema.label}</strong>
          {schema.expectedType ? ` | expected ${schema.expectedType}` : ''}
          {schema.description ? ` | ${schema.description}` : ''}
        </p>
      )}
      {selection.choices.length > 0 && (
        <label className="mb-3 block text-sm">
          Enum / union variant
          <select
            aria-label="Enum or union variant"
            disabled={busy}
            value={
              node?.kind === 'union' ? String(node.switch) : node?.kind === 'enum' ? node.value : ''
            }
            onChange={(e) => onVariant(e.target.value)}
            className="ml-2 rounded border bg-[var(--surface)] p-2"
          >
            {selection.choices.map((choice) => (
              <option key={String(choice)} value={String(choice)}>
                {choice}
              </option>
            ))}
          </select>
        </label>
      )}
      {node?.kind === 'option' && (
        <label className="mb-3 block text-sm">
          <input
            type="checkbox"
            checked={node.value !== null}
            disabled={busy}
            onChange={(e) => onOption(e.target.checked)}
          />{' '}
          Optional value present
        </label>
      )}
      {node?.kind === 'array' && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            className="btn-outline"
            disabled={busy}
            onClick={() => onArray('add')}
          >
            Add element
          </button>
          <label>
            Index
            <input
              type="number"
              min={0}
              value={index}
              onChange={(e) => setIndex(e.target.value)}
              className="ml-2 w-20 rounded border bg-transparent p-2"
            />
          </label>
          <button
            type="button"
            className="btn-outline"
            disabled={busy || !node.items.length}
            onClick={() => onArray('remove', Number(index))}
          >
            Remove element
          </button>
        </div>
      )}
      {selection.editor === null ? (
        <p className="text-sm">
          This subtree exceeds the 64 KiB editor limit. Expand it and select a smaller child;
          inspection and exports remain available.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onApply(draft);
          }}
        >
          <label className="block text-sm">
            Typed node JSON
            <textarea
              aria-label="Typed node JSON"
              spellCheck={false}
              value={draft}
              maxLength={65536}
              onChange={(e) => setDraft(e.target.value)}
              rows={10}
              className="mt-1 w-full rounded border bg-transparent p-3 font-mono text-xs"
            />
          </label>
          <p className="my-2 text-xs text-zinc-600 dark:text-zinc-300">
            64-bit integer parts use decimal strings; bytes use hex. SDK bounds, exact struct fields
            and attached schema constraints are checked before committing. Invalid edits leave the
            payload unchanged.
          </p>
          <button className="btn-outline" disabled={busy}>
            Validate and re-encode
          </button>
        </form>
      )}
    </section>
  );
}
