'use client';

/*
 * Storage Layout Explorer UI (#2327).
 *
 * Presents a decoded keyspace tree, a heatmap table and an access-pattern
 * anomaly list with an accessible text summary. All computation delegates to
 * the pure model so the same data can be exported or rendered elsewhere.
 */
import { useMemo, useState } from 'react';
import {
  analyzeAccessPatterns,
  buildHeatmap,
  buildKeyspaceTree,
  diffSnapshots,
  redactEntry,
  summarizeKeyspace,
  type AccessEvent,
  type HeatMetric,
  type KeyspaceNode,
  type StorageSnapshot,
} from './model';

interface StorageLayoutExplorerProps {
  snapshots: StorageSnapshot[];
  events?: AccessEvent[];
  currentLedger?: number;
}

function TreeRows({ nodes, depth = 0 }: { nodes: KeyspaceNode[]; depth?: number }) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.id}>
          <div
            className="flex items-center gap-2 px-2 py-1 border-b border-slate-800"
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
          >
            <span aria-hidden="true">{node.depth === 0 ? '▾' : '·'}</span>
            <span className="font-mono text-sm">{node.label}</span>
            <span className="text-xs text-slate-400">{node.entryCount} keys</span>
            <span className="text-xs text-slate-400">{node.reads}R/{node.writes}W</span>
          </div>
          {node.children.length > 0 && <TreeRows nodes={node.children} depth={depth + 1} />}
        </div>
      ))}
    </>
  );
}

export function StorageLayoutExplorer({
  snapshots,
  events = [],
  currentLedger = Number.MAX_SAFE_INTEGER,
}: StorageLayoutExplorerProps) {
  const [selectedId, setSelectedId] = useState(snapshots[0]?.id ?? '');
  const [compareId, setCompareId] = useState('');
  const [metric, setMetric] = useState<HeatMetric>('reads');
  const [revealSensitive, setRevealSensitive] = useState(false);

  const selected = snapshots.find((snapshot) => snapshot.id === selectedId) ?? snapshots[0];
  const compare = snapshots.find((snapshot) => snapshot.id === compareId);

  const entries = useMemo(
    () => (selected ? selected.entries.map((entry) => redactEntry(entry, revealSensitive)) : []),
    [selected, revealSensitive],
  );
  const tree = useMemo(() => buildKeyspaceTree(entries), [entries]);
  const heatmap = useMemo(() => buildHeatmap(entries, metric), [entries, metric]);
  const anomalies = useMemo(
    () => analyzeAccessPatterns(entries, events, currentLedger),
    [entries, events, currentLedger],
  );
  const diff = useMemo(
    () => (selected && compare ? diffSnapshots(compare, selected) : []),
    [selected, compare],
  );

  return (
    <section aria-labelledby="storage-explorer-heading" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="storage-snapshot">Snapshot</label>
        <select
          id="storage-snapshot"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1"
        >
          {snapshots.map((snapshot) => (
            <option key={snapshot.id} value={snapshot.id}>
              {snapshot.id} · ledger {snapshot.ledger}
            </option>
          ))}
        </select>
        <label htmlFor="storage-compare">Compare with</label>
        <select
          id="storage-compare"
          value={compareId}
          onChange={(event) => setCompareId(event.target.value)}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1"
        >
          <option value="">None</option>
          {snapshots.filter((snapshot) => snapshot.id !== selectedId).map((snapshot) => (
            <option key={snapshot.id} value={snapshot.id}>{snapshot.id}</option>
          ))}
        </select>
        <label htmlFor="storage-metric">Heat metric</label>
        <select
          id="storage-metric"
          value={metric}
          onChange={(event) => setMetric(event.target.value as HeatMetric)}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1"
        >
          <option value="reads">Reads</option>
          <option value="writes">Writes</option>
          <option value="bytes">Size</option>
          <option value="churn">Churn</option>
        </select>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={revealSensitive}
            onChange={(event) => setRevealSensitive(event.target.checked)}
          />
          Reveal redacted values
        </label>
      </div>

      <p className="text-meta" role="status">{summarizeKeyspace(entries)}</p>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="heading-section">Keyspace tree</h2>
          <div className="rounded border border-slate-800" role="tree" aria-label="Contract keyspace">
            <TreeRows nodes={tree} />
          </div>
        </div>
        <div>
          <h2 className="heading-section">Access heatmap</h2>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Keys ranked by {metric}</caption>
            <thead>
              <tr><th scope="col">Key</th><th scope="col">{metric}</th><th scope="col">Level</th></tr>
            </thead>
            <tbody>
              {heatmap.map((cell) => (
                <tr key={cell.key} className="border-b border-slate-800">
                  <td className="font-mono">{cell.label}</td>
                  <td>{cell.value}</td>
                  <td>{cell.level}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="heading-section">Access-pattern anomalies</h2>
        <ul className="space-y-1">
          {anomalies.map((anomaly, index) => (
            <li key={`${anomaly.key}-${anomaly.kind}-${index}`} className="text-sm">
              <span className="font-mono">{anomaly.key}</span>: {anomaly.detail} ({anomaly.severity})
            </li>
          ))}
          {anomalies.length === 0 && <li className="text-meta">No anomalies detected.</li>}
        </ul>
      </div>

      {compare && (
        <div>
          <h2 className="heading-section">Snapshot diff</h2>
          <table className="w-full text-left text-sm">
            <thead><tr><th scope="col">Key</th><th scope="col">Change</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
            <tbody>
              {diff.filter((row) => row.kind !== 'unchanged').map((row) => (
                <tr key={row.key} className="border-b border-slate-800">
                  <td className="font-mono">{row.key}</td><td>{row.kind}</td>
                  <td>{row.before ?? '—'}</td><td>{row.after ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
