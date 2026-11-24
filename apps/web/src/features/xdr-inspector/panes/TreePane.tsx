'use client';
import type { KeyboardEvent } from 'react';
import { PAGE_SIZE, type TreeRow } from '@/lib/xdr/types';
interface Props {
  rows: TreeRow[];
  total: number;
  start: number;
  selected: string;
  expanded: Set<string>;
  query: string;
  busy: boolean;
  onQuery: (value: string) => void;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  onPage: (start: number) => void;
}
export function TreePane({
  rows,
  total,
  start,
  selected,
  expanded,
  query,
  busy,
  onQuery,
  onSelect,
  onToggle,
  onPage,
}: Props) {
  function navigate(event: KeyboardEvent<HTMLButtonElement>, row: TreeRow) {
    const items = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="treeitem"]') ??
        [],
    );
    const index = items.indexOf(event.currentTarget);
    let target: number | undefined;
    if (event.key === 'ArrowDown') target = Math.min(items.length - 1, index + 1);
    if (event.key === 'ArrowUp') target = Math.max(0, index - 1);
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = items.length - 1;
    if (event.key === 'ArrowRight' && row.children && !expanded.has(row.path)) {
      event.preventDefault();
      onToggle(row.path);
    }
    if (event.key === 'ArrowLeft' && row.children && expanded.has(row.path)) {
      event.preventDefault();
      onToggle(row.path);
    }
    if (target !== undefined) {
      event.preventDefault();
      items[target]?.focus();
      if (rows[target]) onSelect(rows[target].path);
    }
  }
  return (
    <section
      aria-labelledby="xdr-tree-heading"
      className="min-w-0 rounded-xl border border-zinc-300 p-4 dark:border-zinc-700"
    >
      <h2 id="xdr-tree-heading" className="text-lg font-semibold">
        Structured tree
      </h2>
      <label className="mt-3 block text-sm">
        Search names, types, paths or previews
        <input
          aria-label="Search XDR tree"
          maxLength={256}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          className="mt-1 w-full rounded border bg-transparent p-2"
        />
      </label>
      <p id="xdr-tree-help" className="my-2 text-xs text-zinc-600 dark:text-zinc-300">
        Arrow keys navigate. Right/left expands/collapses. Double-click a container to toggle it.
      </p>
      <button
        type="button"
        className="btn-outline mb-2 text-sm"
        disabled={!rows.some((row) => row.path === selected && row.children) || busy}
        onClick={() => onToggle(selected)}
      >
        Toggle selected container
      </button>
      <div
        role="tree"
        aria-label="XDR payload"
        aria-describedby="xdr-tree-help"
        className="max-h-[32rem] overflow-auto rounded border border-zinc-200 dark:border-zinc-800"
      >
        {rows.map((row, i) => (
          <button
            key={row.path}
            type="button"
            role="treeitem"
            aria-level={row.depth + 1}
            aria-selected={selected === row.path}
            aria-expanded={row.children ? expanded.has(row.path) : undefined}
            aria-posinset={start + i + 1}
            aria-setsize={total}
            tabIndex={
              row.path === selected || (!rows.some((item) => item.path === selected) && i === 0)
                ? 0
                : -1
            }
            onClick={() => onSelect(row.path)}
            onDoubleClick={() => row.children && onToggle(row.path)}
            onKeyDown={(e) => navigate(e, row)}
            className={`block w-full border-b border-zinc-200 px-2 py-2 text-left text-xs dark:border-zinc-800 ${selected === row.path ? 'bg-blue-100 text-blue-950 dark:bg-blue-950 dark:text-blue-100' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
            style={{ paddingLeft: Math.min(row.depth, 12) * 12 + 8 }}
          >
            <span aria-hidden="true">
              {row.children ? (expanded.has(row.path) ? '- ' : '+ ') : '. '}
            </span>
            <strong>{row.label}</strong>{' '}
            <span className="text-zinc-600 dark:text-zinc-300">{row.type}</span>
            <span className="block truncate font-mono">{row.preview}</span>
          </button>
        ))}
        {!rows.length && <p className="p-3 text-sm">No matching nodes.</p>}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-sm">
        <button
          type="button"
          className="btn-outline"
          disabled={start === 0 || busy}
          onClick={() => onPage(Math.max(0, start - PAGE_SIZE))}
        >
          Previous nodes
        </button>
        <span>
          {total ? `${start + 1}-${Math.min(start + PAGE_SIZE, total)} / ${total}` : '0 nodes'}
        </span>
        <button
          type="button"
          className="btn-outline"
          disabled={start + PAGE_SIZE >= total || busy}
          onClick={() => onPage(start + PAGE_SIZE)}
        >
          Next nodes
        </button>
      </div>
    </section>
  );
}
