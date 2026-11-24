"use client";

/** Eight quality-gate cards with budgets, evidence and local actions (#2314). */

import { StatusBadge } from "./StatusBadge";
import { formatTimestamp } from "./format";
import type { GateCard, GateEvaluation } from "./lib/gates";
import type { CiPermissions } from "./lib/permissions";

export interface GateIssueDraft {
  title: string;
  body: string;
}

export interface GateStatusCardsProps {
  evaluation: GateEvaluation | null;
  permissions?: CiPermissions;
  onSelectRun?: (runId: string) => void;
  onCreateIssue?: (draft: GateIssueDraft) => void;
  playbookUrl?: string;
}

function budgetLine(card: GateCard): string | null {
  if (!card.budget) return null;
  const comparator = card.kind === "coverage" || card.kind === "mutation" ? "≥" : "≤";
  const tolerance = card.budget.tolerance !== undefined ? ` (±${card.budget.tolerance}${card.budget.unit})` : "";
  return `${card.budget.label} ${comparator} ${card.budget.target}${card.budget.unit}${tolerance}`;
}

function issueDraft(card: GateCard): GateIssueDraft {
  return {
    title: `[CI gate] ${card.label} ${card.status}`,
    body: [
      `Gate: ${card.label} (${card.kind})`,
      `Status: ${card.status}`,
      card.headline ? `Observed: ${card.headline}` : "",
      budgetLine(card) ? `Budget: ${budgetLine(card)}` : "",
      card.runId ? `Run: ${card.runId}` : "",
      "",
      "Evidence:",
      ...card.reasons.map((reason) => `- ${reason}`),
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function GateStatusCards({
  evaluation,
  permissions,
  onSelectRun,
  onCreateIssue,
  playbookUrl,
}: GateStatusCardsProps) {
  if (!evaluation) {
    return (
      <section className="card card-padding" aria-label="Quality gates">
        <p className="text-meta">No gate evaluation has loaded yet.</p>
      </section>
    );
  }

  return (
    <section aria-label="Quality gates" className="space-y-4">
      <div className="card card-padding flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={evaluation.status} label={`Overall: ${evaluation.status}`} />
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {evaluation.blockers.length} blocking · {evaluation.warnings.length} warning
            {evaluation.warnings.length === 1 ? "" : "s"}
          </p>
        </div>
        <p className="text-meta">Evaluated {formatTimestamp(evaluation.evaluatedAt)}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {evaluation.cards.map((card) => {
          const budget = budgetLine(card);
          return (
            <article key={card.kind} className="card card-padding flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{card.label}</h3>
                  <p className="text-meta">{card.required ? "Required" : "Advisory"}</p>
                </div>
                <StatusBadge status={card.status} />
              </div>

              <div>
                <p className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                  {card.headline}
                </p>
                {card.deltaLabel && (
                  <p className="text-meta">Change vs baseline: {card.deltaLabel}</p>
                )}
              </div>

              <p className="text-sm text-zinc-700 dark:text-zinc-300">{card.detail}</p>
              {budget && <p className="text-meta">Budget: {budget}</p>}

              <details className="text-sm">
                <summary className="cursor-pointer text-blue-700 dark:text-blue-300">
                  Evidence ({card.reasons.length})
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-700 dark:text-zinc-300">
                  {card.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </details>

              <div className="mt-auto flex flex-wrap gap-2 text-xs">
                {card.runId && onSelectRun && (
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1"
                    onClick={() => onSelectRun(card.runId!)}
                  >
                    Inspect run
                  </button>
                )}
                {onCreateIssue && (
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1"
                    onClick={() => onCreateIssue(issueDraft(card))}
                  >
                    Create issue
                  </button>
                )}
                {playbookUrl && (
                  <a
                    className="btn-ghost px-2 py-1"
                    href={playbookUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Playbook
                  </a>
                )}
                {card.links.map((link) => (
                  <a
                    key={`${link.label}:${link.url}`}
                    className="btn-ghost px-2 py-1"
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
              {permissions && !permissions.canViewLogs && (
                <p className="text-meta">Log details are hidden by your role.</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default GateStatusCards;
