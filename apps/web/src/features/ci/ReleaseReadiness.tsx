"use client";

/** Release gate roll-up with explicit blockers and warnings (#2314). */

import { StatusBadge } from "./StatusBadge";
import { formatTimestamp } from "./format";
import type { GateEvaluation } from "./lib/gates";
import type { CiStatus } from "./lib/model";
import type { ReleaseFinding, ReleaseReadinessReport } from "./lib/release";

export interface ReleaseReadinessProps {
  report: ReleaseReadinessReport | null;
  evaluation: GateEvaluation | null;
  onSelectRun?: (runId: string) => void;
  playbookUrl?: string;
}

const REPORT_STATUS: Record<ReleaseReadinessReport["status"], CiStatus> = {
  ready: "pass",
  warning: "warn",
  blocked: "fail",
};

function FindingList({
  label,
  findings,
  onSelectRun,
}: {
  label: string;
  findings: ReleaseFinding[];
  onSelectRun?: (runId: string) => void;
}) {
  return (
    <section aria-label={label}>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {label} ({findings.length})
      </h3>
      {findings.length === 0 ? (
        <p className="text-meta mt-2">None.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {findings.map((finding) => (
            <li key={finding.id} className="card card-padding">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  <span className="text-meta uppercase">{finding.kind}</span> · {finding.title}
                </p>
                <span className="text-meta">{finding.severity}</span>
              </div>
              <p className="text-meta mt-1">{finding.detail}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                {finding.evidence.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {finding.runId && onSelectRun && (
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1"
                    onClick={() => onSelectRun(finding.runId!)}
                  >
                    Inspect run
                  </button>
                )}
                {finding.link && (
                  <a className="btn-ghost px-2 py-1" href={finding.link} target="_blank" rel="noreferrer">
                    Open evidence
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ReleaseReadiness({
  report,
  evaluation,
  onSelectRun,
  playbookUrl,
}: ReleaseReadinessProps) {
  if (!report || !evaluation) {
    return (
      <section className="card card-padding" aria-label="Release readiness">
        <p className="text-meta">No release assessment has loaded yet.</p>
      </section>
    );
  }

  return (
    <section aria-label="Release readiness" className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Release readiness</h2>
        <p className="text-meta">
          Rolls up required gates, checks, flakes, incidents and correlated regressions. Checked{" "}
          {formatTimestamp(report.checkedAt)}.
        </p>
      </div>

      <div className="card card-padding flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={REPORT_STATUS[report.status]} label={`Release: ${report.status}`} />
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{report.summary}</p>
        </div>
        <p className="text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
          {report.score}<span className="text-meta">/100</span>
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">Gate budget summary</caption>
          <thead className="bg-zinc-50 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            <tr>
              <th scope="col" className="px-3 py-2">Gate</th>
              <th scope="col" className="px-3 py-2">Status</th>
              <th scope="col" className="px-3 py-2">Observed</th>
              <th scope="col" className="px-3 py-2">Budget</th>
              <th scope="col" className="px-3 py-2">Required</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {evaluation.cards.map((card) => (
              <tr key={card.kind}>
                <td className="px-3 py-2">{card.label}</td>
                <td className="px-3 py-2"><StatusBadge status={card.status} /></td>
                <td className="px-3 py-2">{card.headline}</td>
                <td className="px-3 py-2 text-meta">
                  {card.budget
                    ? `${card.budget.label} ${card.kind === "coverage" || card.kind === "mutation" ? "≥" : "≤"} ${card.budget.target}${card.budget.unit}`
                    : "execution status only"}
                </td>
                <td className="px-3 py-2">{card.required ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FindingList label="Blockers" findings={report.blockers} onSelectRun={onSelectRun} />
        <FindingList label="Warnings" findings={report.warnings} onSelectRun={onSelectRun} />
      </div>

      {playbookUrl && (
        <p className="text-meta">
          <a className="underline" href={playbookUrl} target="_blank" rel="noreferrer">
            Read the gate and release playbook
          </a>
        </p>
      )}
    </section>
  );
}

export default ReleaseReadiness;
