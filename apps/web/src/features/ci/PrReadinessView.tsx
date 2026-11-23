"use client";

/**
 * PR/branch readiness: run rollups, per-job drill-down and failure
 * correlation. Reruns are selectable from the detail panel (#2314).
 */

import { Fragment, useMemo } from "react";
import { StatusBadge } from "./StatusBadge";
import { confidenceLabel, formatBytes, formatDuration, formatTimestamp, shortSha } from "./format";
import type { IssueDraft } from "./hooks/useCiQuality";
import type { Correlation } from "./lib/correlation";
import type { CiRun } from "./lib/model";
import { runGroupKey } from "./lib/model";
import type { CiPermissions } from "./lib/permissions";
import { checkStatus, isBlockingCheck, normalizeConclusion, runStatus } from "./lib/status";

export interface PrReadinessViewProps {
  runs: CiRun[];
  allRuns?: CiRun[];
  correlations: Correlation[];
  permissions?: CiPermissions;
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  onCreateIssue?: (draft: IssueDraft) => void;
  title?: string;
  description?: string;
}

function failedStepLines(run: CiRun): string[] {
  return run.jobs.flatMap((job) =>
    job.steps
      .filter((step) => normalizeConclusion(step.conclusion, step.status) === "fail")
      .map((step) => {
        const messages = step.annotations
          .filter((annotation) => annotation.level === "failure")
          .map((annotation) => annotation.message);
        return `- ${job.name} / ${step.name}${messages.length ? `: ${messages.join("; ")}` : ""}`;
      }),
  );
}

