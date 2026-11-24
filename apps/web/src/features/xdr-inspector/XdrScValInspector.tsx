'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_EDITOR_BYTES,
  PAGE_SIZE,
  ROOT_TYPES,
  type InputFormat,
  type Inspection,
  type InspectorSchema,
  type RootType,
  type Selection,
  type TreeRow,
} from '@/lib/xdr/types';
import { useXdrInspector } from './hooks/useXdrInspector';
import { TreePane } from './panes/TreePane';
import { RawPane } from './panes/RawPane';
import { DiffPane, type DiffResult } from './panes/DiffPane';
import { SchemaForm } from './editor/SchemaForm';
import type { InspectorCommand } from './workers/protocol';
interface Props {
  context?: string;
  initialPayload?: string;
  onExport?: (blob: Blob, filename: string) => void;
}
interface LoadResult {
  inspection: Inspection;
  selection: Selection;
  warning?: string;
}
function ancestors(path: string): string[] {
  const parts = path.split('/');
  return parts
    .map((_, i) => parts.slice(0, i).join('/'))
    .filter((value, i, array) => array.indexOf(value) === i);
}
const inputClass =
  'mt-1 w-full rounded border border-zinc-300 bg-transparent p-2 text-sm dark:border-zinc-700';
export default function XdrScValInspector({
  context,
  initialPayload = 'AAAAAwAAAAc=',
  onExport,
}: Props) {
  const { request, busy, cancel } = useXdrInspector();
  const [rootType, setRootType] = useState<RootType>('ScVal');
  const [format, setFormat] = useState<InputFormat>('base64');
  const [input, setInput] = useState(initialPayload);
  const [file, setFile] = useState<File | null>(null);
  const [comparison, setComparison] = useState('');
  const [comparisonFile, setComparisonFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [rows, setRows] = useState<TreeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [start, setStart] = useState(0);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(new Set<string>(['']));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [schemaText, setSchemaText] = useState('');
  const [schema, setSchema] = useState<InspectorSchema | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [hasComparison, setHasComparison] = useState(false);
  const [redact, setRedact] = useState(true);
  const [exportFormat, setExportFormat] = useState<'json' | 'hex' | 'base64' | 'fixture'>('json');
  const initialPath = useRef('');
  useEffect(() => {
    initialPath.current = new URLSearchParams(location.hash.slice(1)).get('node') ?? '';
  }, []);
  const run = useCallback((task: () => Promise<void>) => {
    setError('');
    setNotice('');
    void task().catch((reason) =>
      setError(reason instanceof Error ? reason.message : 'Inspector operation failed'),
    );
  }, []);
  useEffect(() => {
    if (!inspection?.nodes) return;
    let active = true;
    void request<{ rows: TreeRow[]; total: number; start: number }>({
      op: 'page',
      query,
      expanded: [...expanded],
      start,
      count: PAGE_SIZE,
    })
      .then((page) => {
        if (active) {
          setRows(page.rows);
          setTotal(page.total);
        }
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Cannot load tree page');
      });
    return () => {
      active = false;
    };
  }, [request, inspection?.revision, inspection?.nodes, query, expanded, start]);
  const pick = useCallback(
    async (path: string) => {
      const next = await request<Selection>({ op: 'select', path });
      setSelection(next);
      setExpanded((previous) => {
        const wanted = ancestors(path);
        if (wanted.every((value) => previous.has(value))) return previous;
        return new Set([...previous, ...wanted]);
      });
    },
    [request],
  );
  async function apply(command: InspectorCommand) {
    const next = await request<Inspection>(command);
    setInspection(next);
    setDiff(null);
    setStart(0);
    try {
      await pick(selection?.row.path ?? '');
    } catch {
      await pick('');
    }
    setNotice('Edit accepted. SDK decode / encode / decode verification passed.');
  }
  async function load() {
    const result = await request<LoadResult>({
      op: 'load',
      slot: 'left',
      rootType,
      format,
      input: file ?? input,
    });
    setInspection(result.inspection);
    setSelection(result.selection);
    setRows([]);
    setTotal(0);
    setStart(0);
    setQuery('');
    setExpanded(new Set(['']));
    setSchema(null);
    setDiff(null);
    if (result.warning) setError(result.warning);
    else setNotice('Payload decoded locally. Select a node to inspect or edit it.');
    if (initialPath.current && result.inspection.nodes) {
      const path = initialPath.current;
      initialPath.current = '';
      await pick(path);
    }
  }
  async function download() {
    const result = await request<{ blob: Blob; filename: string }>({
      op: 'export',
      format: exportFormat,
      redact,
    });
    if (onExport) onExport(result.blob, result.filename);
    else {
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    setNotice(
      redact
        ? 'Redacted evidence exported; it is not an exact reproducer.'
        : 'Exact payload exported, including all original values.',
    );
  }
  function toggle(path: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    setStart(0);
  }
  async function copy(value: string) {
    if (!navigator.clipboard) throw new Error('Clipboard is unavailable; use the displayed path');
    await navigator.clipboard.writeText(value);
    setNotice('Copied.');
  }
  return (
    <div data-testid="xdr-inspector" className="space-y-5 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-2xl font-bold">XDR / ScVal Inspector</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Decode, inspect, edit and compare Soroban payloads. Processing stays in a local Web
          Worker.
        </p>
        {context && <p className="mt-1 break-all text-xs">Context: {context}</p>}
      </header>
      <section
        aria-label="Payload input"
        className="rounded-xl border border-zinc-300 p-4 dark:border-zinc-700"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            XDR root type
            <select
              aria-label="XDR root type"
              value={rootType}
              onChange={(e) => setRootType(e.target.value as RootType)}
              className={inputClass}
            >
              {ROOT_TYPES.map((type) => (
                <option key={type} className="bg-[var(--surface)]">
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Input encoding
            <select
              aria-label="Input encoding"
              value={format}
              onChange={(e) => setFormat(e.target.value as InputFormat)}
              className={inputClass}
            >
              {(['base64', 'hex', 'json'] as const).map((value) => (
                <option key={value} className="bg-[var(--surface)]">
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-3 block text-sm">
          Payload A
          <textarea
            aria-label="Payload A"
            value={input}
            maxLength={MAX_EDITOR_BYTES}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            spellCheck={false}
            className={`${inputClass} font-mono text-xs`}
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-sm">
            Import A from file
            <input
              aria-label="Import payload A"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="ml-2 max-w-64 text-xs"
            />
          </label>
          {file && (
            <button type="button" className="underline text-sm" onClick={() => setFile(null)}>
              Use text instead of {file.name}
            </button>
          )}
          <button type="button" className="btn-outline" disabled={busy} onClick={() => run(load)}>
            Decode A
          </button>
          <button
            type="button"
            className="btn-outline"
            disabled={!busy}
            onClick={() => {
              cancel();
              setInspection(null);
              setSelection(null);
              setRows([]);
              setSchema(null);
              setDiff(null);
              setHasComparison(false);
              setNotice('Worker terminated. Decode a payload to start a new session.');
            }}
          >
            Cancel / reset worker
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
          Up to 5 MiB decoded XDR. Paste is limited to 64 KiB; use a file for larger
          hex/base64/JSON. Unknown wire variants retain a read-only raw preview.
        </p>
      </section>
      <div aria-live="polite" aria-atomic="true" className="text-sm">
        {busy ? 'Working in the inspector worker...' : notice}
      </div>
      {error && (
        <div
          role="alert"
          className="break-words rounded border border-red-500 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100"
        >
          {error}
        </div>
      )}
      {inspection && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              {inspection.rootType} | {inspection.bytes.toLocaleString()} bytes |{' '}
              {inspection.nodes.toLocaleString()} nodes
            </span>
            <span>
              {inspection.canonical
                ? 'Canonical wire encoding'
                : 'Original encoding differs or is unsupported; review raw bytes'}
            </span>
            <button
              type="button"
              className="underline"
              onClick={() => run(() => copy(selection?.row.path ?? ''))}
            >
              Copy node path
            </button>
            <button
              type="button"
              className="underline"
              onClick={() =>
                run(async () => {
                  const url = new URL(location.href);
                  url.hash = new URLSearchParams({ node: selection?.row.path ?? '' }).toString();
                  await copy(url.toString());
                })
              }
            >
              Copy bookmark link
            </button>
          </div>
          <p className="break-all font-mono text-xs">Path: {selection?.row.path || '(root)'}</p>
          <div className="grid gap-4 lg:grid-cols-2">
            {inspection.nodes > 0 ? (
              <TreePane
                rows={rows}
                total={total}
                start={start}
                selected={selection?.row.path ?? ''}
                expanded={expanded}
                query={query}
                busy={busy}
                onQuery={(value) => {
                  setQuery(value);
                  setStart(0);
                }}
                onSelect={(path) => run(() => pick(path))}
                onToggle={toggle}
                onPage={setStart}
              />
            ) : (
              <div className="rounded border p-4 text-sm">
                Generic raw fallback: this root/variant cannot be decoded by the installed SDK.
                Editing and structured export are unavailable.
              </div>
            )}
            <RawPane
              selection={selection}
              total={inspection.bytes}
              onOffset={(offset) =>
                run(async () => {
                  const value = await request<Selection>({ op: 'offset', offset });
                  setSelection(value);
                  setExpanded((previous) => new Set([...previous, ...ancestors(value.row.path)]));
                })
              }
            />
          </div>
          {selection && inspection.nodes > 0 && (
            <SchemaForm
              key={`${inspection.revision}:${selection.row.path}`}
              selection={selection}
              busy={busy}
              schema={schema?.fields.find((field) => field.path === selection.row.path)}
              onApply={(json) => run(() => apply({ op: 'edit', path: selection.row.path, json }))}
              onVariant={(value) =>
                run(() => apply({ op: 'variant', path: selection.row.path, value }))
              }
              onArray={(action, index) =>
                run(() => apply({ op: 'array', path: selection.row.path, action, index }))
              }
              onOption={(present) =>
                run(() => apply({ op: 'option', path: selection.row.path, present }))
              }
            />
          )}
          <details className="rounded-xl border border-zinc-300 p-4 dark:border-zinc-700">
            <summary className="cursor-pointer font-semibold">
              Contract spec / ABI annotations
            </summary>
            <p className="my-2 text-sm">
              Import version 1 path metadata, or{' '}
              {`{ "spec": ["base64 ScSpecEntry", ...], "name": "function or struct" }`}. Function
              arguments are a ScVal vector; named structs are ScVal maps. Unsupported schema
              semantics retain the generic XDR view.
            </p>
            <label className="text-sm">
              Schema JSON
              <textarea
                aria-label="Schema JSON"
                rows={4}
                maxLength={262144}
                value={schemaText}
                onChange={(e) => setSchemaText(e.target.value)}
                className={`${inputClass} font-mono text-xs`}
              />
            </label>
            <button
              type="button"
              className="btn-outline mt-2"
              disabled={busy || !inspection.nodes}
              onClick={() =>
                run(async () => {
                  const next = await request<InspectorSchema>({ op: 'schema', text: schemaText });
                  setSchema(next);
                  setExpanded((previous) => new Set(previous));
                  setNotice(`${next.fields.length} schema field constraints attached.`);
                })
              }
            >
              Attach schema
            </button>
          </details>
          <section className="rounded-xl border border-zinc-300 p-4 dark:border-zinc-700">
            <h2 className="text-lg font-semibold">Compare with payload B</h2>
            <label className="mt-2 block text-sm">
              Payload B
              <textarea
                aria-label="Payload B"
                rows={2}
                maxLength={MAX_EDITOR_BYTES}
                value={comparison}
                onChange={(e) => setComparison(e.target.value)}
                className={`${inputClass} font-mono text-xs`}
              />
            </label>
            <label className="mt-2 block text-sm">
              Import B from file
              <input
                aria-label="Import payload B"
                type="file"
                className="ml-2 max-w-64 text-xs"
                onChange={(e) => setComparisonFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-3">
              {comparisonFile && (
                <button
                  type="button"
                  className="underline text-sm"
                  onClick={() => setComparisonFile(null)}
                >
                  Use B text instead
                </button>
              )}
              <button
                type="button"
                className="btn-outline"
                disabled={busy || !inspection.nodes}
                onClick={() =>
                  run(async () => {
                    await request({
                      op: 'load',
                      slot: 'right',
                      input: comparisonFile ?? comparison,
                      format,
                      rootType,
                    });
                    setHasComparison(true);
                    setDiff(await request<DiffResult>({ op: 'diff' }));
                  })
                }
              >
                Load B and compare
              </button>
              <button
                type="button"
                className="btn-outline"
                disabled={busy || !hasComparison || !inspection.nodes}
                onClick={() => run(async () => setDiff(await request<DiffResult>({ op: 'diff' })))}
              >
                Refresh diff
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
              B uses the selected root type and input encoding above. Raw and structural changes are
              computed in the worker.
            </p>
          </section>
          <DiffPane result={diff} onSelect={(path) => run(() => pick(path))} />
          <section className="rounded-xl border border-zinc-300 p-4 dark:border-zinc-700">
            <h2 className="text-lg font-semibold">Export / reproducer fixture</h2>
            <label className="my-3 block text-sm">
              <input
                type="checkbox"
                checked={redact}
                onChange={(e) => {
                  setRedact(e.target.checked);
                  if (e.target.checked && (exportFormat === 'hex' || exportFormat === 'base64'))
                    setExportFormat('json');
                }}
              />{' '}
              Redact every payload leaf value (default)
            </label>
            <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-300">
              Redacted JSON/fixtures are evidence only and cannot be imported as exact reproducers.
              Exact hex/base64/fixtures contain all values; review them before sharing. Bookmark
              links contain context and node paths, never payloads.
            </p>
            <label className="mr-3 text-sm">
              Format
              <select
                aria-label="Export format"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as typeof exportFormat)}
                className="ml-2 rounded border bg-[var(--surface)] p-2"
              >
                <option value="json">JSON fixture</option>
                <option value="fixture">TypeScript fixture</option>
                <option value="hex" disabled={redact}>
                  hex
                </option>
                <option value="base64" disabled={redact}>
                  base64
                </option>
              </select>
            </label>
            <button
              type="button"
              className="btn-outline"
              disabled={busy}
              onClick={() => run(download)}
            >
              Export payload
            </button>
          </section>
        </>
      )}
    </div>
  );
}
