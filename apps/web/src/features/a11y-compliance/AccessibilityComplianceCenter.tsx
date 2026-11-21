"use client";

/**
 * Accessibility Compliance Automation Center (#2335).
 *
 * Aggregates automated (axe/CI, lint, runtime) and manual/user-reported
 * accessibility findings, tracks remediation, maps to WCAG criteria and
 * drives the release accessibility gate. Tabs follow the WAI-ARIA tabs
 * pattern (roving tabindex, arrow/Home/End keys).
 */
import { useRef, useState, type KeyboardEvent } from "react";
import { FindingsDashboard } from "./FindingsDashboard";
import { RemediationQueue } from "./RemediationQueue";
import { WcagCriteriaMap } from "./WcagCriteriaMap";
import { ReleaseGatePanel } from "./ReleaseGatePanel";
import { useA11yCompliance } from "./hooks/useA11yCompliance";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "queue", label: "Remediation queue" },
  { id: "wcag", label: "WCAG criteria" },
  { id: "gate", label: "Release gate" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export interface AccessibilityComplianceCenterProps {
  release?: string;
}

export function AccessibilityComplianceCenter({ release }: AccessibilityComplianceCenterProps) {
  const state = useA11yCompliance({ release });
  const [tab, setTab] = useState<TabId>("dashboard");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ dashboard: null, queue: null, wcag: null, gate: null });

  const activate = (id: TabId, focus = false) => {
    setTab(id);
    if (focus) tabRefs.current[id]?.focus();
  };

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const idx = TABS.findIndex((t) => t.id === tab);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (idx + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next !== null) {
      e.preventDefault();
      activate(TABS[next].id, true);
    }
  };

  const openFinding = (id: string) => {
    setSelectedId(id);
    activate("queue");
  };

  if (state.isLoading) {
    return (
      <div role="status" aria-live="polite" className="text-meta py-8">
        Loading accessibility findings…
      </div>
    );
  }

  if (state.error) {
    return (
      <div role="alert" className="card card-padding">
        <p className="text-sm mb-3">{state.error}</p>
        <button type="button" className="btn-outline" onClick={() => void state.refresh()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="sr-only" role="status" aria-live="polite">
        {state.lastAction}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Accessibility compliance views" className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`a11y-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`a11y-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className={`chip ${tab === t.id ? "chip-active" : ""}`}
              onClick={() => activate(t.id)}
              onKeyDown={onTabKeyDown}
            >
              {t.label}
              {t.id === "gate" && state.gate && (
                <span className="ml-1" aria-label={`gate ${state.gate.status}`}>
                  {state.gate.status === "pass" ? "✓" : state.gate.status === "warn" ? "!" : "✕"}
                </span>
              )}
            </button>
          ))}
        </div>
        <button type="button" className="btn-ghost" onClick={() => void state.refresh()}>
          Refresh
        </button>
      </div>

      {TABS.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`a11y-panel-${t.id}`}
          aria-labelledby={`a11y-tab-${t.id}`}
          hidden={tab !== t.id}
          tabIndex={0}
        >
          {tab === t.id && t.id === "dashboard" && (
            <FindingsDashboard
              findings={state.findings}
              routeHotspots={state.routeHotspots}
              componentHotspots={state.componentHotspots}
              coverage={state.coverage}
              trend={state.trend}
              onSelectFinding={openFinding}
            />
          )}
          {tab === t.id && t.id === "queue" && (
            <RemediationQueue
              findings={state.findings}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onUpdate={state.updateFinding}
              onReportBarrier={state.reportBarrier}
            />
          )}
          {tab === t.id && t.id === "wcag" && (
            <WcagCriteriaMap
              conformance={state.conformance}
              onSelectCriterion={(criterionId) => {
                const first = state.findings.find((f) => f.wcagCriteria.includes(criterionId) && f.status !== "verified");
                if (first) openFinding(first.id);
              }}
            />
          )}
          {tab === t.id && t.id === "gate" && state.gate && (
            <ReleaseGatePanel
              gate={state.gate}
              findings={state.findings}
              waivers={state.waivers}
              audit={state.audit}
              trend={state.trend}
              onRequestWaiver={state.requestWaiver}
              onDecideWaiver={state.decideWaiver}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default AccessibilityComplianceCenter;
