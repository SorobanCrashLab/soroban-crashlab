"use client";

import { useMemo, useState } from "react";
import { PageHeader, StatCard } from "../../components";

const contracts = [
  { name: "token_contract", path: "src/token.rs", coverage: 86, edges: "214/248", color: 86 },
  { name: "vault_contract", path: "src/vault.rs", coverage: 71, edges: "142/200", color: 71 },
  { name: "oracle_contract", path: "src/oracle.rs", coverage: 54, edges: "68/126", color: 54 },
  { name: "auth_contract", path: "src/auth.rs", coverage: 92, edges: "96/104", color: 92 },
];

const hotspotRows = [
  { symbol: "swap", file: "src/token.rs", line: 84, covered: 48, missed: 4, trend: "+9%" },
  { symbol: "withdraw", file: "src/vault.rs", line: 121, covered: 36, missed: 11, trend: "-2%" },
  { symbol: "update_price", file: "src/oracle.rs", line: 67, covered: 22, missed: 18, trend: "+3%" },
  { symbol: "verify_signature", file: "src/auth.rs", line: 43, covered: 61, missed: 2, trend: "+12%" },
];

export default function CoverageMapPage() {
  const [contract, setContract] = useState(contracts[0].name);
  const [view, setView] = useState("Blocks");
  const active = contracts.find((item) => item.name === contract) ?? contracts[0];
  const blocks = useMemo(() => Array.from({ length: 96 }, (_, index) => {
    const hit = ((index * 7 + index / 3) % 100) < active.coverage;
    return hit ? "hit" : "miss";
  }), [active]);

  return (
    <div className="container-full page-padding fade-in">
      <PageHeader
        title="Coverage Map"
        description="Explore source, contract, block, and edge coverage across runs and seeds."
        actions={
          <select className="form-input" value={contract} onChange={(event) => setContract(event.target.value)} aria-label="Select contract">
            {contracts.map((item) => <option key={item.name}>{item.name}</option>)}
          </select>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Line coverage" value={`${active.coverage}%`} subtext="+4.2% in 7d" />
        <StatCard label="Discovered edges" value={active.edges} subtext="Across selected target" />
        <StatCard label="New this run" value="18" subtext="7 linked crashes" />
        <StatCard label="Coverage plateau" value="6 runs" subtext="Review hotspots" />
      </div>

      <div className="grid xl:grid-cols-[240px_minmax(0,1fr)_300px] gap-5">
        <aside className="card card-padding h-fit">
          <h2 className="heading-section">Contracts</h2>
          <div className="mt-3 space-y-2">
            {contracts.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => setContract(item.name)}
                className={`w-full rounded-lg border p-3 text-left ${item.name === contract ? "bg-[var(--hover-bg)] border-[var(--text-primary)]" : "border-[var(--border-color)]"}`}
              >
                <strong className="text-sm">{item.name}</strong>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded bg-[var(--skeleton-from)]"><div className="h-full rounded bg-[var(--text-primary)]" style={{ width: `${item.coverage}%` }} /></div>
                  <span className="text-xs">{item.coverage}%</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)]">
            <div>
              <h2 className="heading-section">{active.name}</h2>
              <p className="text-meta">{active.path}</p>
            </div>
            <div className="flex rounded-lg border border-[var(--border-color)] p-1">
              {["Blocks", "Edges"].map((item) => (
                <button key={item} type="button" onClick={() => setView(item)} className={`px-3 py-1 text-xs rounded ${view === item ? "bg-[var(--text-primary)] text-[var(--nav-bg)]" : ""}`}>{item}</button>
              ))}
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-8 sm:grid-cols-12 gap-2" aria-label={`${view} coverage map`}>
              {blocks.map((block, index) => (
                <button
                  key={index}
                  type="button"
                  title={`${view} ${index + 1}: ${block === "hit" ? "covered" : "gap"}`}
                  aria-label={`${view} ${index + 1}: ${block}`}
                  className={`aspect-square rounded-md border ${block === "hit" ? "bg-[var(--text-primary)] border-[var(--text-primary)]" : "bg-[var(--surface)] border-[var(--border-color)]"}`}
                />
              ))}
            </div>
            <div className="mt-5 flex justify-between text-xs text-meta">
              <span>Not covered</span><span>Covered by 20+ seeds</span>
            </div>
            <div className="mt-2 h-2 rounded bg-[linear-gradient(90deg,var(--surface),var(--text-secondary),var(--text-primary))] border border-[var(--border-color)]" />
          </div>
        </section>

        <aside className="card card-padding h-fit">
          <h2 className="heading-section">Gap hotspots</h2>
          <div className="mt-3 divide-y divide-[var(--border-color)]">
            {hotspotRows.map((row) => (
              <button key={row.symbol} type="button" className="w-full py-3 text-left">
                <div className="flex items-center justify-between">
                  <strong className="text-sm">{row.symbol}</strong>
                  <span className="text-xs text-meta">{row.trend}</span>
                </div>
                <p className="mt-1 text-xs text-meta">{row.file}:{row.line}</p>
                <p className="mt-1 text-xs">{row.covered} covered · {row.missed} missed</p>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
