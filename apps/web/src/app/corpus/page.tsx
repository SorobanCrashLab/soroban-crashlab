"use client";

import { useMemo, useState } from "react";
import { PageHeader, StatCard } from "../../components";

type Seed = {
  id: string;
  contract: string;
  source: string;
  mutation: string;
  coverage: number;
  crashes: number;
  size: number;
  status: "promoted" | "active" | "quarantined";
};

const seeds: Seed[] = [
  { id: "seed-8f21", contract: "token.swap", source: "coverage-guided", mutation: "havoc", coverage: 18.4, crashes: 3, size: 412, status: "promoted" },
  { id: "seed-a4c9", contract: "vault.deposit", source: "dictionary", mutation: "boundary", coverage: 14.1, crashes: 1, size: 288, status: "active" },
  { id: "seed-19de", contract: "oracle.update", source: "manual", mutation: "splice", coverage: 9.8, crashes: 0, size: 936, status: "active" },
  { id: "seed-b71e", contract: "token.transfer", source: "crash replay", mutation: "enum_flip", coverage: 8.2, crashes: 2, size: 196, status: "quarantined" },
  { id: "seed-c032", contract: "vault.withdraw", source: "coverage-guided", mutation: "arithmetic", coverage: 6.7, crashes: 0, size: 648, status: "active" },
  { id: "seed-f904", contract: "token.mint", source: "random", mutation: "havoc", coverage: 3.1, crashes: 0, size: 1536, status: "quarantined" },
];

export default function CorpusExplorerPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Seed>(seeds[0]);
  const [notice, setNotice] = useState("");

  const filtered = useMemo(() => seeds.filter((seed) => {
    const matchesQuery = `${seed.id} ${seed.contract} ${seed.source} ${seed.mutation}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (status === "all" || seed.status === status);
  }), [query, status]);

  const curate = (nextStatus: Seed["status"]) => {
    setNotice(`${selected.id} moved to ${nextStatus}`);
  };

  return (
    <div className="container-full page-padding fade-in">
      <PageHeader
        title="Seed & Corpus Explorer"
        description="Browse high-scale inputs, inspect mutation lineage, and curate valuable seeds."
        actions={<button type="button" className="btn-outline" onClick={() => setNotice("Dedupe analysis started")}>Dedupe corpus</button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Corpus seeds" value="48,291" subtext="Across 12 contracts" />
        <StatCard label="Promoted" value="1,842" subtext="+126 this week" />
        <StatCard label="Quarantined" value="327" subtext="Needs review" />
        <StatCard label="Redundant" value="8.4%" subtext="Dedupe candidate" />
      </div>

      {notice && <div className="mb-4 rounded-lg border border-[var(--border-color)] px-4 py-3 text-sm" role="status">{notice}</div>}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_320px] gap-5">
        <section className="card overflow-hidden">
          <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-[var(--border-color)]">
            <input
              className="form-input flex-1"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search seed, contract, source..."
              aria-label="Search corpus"
            />
            <select className="form-input w-full sm:w-40" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Corpus status">
              <option value="all">All states</option>
              <option value="promoted">Promoted</option>
              <option value="active">Active</option>
              <option value="quarantined">Quarantined</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-meta">
                  <th className="px-4 py-3">Seed</th>
                  <th className="px-4 py-3">Contract</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3 text-right">Coverage</th>
                  <th className="px-4 py-3 text-right">Crashes</th>
                  <th className="px-4 py-3">State</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((seed) => (
                  <tr
                    key={seed.id}
                    className={`cursor-pointer border-t border-[var(--border-color)] ${selected.id === seed.id ? "bg-[var(--hover-bg)]" : ""}`}
                    onClick={() => setSelected(seed)}
                  >
                    <td className="px-4 py-3 font-mono text-xs">{seed.id}</td>
                    <td className="px-4 py-3">{seed.contract}</td>
                    <td className="px-4 py-3">{seed.source}</td>
                    <td className="px-4 py-3 text-right">{seed.coverage}%</td>
                    <td className="px-4 py-3 text-right">{seed.crashes}</td>
                    <td className="px-4 py-3"><span className="rounded-full border border-[var(--border-color)] px-2 py-1 text-xs">{seed.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="card card-padding h-fit">
          <p className="text-xs uppercase tracking-widest text-meta">Seed inspector</p>
          <h2 className="heading-section mt-2 font-mono">{selected.id}</h2>
          <div className="mt-4 rounded-lg bg-[var(--hover-bg)] p-3 font-mono text-xs break-all">
            0x53 0x57 0x41 0x50 0x00 0x1f 0x4a
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-meta">Contract</dt><dd>{selected.contract}</dd></div>
            <div className="flex justify-between"><dt className="text-meta">Mutation</dt><dd>{selected.mutation}</dd></div>
            <div className="flex justify-between"><dt className="text-meta">Size</dt><dd>{selected.size} bytes</dd></div>
            <div className="flex justify-between"><dt className="text-meta">Coverage</dt><dd>{selected.coverage}%</dd></div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => curate("promoted")}>Promote</button>
            <button type="button" className="btn-outline" onClick={() => curate("quarantined")}>Quarantine</button>
            <button type="button" className="btn-outline" onClick={() => setNotice(`${selected.id} minimized to 224 bytes`)}>Minimize</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
