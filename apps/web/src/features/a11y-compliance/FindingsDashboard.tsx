"use client";

/**
 * Findings dashboard: posture summary, route/component hotspots, regressions,
 * SLA status, high-risk surface coverage and a 30-day trend (#2335).
 */
import { useState } from "react";
import {
  isOpenStatus,
  slaState,
  type A11yFinding,
  type Hotspot,
  type SlaState,
  type SurfaceCoverage,
  type TrendPoint,
} from "./model";

export interface FindingsDashboardProps {
  findings: A11yFinding[];
  routeHotspots: Hotspot[];
  componentHotspots: Hotspot[];
  coverage: SurfaceCoverage[];
  trend: TrendPoint[];
  onSelectFinding?: (id: string) => void;
}

const SLA_LABEL: Record<SlaState, string> = {
  ok: "Within SLA",
  "at-risk": "At risk",
  breached: "Breached",
  closed: "Closed",
};

export function FindingsDashboard({
  findings,
  routeHotspots,
  componentHotspots,
  coverage,
  trend,
  onSelectFinding,
}: FindingsDashboardProps) {
  const [hotspotBy, setHotspotBy] = useState<"route" | "component">("route");
  const open = findings.filter((f) => isOpenStatus(f.status));
  const severe = open.filter((f) => f.impact === "critical" || f.impact === "serious");
  const regressions = open.filter((f) => f.regression);
  const sla = open.reduce<Record<SlaState, number>>(
    (acc, f) => {
      acc[slaState(f)] += 1;
      return acc;
    },
    { ok: 0, "at-risk": 0, breached: 0, closed: 0 },
  );
  const hotspotRows = (hotspotBy === "route" ? routeHotspots : componentHotspots).slice(0, 8);
  const maxTrend = Math.max(1, ...trend.map((p) => p.openTotal));
  const latest = trend[trend.length - 1];
  const first = trend[0];

  return (
    <div className="space-y-6">
      <section aria-labelledby="a11y-summary-heading">
        <h2 id="a11y-summary-heading" className="sr-only">Summary</h2>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Open findings" value={open.length} />
          <Stat label="Critical / serious" value={severe.length} tone={severe.length ? "bad" : "good"} />
          <Stat label="Regressions" value={regressions.length} tone={regressions.length ? "bad" : "good"} />
          <Stat label="SLA breached" value={sla.breached} tone={sla.breached ? "bad" : "good"} hint={`${sla["at-risk"]} at risk`} />
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="a11y-hotspots-heading" className="card card-padding">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 id="a11y-hotspots-heading" className="heading-section">Hotspots</h2>
            <fieldset className="flex gap-1">
              <legend className="sr-only">Group hotspots by</legend>
              {(["route", "component"] as const).map((by) => (
                <label key={by} className={`chip cursor-pointer ${hotspotBy === by ? "chip-active" : ""}`}>
                  <input
                    type="radio"
                    name="a11y-hotspot-by"
                    value={by}
                    checked={hotspotBy === by}
                    onChange={() => setHotspotBy(by)}
                    className="sr-only"
                  />
                  By {by}
                </label>
              ))}
            </fieldset>
          </div>
          {hotspotRows.length === 0 ? (
            <p className="text-meta">No open findings.</p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Open accessibility findings grouped by {hotspotBy}, highest priority first</caption>
              <thead>
                <tr className="text-left text-meta">
                  <th scope="col" className="py-1 pr-2 font-medium">{hotspotBy === "route" ? "Route" : "Component"}</th>
                  <th scope="col" className="py-1 px-2 font-medium text-right">Open</th>
                  <th scope="col" className="py-1 px-2 font-medium text-right">Severe</th>
                  <th scope="col" className="py-1 pl-2 font-medium text-right">Priority</th>
                </tr>
              </thead>
              <tbody>
                {hotspotRows.map((h) => (
                  <tr key={h.key} className="border-t border-token">
                    <th scope="row" className="py-1.5 pr-2 font-mono text-xs font-normal text-left break-all">{h.key}</th>
                    <td className="py-1.5 px-2 text-right tabular-nums">{h.open}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{h.critical}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">{h.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section aria-labelledby="a11y-coverage-heading" className="card card-padding">
          <h2 id="a11y-coverage-heading" className="heading-section mb-1">High-risk surface coverage</h2>
          <p className="text-meta mb-3">Data grids, charts, canvas, diff and trace views need a manual audit in addition to automated scans.</p>
          <ul className="space-y-2">
            {coverage.map((c) => (
              <li key={c.surface} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium capitalize">{c.surface.replace("-", " ")}</span>
                <span className="flex items-center gap-2">
                  <span className="text-meta">{c.sources.length ? c.sources.join(", ") : "no data"}</span>
                  <span
                    className={`badge ${c.audited ? "badge-completed" : "badge-failed"}`}
                    aria-label={c.audited ? "Manually audited" : "Not manually audited"}
                  >
                    {c.audited ? "✓ Audited" : "✕ Unaudited"}
                  </span>
                  <span className="tabular-nums text-meta">{c.open} open</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-labelledby="a11y-regressions-heading" className="card card-padding">
        <h2 id="a11y-regressions-heading" className="heading-section mb-3">Regressions &amp; SLA</h2>
        {regressions.length === 0 && sla.breached === 0 && sla["at-risk"] === 0 ? (
          <p className="text-meta">No regressions and every open finding is within SLA.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {open
              .filter((f) => f.regression || slaState(f) !== "ok")
              .map((f) => {
                const state = slaState(f);
                return (
                  <li key={f.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <button type="button" className="link text-left" onClick={() => onSelectFinding?.(f.id)}>
                      {f.title}
                    </button>
                    <span className="flex gap-2">
                      {f.regression && <span className="badge badge-critical">Regression</span>}
                      <span className={`badge ${state === "breached" ? "badge-failed" : state === "at-risk" ? "badge-running" : "badge-completed"}`}>
                        {SLA_LABEL[state]}
                      </span>
                    </span>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      <section aria-labelledby="a11y-trend-heading" className="card card-padding">
        <h2 id="a11y-trend-heading" className="heading-section mb-1">30-day trend</h2>
        <p className="text-meta mb-3" id="a11y-trend-summary">
          {first && latest
            ? `Open findings went from ${first.openTotal} on ${first.date} to ${latest.openTotal} on ${latest.date}.`
            : "No trend data."}
        </p>
        <div className="flex items-end gap-0.5 h-24" role="img" aria-labelledby="a11y-trend-summary">
          {trend.map((p) => (
            <div
              key={p.date}
              className="flex-1 bg-blue-600/70 dark:bg-blue-400/70 rounded-t-sm min-h-[2px]"
              style={{ height: `${(p.openTotal / maxTrend) * 100}%` }}
              title={`${p.date}: ${p.openTotal} open, ${p.opened} opened, ${p.resolved} resolved`}
            />
          ))}
        </div>
        <details className="mt-3">
          <summary className="text-sm cursor-pointer">Show trend data as a table</summary>
          <div className="max-h-60 overflow-auto mt-2" tabIndex={0} role="region" aria-label="Trend data">
            <table className="w-full text-sm">
              <caption className="sr-only">Daily accessibility findings</caption>
              <thead>
                <tr className="text-left text-meta">
                  <th scope="col">Date</th>
                  <th scope="col" className="text-right">Opened</th>
                  <th scope="col" className="text-right">Resolved</th>
                  <th scope="col" className="text-right">Open total</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((p) => (
                  <tr key={p.date}>
                    <th scope="row" className="font-normal text-left">{p.date}</th>
                    <td className="text-right tabular-nums">{p.opened}</td>
                    <td className="text-right tabular-nums">{p.resolved}</td>
                    <td className="text-right tabular-nums">{p.openTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: number; tone?: "good" | "bad"; hint?: string }) {
  const color = tone === "bad" ? "text-red-700 dark:text-red-400" : tone === "good" ? "text-green-700 dark:text-green-400" : "";
  return (
    <div className="card card-padding">
      <dt className="text-meta">{label}</dt>
      <dd className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</dd>
      {hint && <dd className="text-caption">{hint}</dd>}
    </div>
  );
}
