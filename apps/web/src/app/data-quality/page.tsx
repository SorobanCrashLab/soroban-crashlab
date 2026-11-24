"use client";

import { useMemo, useState } from "react";
import { PageHeader, StatCard } from "../../components";

type Pipeline = {
  name: string;
  source: string;
  freshness: string;
  lag: string;
  completeness: number;
  status: "healthy" | "warning" | "critical";
};

const pipelines: Pipeline[] = [
  { name: "Run metrics", source: "metrics-stream", freshness: "18 sec ago", lag: "22 sec", completeness: 99.8, status: "healthy" },
  { name: "Case artifacts", source: "artifact-store", freshness: "2 min ago", lag: "4 min", completeness: 97.2, status: "warning" },
  { name: "Crash parser", source: "classification", freshness: "9 min ago", lag: "12 min", completeness: 88.5, status: "critical" },
  { name: "Sentry exports", source: "sentry-webhook", freshness: "34 sec ago", lag: "45 sec", completeness: 99.1, status: "healthy" },
];

export default function DataQualityPage() {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Pipeline>(pipelines[0]);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const filtered = useMemo(() => pipelines.filter((pipeline) => filter === "all" || pipeline.status === filter), [filter]);
  const average = useMemo(() => pipelines.reduce((sum, pipeline) => sum + pipeline.completeness, 0) / pipelines.length, []);

  return (
    <div className="container-full page-padding fade-in">
      <PageHeader
        title="Data Quality & Freshness"
        description="Monitor ingestion health, stale partitions, schema drift, parser failures, and metric trust."
        actions={
          <button type="button" className="btn-outline" onClick={() => setAcknowledged((items) => [...items, selected.name])}>
            Acknowledge issue
          </button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Overall trust" value={`${average.toFixed(1)}%`} subtext="Weighted completeness" />
        <StatCard label="Fresh sources" value="3 / 4" subtext="Within SLA" />
        <StatCard label="Missing partitions" value="2" subtext="Last 24 hours" />
        <StatCard label="Parser failures" value="17" subtext="Crash parser" />
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_320px] gap-5">
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-[var(--border-color)]">
            <h2 className="heading-section">Pipeline health</h2>
            <select className="form-input w-40" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter pipeline status">
              <option value="all">All pipelines</option>
              <option value="healthy">Healthy</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-meta">
                  <th className="px-4 py-3">Pipeline</th>
                  <th className="px-4 py-3">Freshness</th>
                  <th className="px-4 py-3 text-right">Lag</th>
                  <th className="px-4 py-3 text-right">Complete</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((pipeline) => (
                  <tr
                    key={pipeline.name}
                    onClick={() => setSelected(pipeline)}
                    className={`cursor-pointer border-t border-[var(--border-color)] ${selected.name === pipeline.name ? "bg-[var(--hover-bg)]" : ""}`}
                  >
                    <td className="px-4 py-4"><strong>{pipeline.name}</strong><div className="text-xs text-meta">{pipeline.source}</div></td>
                    <td className="px-4 py-4">{pipeline.freshness}</td>
                    <td className="px-4 py-4 text-right">{pipeline.lag}</td>
                    <td className="px-4 py-4 text-right">{pipeline.completeness}%</td>
                    <td className="px-4 py-4"><span className="rounded-full border border-[var(--border-color)] px-2 py-1 text-xs">{pipeline.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="card card-padding">
            <p className="text-xs uppercase tracking-widest text-meta">Source details</p>
            <h2 className="heading-section mt-2">{selected.name}</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-meta">Source</dt><dd>{selected.source}</dd></div>
              <div className="flex justify-between"><dt className="text-meta">Lag</dt><dd>{selected.lag}</dd></div>
              <div className="flex justify-between"><dt className="text-meta">Completeness</dt><dd>{selected.completeness}%</dd></div>
            </dl>
            {acknowledged.includes(selected.name) && <p className="mt-4 rounded-lg border border-[var(--border-color)] p-3 text-xs" role="status">Issue acknowledged</p>}
          </section>

          <section className="card card-padding">
            <h2 className="heading-section">Trust indicators</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between"><span>Schema version</span><strong>v3.2</strong></div>
              <div className="flex justify-between"><span>Missing partitions</span><strong>{selected.status === "critical" ? "2" : "0"}</strong></div>
              <div className="flex justify-between"><span>Parser status</span><strong>{selected.status === "critical" ? "Degraded" : "Healthy"}</strong></div>
            </div>
          </section>

          <section className="card card-padding">
            <h2 className="heading-section">Recommended action</h2>
            <p className="mt-3 text-sm text-meta">
              {selected.status === "critical"
                ? "Restart the classification parser and replay the two latest partitions."
                : selected.status === "warning"
                  ? "Reconcile the missing artifact partition before promoting corpus seeds."
                  : "No action required; source remains within the freshness SLA."}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
