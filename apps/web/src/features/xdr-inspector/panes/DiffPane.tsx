'use client';
import type { Change } from '@/lib/xdr/types';
export interface DiffResult {
  changes: Change[];
  truncated: boolean;
  raw: {
    differentBytes: number;
    firstOffset: number | null;
    leftBytes: number;
    rightBytes: number;
  };
  rootTypesMatch: boolean;
}
export function DiffPane({
  result,
  onSelect,
}: {
  result: DiffResult | null;
  onSelect: (path: string) => void;
}) {
  if (!result) return null;
  return (
    <section
      aria-labelledby="xdr-diff-heading"
      className="rounded-xl border border-zinc-300 p-4 dark:border-zinc-700"
    >
      <h2 id="xdr-diff-heading" className="text-lg font-semibold">
        Payload diff
      </h2>
      <p className="my-2 text-sm">
        {result.raw.differentBytes} differing byte positions; first difference:{' '}
        {result.raw.firstOffset ?? 'none'}. A: {result.raw.leftBytes} bytes, B:{' '}
        {result.raw.rightBytes} bytes.
      </p>
      {!result.rootTypesMatch && (
        <p role="status" className="text-amber-700 dark:text-amber-300">
          The payload root types differ.
        </p>
      )}
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Deterministic structural changes from A to B</caption>
          <thead>
            <tr>
              <th>Change</th>
              <th>Path</th>
              <th>A</th>
              <th>B</th>
            </tr>
          </thead>
          <tbody>
            {result.changes.map((change, i) => (
              <tr
                key={`${change.path}:${i}`}
                className="border-t border-zinc-200 dark:border-zinc-800"
              >
                <td className="p-2">{change.kind}</td>
                <td className="max-w-64 break-all p-2">
                  {change.kind === 'added' ? (
                    change.path || '(root)'
                  ) : (
                    <button
                      type="button"
                      className="underline"
                      onClick={() => onSelect(change.path)}
                    >
                      {change.path || '(root)'}
                    </button>
                  )}
                </td>
                <td className="max-w-48 break-all p-2">{change.before ?? '?'}</td>
                <td className="max-w-48 break-all p-2">{change.after ?? '?'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!result.changes.length && <p className="p-2 text-sm">No structural differences.</p>}
      </div>
      {result.truncated && (
        <p role="status" className="mt-2 text-sm">
          Showing the first 2,000 changes. Narrow the payloads to inspect the remainder.
        </p>
      )}
    </section>
  );
}
