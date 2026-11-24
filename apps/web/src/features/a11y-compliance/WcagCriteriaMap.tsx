"use client";

/**
 * WCAG criteria map: conformance per success criterion grouped by principle,
 * with design-system guidance for remediation (#2335).
 */
import type { CriterionConformance, WcagPrinciple } from "./model";

export interface WcagCriteriaMapProps {
  conformance: CriterionConformance[];
  onSelectCriterion?: (criterionId: string) => void;
}

const PRINCIPLES: WcagPrinciple[] = ["Perceivable", "Operable", "Understandable", "Robust"];

const STATUS_STYLE: Record<CriterionConformance["status"], { badge: string; label: string; icon: string }> = {
  conformant: { badge: "badge-completed", label: "Supports", icon: "✓" },
  partial: { badge: "badge-running", label: "Partially supports", icon: "◐" },
  "non-conformant": { badge: "badge-failed", label: "Does not support", icon: "✕" },
};

export function WcagCriteriaMap({ conformance, onSelectCriterion }: WcagCriteriaMapProps) {
  const total = conformance.length;
  const supported = conformance.filter((c) => c.status === "conformant").length;
  const pct = total ? Math.round((supported / total) * 100) : 100;

  return (
    <div className="space-y-6">
      <section aria-labelledby="a11y-wcag-overview" className="card card-padding">
        <h2 id="a11y-wcag-overview" className="heading-section mb-2">WCAG 2.2 A/AA conformance</h2>
        <p className="text-meta mb-2">
          {supported} of {total} tracked success criteria have no open findings ({pct}%).
        </p>
        <div
          role="meter"
          aria-label="Criteria fully supported"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${pct}% of criteria supported`}
          className="h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden"
        >
          <div className="h-full bg-green-600 dark:bg-green-500" style={{ width: `${pct}%` }} />
        </div>
      </section>

      {PRINCIPLES.map((principle) => {
        const rows = conformance.filter((c) => c.criterion.principle === principle);
        const headingId = `a11y-wcag-${principle.toLowerCase()}`;
        return (
          <section key={principle} aria-labelledby={headingId} className="card card-padding">
            <h2 id={headingId} className="heading-section mb-3">{principle}</h2>
            <div className="overflow-x-auto" role="region" aria-labelledby={headingId} tabIndex={0}>
              <table className="w-full text-sm">
                <caption className="sr-only">{principle} success criteria and conformance status</caption>
                <thead>
                  <tr className="text-left text-meta">
                    <th scope="col" className="py-1 pr-2 font-medium">Criterion</th>
                    <th scope="col" className="py-1 px-2 font-medium">Level</th>
                    <th scope="col" className="py-1 px-2 font-medium">Conformance</th>
                    <th scope="col" className="py-1 px-2 font-medium text-right">Open</th>
                    <th scope="col" className="py-1 px-2 font-medium text-right">Resolved</th>
                    <th scope="col" className="py-1 pl-2 font-medium">Remediation guidance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ criterion, open, resolved, status }) => {
                    const s = STATUS_STYLE[status];
                    return (
                      <tr key={criterion.id} className="border-t border-token align-top">
                        <th scope="row" className="py-2 pr-2 text-left font-normal">
                          {open > 0 && onSelectCriterion ? (
                            <button type="button" className="link text-left" onClick={() => onSelectCriterion(criterion.id)}>
                              <span className="font-mono">{criterion.id}</span> {criterion.name}
                            </button>
                          ) : (
                            <>
                              <span className="font-mono">{criterion.id}</span> {criterion.name}
                            </>
                          )}
                        </th>
                        <td className="py-2 px-2">{criterion.level}</td>
                        <td className="py-2 px-2">
                          <span className={`badge ${s.badge}`}>
                            <span aria-hidden="true">{s.icon} </span>
                            {s.label}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums">{open}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{resolved}</td>
                        <td className="py-2 pl-2 text-meta">{criterion.guidance}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
