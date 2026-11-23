'use client';
import { useState } from 'react';
import type { Selection } from '@/lib/xdr/types';
export function RawPane({
  selection,
  total,
  onOffset,
}: {
  selection: Selection | null;
  total: number;
  onOffset: (offset: number) => void;
}) {
  const [offset, setOffset] = useState('0');
  const lines = selection
    ? Array.from({ length: Math.ceil(selection.raw.length / 32) }, (_, i) => ({
        offset: selection.rawStart + i * 16,
        hex:
          selection.raw
            .slice(i * 32, (i + 1) * 32)
            .match(/../g)
            ?.join(' ') ?? '',
      }))
    : [];
  return (
    <section
      aria-labelledby="xdr-raw-heading"
      className="min-w-0 rounded-xl border border-zinc-300 p-4 dark:border-zinc-700"
    >
      <h2 id="xdr-raw-heading" className="text-lg font-semibold">
        Raw bytes
      </h2>
      <form
        className="my-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onOffset(Number(offset));
        }}
      >
        <label className="text-sm">
          Byte offset
          <input
            aria-label="Raw byte offset"
            type="number"
            min={0}
            max={Math.max(0, total - 1)}
            value={offset}
            onChange={(e) => setOffset(e.target.value)}
            className="mt-1 block w-32 rounded border bg-transparent p-2"
          />
        </label>
        <button className="btn-outline" disabled={!total}>
          Select byte
        </button>
      </form>
      {selection && (
        <p className="mb-2 break-all text-xs">
          Selected {selection.row.type}: bytes [{selection.row.start}, {selection.row.end}). Showing
          [{selection.rawStart}, {selection.rawEnd}) of {total}. Click a line to select its node.
        </p>
      )}
      <div
        aria-label="Raw hexadecimal preview"
        className="max-h-[32rem] overflow-auto rounded bg-zinc-950 p-2 font-mono text-xs text-zinc-100"
      >
        {lines.map((line) => (
          <button
            type="button"
            key={line.offset}
            onClick={() => onOffset(line.offset)}
            className={`block whitespace-pre px-1 py-1 text-left ${selection && line.offset < selection.row.end && line.offset + 16 > selection.row.start ? 'bg-blue-900' : 'hover:bg-zinc-800'}`}
          >
            <span className="text-zinc-200">{line.offset.toString(16).padStart(8, '0')} </span>
            {line.hex}
          </button>
        ))}
        {!selection && <p>Decode a payload to inspect its bytes.</p>}
      </div>
      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
        Preview windows are bounded to 1 KiB. Use the offset control to inspect any part of a large
        payload.
      </p>
    </section>
  );
}
