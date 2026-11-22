'use client';

export function EnvMatrix({ runs }: { runs: { id: string; area: string }[] }) {
  const envs = ['testnet', 'mainnet', 'local'];
  return (
    <div className="card card-padding overflow-x-auto">
      <h3 className="font-semibold text-sm">Environment Matrix</h3>
      <table className="data-table mt-3">
        <thead><tr><th>Run</th>{envs.map((e) => <th key={e} scope="col">{e}</th>)}</tr></thead>
        <tbody>{runs.slice(0, 5).map((r) => <tr key={r.id}><td>{r.id}</td>{envs.map((e) => <td key={e}>{r.area === e ? '✓' : '—'}</td>)}</tr>)}</tbody>
      </table>
      <p className="text-meta text-xs mt-2">Divergence highlighted when the same seed yields different outcomes across environments.</p>
    </div>
  );
}