function runIssueDraft(run: CiRun): IssueDraft {
  const failures = failedStepLines(run);
  return {
    title: `[CI] ${run.workflowName} failed on ${run.branch}`,
    body: [
      `Run: ${run.id}`,
      `Commit: ${run.commitSha}`,
      run.prNumber ? `PR: #${run.prNumber}` : "",
      `Status: ${runStatus(run)}`,
      "",
      failures.length ? "Failed steps:" : "No failed steps were reported.",
      ...failures,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function PrReadinessView({
  runs,
  allRuns,
  correlations,
  permissions,
  selectedRunId,
  onSelectRun,
  onCreateIssue,
  title = "Pull-request readiness",
  description = "Latest attempt per workflow. Expand a run to inspect jobs, steps, checks and artifacts.",
}: PrReadinessViewProps) {
  const attempts = useMemo(() => {
    const grouped = new Map<string, CiRun[]>();
    for (const run of allRuns ?? runs) {
      const key = runGroupKey(run);
      const bucket = grouped.get(key);
      if (bucket) bucket.push(run);
      else grouped.set(key, [run]);
    }
    for (const bucket of grouped.values()) {
      bucket.sort((a, b) => b.attempt - a.attempt || b.updatedAt.localeCompare(a.updatedAt));
    }
    return grouped;
  }, [allRuns, runs]);

  const summary = useMemo(() => {
    const failed = runs.filter((run) => runStatus(run) === "fail").length;
    const pending = runs.filter((run) => runStatus(run) === "pending").length;
    const blockingChecks = runs.reduce(
      (total, run) => total + run.checks.filter(isBlockingCheck).length,
      0,
    );
    return { failed, pending, blockingChecks };
  }, [runs]);

  const selected = (allRuns ?? runs).find((run) => run.id === selectedRunId) ?? null;
  const reruns = selected
    ? (attempts.get(runGroupKey(selected)) ?? []).filter((run) => run.id !== selected.id)
    : [];

  if (!runs.length) {
    return (
      <section className="card card-padding" aria-label={title}>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
        <p className="text-meta mt-2">No runs match the current filters.</p>
      </section>
    );
  }

  return (
    <section aria-label={title} className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
        <p className="text-meta">{description}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card card-padding">
          <p className="text-meta">Failed runs</p>
          <p className="text-xl font-semibold">{summary.failed}</p>
        </div>
        <div className="card card-padding">
          <p className="text-meta">Blocking checks</p>
          <p className="text-xl font-semibold">{summary.blockingChecks}</p>
        </div>
        <div className="card card-padding">
          <p className="text-meta">In progress</p>
          <p className="text-xl font-semibold">{summary.pending}</p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">{title} run list</caption>
          <thead className="bg-zinc-50 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            <tr>
              <th scope="col" className="px-3 py-2">Status</th>
              <th scope="col" className="px-3 py-2">Run</th>
              <th scope="col" className="px-3 py-2">Commit</th>
              <th scope="col" className="px-3 py-2">Branch / PR</th>
              <th scope="col" className="px-3 py-2">Duration</th>
              <th scope="col" className="px-3 py-2">Checks</th>
              <th scope="col" className="px-3 py-2">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {runs.map((run) => {
              const status = runStatus(run);
              const blocking = run.checks.filter(isBlockingCheck).length;
              const expanded = run.id === selectedRunId;
              return (
                <Fragment key={run.id}>
                  <tr className={expanded ? "bg-blue-50/50 dark:bg-blue-950/20" : undefined}>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-left"
                        aria-expanded={expanded}
                        aria-controls={`ci-run-detail-${run.id}`}
                        onClick={() => onSelectRun(run.id)}
                      >
                        <StatusBadge status={status} />
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{run.workflowName}</span>
                      <span className="block text-meta">{run.id}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs">{shortSha(run.commitSha)}</span>
                      <span className="block text-meta">{run.author}</span>
                    </td>
                    <td className="px-3 py-2">
                      {run.branch}
                      {run.prNumber !== undefined && (
                        <span className="block text-meta">PR #{run.prNumber}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{formatDuration(run.durationMs)}</td>
                    <td className="px-3 py-2">
                      {blocking ? (
                        <span className="text-rose-700 dark:text-rose-300">{blocking} blocking</span>
                      ) : (
                        <span className="text-emerald-700 dark:text-emerald-300">clear</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{formatTimestamp(run.updatedAt)}</td>
                  </tr>
                  {expanded && (
                    <tr id={`ci-run-detail-${run.id}`}>
                      <td colSpan={7} className="bg-zinc-50/70 px-4 py-4 dark:bg-zinc-900/50">
                        <RunDetail
                          run={run}
                          reruns={reruns}
                          permissions={permissions}
                          onSelectRun={onSelectRun}
                          onCreateIssue={onCreateIssue}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <section aria-label="Failure correlations" className="card card-padding">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Failure correlations
        </h3>
        {correlations.length === 0 ? (
          <p className="text-meta mt-2">No known regression, incident or change matches these failures.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {correlations.map((item) => (
              <li key={item.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    <span className="text-meta uppercase">{item.kind}</span> · {item.title}
                  </p>
                  <span className="text-meta">
                    {confidenceLabel(item.confidence)} confidence · rule: {item.rule}
                  </span>
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                  {item.evidence.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="text-meta mt-2">{item.signals.length} matching signal(s)</p>
                {item.link && (
                  <a className="btn-ghost mt-2 px-2 py-1 text-xs" href={item.link} target="_blank" rel="noreferrer">
                    Open evidence
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

interface RunDetailProps {
  run: CiRun;
  reruns: CiRun[];
  permissions?: CiPermissions;
  onSelectRun: (runId: string) => void;
  onCreateIssue?: (draft: IssueDraft) => void;
}

function RunDetail({ run, reruns, permissions, onSelectRun, onCreateIssue }: RunDetailProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Jobs and steps</h4>
        <div className="mt-2 space-y-2">
          {run.jobs.map((job) => {
            const jobStatus = normalizeConclusion(job.conclusion, job.status);
            return (
              <details key={job.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{job.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-meta">{formatDuration(job.durationMs)}</span>
                    <StatusBadge status={jobStatus} />
                  </span>
                </summary>
                <ul className="mt-3 space-y-2">
                  {job.steps.map((step) => {
                    const stepStatus = normalizeConclusion(step.conclusion, step.status);
                    return (
                      <li key={step.id} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                        <span>
                          <StatusBadge status={stepStatus} />
                          <span className="ml-2">{step.name}</span>
                          {step.annotations.map((annotation) => (
                            <span
                              key={`${annotation.level}:${annotation.message}`}
                              className="block text-meta"
                            >
                              {annotation.level}: {annotation.message}
                            </span>
                          ))}
                        </span>
                        <span className="text-meta">
                          {formatDuration(step.durationMs)}
                          {permissions?.canViewLogs && step.logUrl && (
                            <>
                              {" · "}
                              <a href={step.logUrl} target="_blank" rel="noreferrer">
                                Logs
                              </a>
                            </>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {job.artifacts.length > 0 && (
                  <p className="text-meta mt-3">
                    Artifacts:{" "}
                    {job.artifacts.map((artifact) => (
                      <a
                        key={artifact.id}
                        className="mr-2 underline"
                        href={artifact.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {artifact.name} ({formatBytes(artifact.sizeBytes)})
                      </a>
                    ))}
                  </p>
                )}
              </details>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Required checks</h4>
          <ul className="mt-2 space-y-1 text-sm">
            {run.checks.map((check) => (
              <li key={check.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {check.required ? <span className="text-meta">required · </span> : null}
                  {check.name}
                </span>
                <StatusBadge status={checkStatus(check)} />
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Rerun history</h4>
          {reruns.length === 0 ? (
            <p className="text-meta mt-1">This is the only recorded attempt.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {reruns.map((attempt) => (
                <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Attempt {attempt.attempt} · {formatTimestamp(attempt.updatedAt)}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1 text-xs"
                    onClick={() => onSelectRun(attempt.id)}
                  >
                    Inspect
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-meta mt-2">Normalized status uses the latest attempt, not the first failure.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {run.htmlUrl && (
            <a className="btn-outline px-2 py-1 text-xs" href={run.htmlUrl} target="_blank" rel="noreferrer">
              Open provider run
            </a>
          )}
          {onCreateIssue && (
            <button
              type="button"
              className="btn-outline px-2 py-1 text-xs"
              onClick={() => onCreateIssue(runIssueDraft(run))}
            >
              Create issue from failures
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PrReadinessView;
