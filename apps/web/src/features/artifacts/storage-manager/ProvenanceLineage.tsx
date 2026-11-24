'use client';

/**
 * Provenance and lineage (#2342): build provenance (builder, SLSA level,
 * source commit, attestation, SBOM) and a layered lineage graph of related
 * artifacts and entities, with an equivalent list for screen readers.
 */

import Link from 'next/link';
import type { ArtifactManagerState } from './hooks/useArtifactManager';
import type { LineageNode } from './lib/lineage';

const NODE_W = 150;
const NODE_H = 34;
const COL_GAP = 40;
const ROW_GAP = 14;

const KIND_COLORS: Record<LineageNode['kind'], string> = {
  artifact: '#0A66C2',
  run: '#6b7280',
  campaign: '#7c3aed',
  crash: '#dc2626',
  report: '#059669',
};

export function ProvenanceLineage({ state }: { state: ArtifactManagerState }) {
  const artifact = state.metadata.data?.artifact;
  const graph = state.lineage.data?.graph;
  if (!state.selectedId || !artifact) return null;

  const columns = graph ? [...new Set(graph.nodes.map((node) => node.column))].sort((a, b) => a - b) : [];
  const x = (column: number) => columns.indexOf(column) * (NODE_W + COL_GAP) + 4;
  const y = (row: number) => row * (NODE_H + ROW_GAP) + 4;
  const maxRow = graph ? Math.max(0, ...graph.nodes.map((node) => node.row)) : 0;
  const width = Math.max(1, columns.length) * (NODE_W + COL_GAP);
  const height = (maxRow + 1) * (NODE_H + ROW_GAP) + 8;
  const position = new Map(graph?.nodes.map((node) => [node.id, node]) ?? []);

  return (
    <section className="card card-padding flex flex-col gap-3 min-w-0" aria-label="Provenance and lineage">
      <h2 className="text-sm-semibold">Provenance</h2>
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-meta">Builder</dt>
        <dd>{artifact.provenance.builder}</dd>
        <dt className="text-meta">SLSA level</dt>
        <dd>L{artifact.provenance.slsaLevel}</dd>
        <dt className="text-meta">Source commit</dt>
        <dd>
          <code>{artifact.provenance.sourceCommit ?? '—'}</code>
        </dd>
        <dt className="text-meta">Attestation</dt>
        <dd className="break-all">
          {artifact.provenance.attestationUrl ? (
            <a className="link" href={artifact.provenance.attestationUrl} rel="noopener noreferrer" target="_blank">
              SLSA attestation
            </a>
          ) : (
            '—'
          )}
        </dd>
        <dt className="text-meta">SBOM</dt>
        <dd className="break-all">
          {artifact.provenance.sbomUrl ? (
            <a className="link" href={artifact.provenance.sbomUrl} rel="noopener noreferrer" target="_blank">
              SPDX SBOM
            </a>
          ) : (
            '—'
          )}
        </dd>
      </dl>

      <div className="flex-between">
        <h2 className="text-sm-semibold">Lineage</h2>
        <label className="text-sm flex items-center gap-1">
          Depth
          <select className="input-field" value={state.lineageDepth} onChange={(event) => state.setLineageDepth(Number(event.target.value))}>
            {[1, 2, 3, 4].map((depth) => (
              <option key={depth} value={depth}>
                {depth}
              </option>
            ))}
          </select>
        </label>
      </div>
      {state.lineage.error ? <p className="field-error text-sm">{state.lineage.error}</p> : null}
      {graph ? (
        <>
          <div className="overflow-auto">
            <svg
              role="img"
              aria-label={`Lineage graph with ${graph.nodes.length} nodes; details in the list below`}
              viewBox={`0 0 ${width} ${height}`}
              width={width}
              height={height}
            >
              <defs>
                <marker id="lineage-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                </marker>
              </defs>
              {graph.edges.map((edge) => {
                const from = position.get(edge.from);
                const to = position.get(edge.to);
                if (!from || !to) return null;
                const x1 = x(from.column) + NODE_W;
                const y1 = y(from.row) + NODE_H / 2;
                const x2 = x(to.column);
                const y2 = y(to.row) + NODE_H / 2;
                const backwards = x2 <= x1;
                return (
                  <path
                    key={`${edge.from}-${edge.to}`}
                    d={backwards ? `M ${x(from.column)} ${y1} C ${x(from.column) - 30} ${y1}, ${x2 + NODE_W + 30} ${y2}, ${x2 + NODE_W} ${y2}` : `M ${x1} ${y1} C ${x1 + 20} ${y1}, ${x2 - 20} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity={edge.relation === 'belongs-to' ? 0.25 : 0.6}
                    strokeDasharray={edge.relation === 'belongs-to' ? '3 3' : undefined}
                    markerEnd="url(#lineage-arrow)"
                  >
                    <title>{edge.relation}</title>
                  </path>
                );
              })}
              {graph.nodes.map((node) => (
                <g key={node.id} transform={`translate(${x(node.column)} ${y(node.row)})`}>
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={6}
                    fill={KIND_COLORS[node.kind]}
                    fillOpacity={node.root ? 0.35 : 0.12}
                    stroke={node.trust === 'blocked' ? '#dc2626' : KIND_COLORS[node.kind]}
                    strokeWidth={node.root || node.trust === 'blocked' ? 2 : 1}
                  />
                  <text x={8} y={14} fontSize={10} fill="currentColor" opacity={0.7}>
                    {node.kind === 'artifact' ? node.artifactType : node.kind}
                  </text>
                  <text x={8} y={27} fontSize={11} fill="currentColor">
                    {node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          <details>
            <summary className="text-sm cursor-pointer">Lineage as a list</summary>
            <ul className="text-sm mt-1 flex flex-col gap-1">
              {graph.nodes.map((node) => (
                <li key={node.id}>
                  {node.kind === 'artifact' ? (
                    <button type="button" className="link" onClick={() => state.select(node.id)}>
                      {node.label}
                    </button>
                  ) : node.href ? (
                    <Link className="link" href={node.href}>
                      {node.kind} {node.label}
                    </Link>
                  ) : (
                    `${node.kind} ${node.label}`
                  )}{' '}
                  <span className="text-meta">
                    {graph.edges
                      .filter((edge) => edge.to === node.id && edge.relation !== 'belongs-to')
                      .map((edge) => `${edge.relation} ${position.get(edge.from)?.label ?? edge.from}`)
                      .join('; ')}
                  </span>
                </li>
              ))}
            </ul>
          </details>
          {graph.truncated ? <p className="text-meta text-xs">Graph truncated; lower the depth or open a related artifact.</p> : null}
        </>
      ) : null}
    </section>
  );
}
