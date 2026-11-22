"use client";

import { useMemo, useState } from "react";
import { PageHeader, StatCard } from "../../components";

type Stage = {
  id: string;
  name: string;
  kind: string;
  status: "ready" | "warning" | "optional";
  detail: string;
  x: number;
  y: number;
};

const stages: Stage[] = [
  { id: "seed", name: "Seed generator", kind: "Corpus", status: "ready", detail: "ADR fixture", x: 8, y: 18 },
  { id: "mutation", name: "Mutation profile", kind: "Havoc", status: "ready", detail: "64 workers", x: 31, y: 18 },
  { id: "target", name: "Host / RPC target", kind: "Environment", status: "warning", detail: "RPC p95 420ms", x: 54, y: 18 },
  { id: "replay", name: "Replay gate", kind: "Regression", status: "ready", detail: "3 repeats", x: 77, y: 18 },
  { id: "promote", name: "Promote", kind: "Corpus", status: "optional", detail: "Threshold: 80%", x: 54, y: 60 },
];

const blueprints = [
  { name: "Soroban regression", stages: 5, runtime: "45m", cost: "$12" },
  { name: "Host parity sweep", stages: 4, runtime: "2h", cost: "$31" },
  { name: "RPC adversarial", stages: 6, runtime: "90m", cost: "$24" },
];

export default function CampaignDesignerPage() {
  const [selected, setSelected] = useState("seed");
  const [budget, setBudget] = useState(120);
  const [blueprint, setBlueprint] = useState("Soroban regression");
  const selectedStage = stages.find((stage) => stage.id === selected) ?? stages[0];
  const validation = useMemo(() => {
    const warnings = budget < 90 ? 1 : 0;
    return {
      warnings,
      coverage: budget >= 90 ? "82% projected" : "68% projected",
      workers: budget >= 90 ? "64 workers" : "48 workers",
    };
  }, [budget]);

  return (
    <div className="container-full page-padding fade-in">
      <PageHeader
        title="Campaign Designer"
        description="Orchestrate strategy dependencies, budgets, replay gates, and corpus promotion."
        actions={
          <button type="button" className="btn-primary">Launch campaign</button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Stages" value="5" subtext="1 replay gate" />
        <StatCard label="Projected coverage" value={validation.coverage} subtext="Across 3 contracts" />
        <StatCard label="Runtime budget" value={`${budget} min`} subtext={validation.workers} />
        <StatCard label="Validation" value={validation.warnings ? "1 warning" : "Ready"} subtext="Preflight complete" />
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_280px] gap-5">
        <section className="card overflow-hidden" aria-label="Campaign strategy graph">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
            <div>
              <h2 className="heading-section">Strategy graph</h2>
              <p className="text-meta">Blueprint: {blueprint}</p>
            </div>
            <select
              className="form-input w-auto"
              value={blueprint}
              onChange={(event) => setBlueprint(event.target.value)}
              aria-label="Campaign blueprint"
            >
              {blueprints.map((item) => <option key={item.name}>{item.name}</option>)}
            </select>
          </div>
          <div className="relative h-[390px] overflow-auto bg-[var(--hover-bg)]">
            <svg className="absolute inset-0 h-full w-full min-w-[760px]" aria-hidden="true">
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="var(--text-primary)" />
                </marker>
              </defs>
              <path d="M 98 105 C 150 105, 155 105, 215 105" fill="none" stroke="var(--text-primary)" strokeWidth="2" markerEnd="url(#arrow)" />
              <path d="M 335 105 C 390 105, 395 105, 460 105" fill="none" stroke="var(--text-primary)" strokeWidth="2" markerEnd="url(#arrow)" />
              <path d="M 580 105 C 640 105, 650 105, 690 105" fill="none" stroke="var(--text-primary)" strokeWidth="2" markerEnd="url(#arrow)" />
              <path d="M 580 105 C 580 160, 520 165, 520 250" fill="none" stroke="var(--text-primary)" strokeWidth="2" markerEnd="url(#arrow)" />
            </svg>
            {stages.map((stage) => (
              <button
                key={stage.id}
                type="button"
                onClick={() => setSelected(stage.id)}
                className={`absolute w-[150px] rounded-xl border p-3 text-left transition ${
                  selected === stage.id ? "bg-[var(--text-primary)] text-[var(--nav-bg)] shadow-lg" : "bg-[var(--surface)]"
                }`}
                style={{ left: `${stage.x}%`, top: `${stage.y * 4}px` }}
                aria-label={`Select ${stage.name}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-widest opacity-70">{stage.kind}</span>
                  <span className="text-xs">{stage.status === "warning" ? "!" : stage.status === "optional" ? "○" : "●"}</span>
                </div>
                <strong className="block mt-2 text-sm">{stage.name}</strong>
                <span className="block mt-1 text-xs opacity-70">{stage.detail}</span>
              </button>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="card card-padding">
            <p className="text-xs uppercase tracking-widest text-meta">Selected stage</p>
            <h2 className="heading-section mt-2">{selectedStage.name}</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-meta">Type</dt><dd>{selectedStage.kind}</dd></div>
              <div className="flex justify-between"><dt className="text-meta">State</dt><dd>{selectedStage.status}</dd></div>
              <div className="flex justify-between"><dt className="text-meta">Config</dt><dd>{selectedStage.detail}</dd></div>
            </dl>
          </section>

          <section className="card card-padding">
            <h2 className="heading-section">Guardrails</h2>
            <label className="block mt-4 text-sm">
              Runtime budget: <strong>{budget} min</strong>
              <input
                className="mt-3 w-full"
                type="range"
                min="60"
                max="240"
                step="15"
                value={budget}
                onChange={(event) => setBudget(Number(event.target.value))}
              />
            </label>
            {validation.warnings > 0 ? (
              <p className="mt-4 rounded-lg border border-[var(--border-color)] p-3 text-xs">
                Budget is below the blueprint recommendation. Coverage projection is degraded.
              </p>
            ) : (
              <p className="mt-4 rounded-lg bg-[var(--hover-bg)] p-3 text-xs">
                Environment, dependencies, and replay threshold validated.
              </p>
            )}
          </section>

          <section className="card card-padding">
            <h2 className="heading-section">Blueprint library</h2>
            <div className="mt-3 space-y-2">
              {blueprints.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => setBlueprint(item.name)}
                  className="w-full rounded-lg border border-[var(--border-color)] p-3 text-left text-sm"
                >
                  <strong>{item.name}</strong>
                  <span className="mt-1 flex justify-between text-xs text-meta">
                    <span>{item.stages} stages</span><span>{item.runtime} · {item.cost}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
