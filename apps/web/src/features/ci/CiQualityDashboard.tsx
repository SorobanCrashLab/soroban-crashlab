"use client";

/**
 * CI Checks & Quality Gates Dashboard (#2314).
 *
 * Accessible tabbed shell for PR, branch, gate, flake and release views with
 * filters, saved views, share links, subscriptions and notifications.
 */

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { FlakeInsights } from "./FlakeInsights";
import { GateStatusCards } from "./GateStatusCards";
import { PrReadinessView } from "./PrReadinessView";
import { ReleaseReadiness } from "./ReleaseReadiness";
import { formatTimestamp } from "./format";
import { useCiQuality } from "./hooks/useCiQuality";
import { CI_STATUS_OPTIONS, runStatus } from "./lib/status";
import { GATE_KINDS } from "./lib/model";
import type { ViewState } from "./lib/saved-views";

const TABS = [
  { id: "pr", label: "PR readiness" },
  { id: "branch", label: "Branch" },
  { id: "gates", label: "Quality gates" },
  { id: "flakes", label: "Flakes" },
  { id: "release", label: "Release" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function asTabId(view: ViewState["view"]): TabId {
  return TABS.some((tab) => tab.id === view) ? (view as TabId) : "pr";
}

export interface CiQualityDashboardProps {
  /** Optional repository label; the API payload remains authoritative. */
  title?: string;
}

export function CiQualityDashboard({ title = "CI Checks & Quality Gates" }: CiQualityDashboardProps) {
  const state = useCiQuality();
  const [tab, setTab] = useState<TabId>(() => asTabId(state.viewState.view));
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    pr: null,
    branch: null,
    gates: null,
    flakes: null,
    release: null,
  });
  const [viewName, setViewName] = useState("");
  const [subscriptionTarget, setSubscriptionTarget] = useState("");
  const [subscriptionKind, setSubscriptionKind] = useState<
    "gate-regression" | "required-check-failure"
  >("gate-regression");

  const activate = (id: TabId, focus = false) => {
    setTab(id);
    state.updateView({ view: id });
    if (focus) tabRefs.current[id]?.focus();
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.findIndex((item) => item.id === tab);
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    if (next !== null) {
      event.preventDefault();
      activate(TABS[next].id, true);
    }
  };

  const inspectRun = (runId: string) => {
    state.selectRun(runId);
    setTab(asTabId(state.viewState.view === "gates" || state.viewState.view === "release" ? "pr" : state.viewState.view));
  };

  const displayedRuns = state.viewState.onlyFailures
    ? state.runs.filter((run) => runStatus(run) === "fail")
    : state.runs;

  const panelFor = (id: TabId) => {
    switch (id) {
      case "pr":
      case "branch":
        return (
          <PrReadinessView
            runs={displayedRuns}
            allRuns={state.allRuns}
            correlations={state.correlations}
            permissions={state.permissions}
            selectedRunId={state.selectedRunId}
            onSelectRun={state.selectRun}
            onCreateIssue={state.createIssue}
            title={id === "pr" ? "Pull-request readiness" : "Branch readiness"}
            description={
              id === "pr"
                ? "Latest attempt per workflow. Expand a run to inspect jobs, steps, checks and artifacts."
                : "Latest attempt on the selected branch, with reruns and required-check status."
            }
          />
        );
      case "gates":
        return (
          <GateStatusCards
            evaluation={state.evaluation}
            permissions={state.permissions}
            onSelectRun={inspectRun}
            onCreateIssue={state.createIssue}
            playbookUrl={state.playbookUrl}
          />
        );
      case "flakes":
        return <FlakeInsights flakes={state.flakes} onFocusTest={state.focusTest} />;
      case "release":
        return (
          <ReleaseReadiness
            report={state.releaseReport}
            evaluation={state.evaluation}
            onSelectRun={inspectRun}
            playbookUrl={state.playbookUrl}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="space-y-2">
          <Link href="/" className="text-meta inline-block underline">
            ← Back to dashboard
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
              <p className="text-meta">
                {state.repository || "SorobanCrashLab/soroban-crashlab"} · source: {state.source} ·
                data as of {formatTimestamp(state.generatedAt)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
                role: {state.role}
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
                cache: {state.freshness.state}
              </span>
              <button
                type="button"
                className="btn-outline px-3 py-1"
                onClick={() => void state.refresh(true)}
                disabled={state.isRefreshing}
              >
                {state.isRefreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>
          {state.permissionNote && <p className="text-meta">{state.permissionNote}</p>}
        </header>

        <p className="sr-only" role="status" aria-live="polite">
          {state.notice}
          {state.rateLimitNotice ? ` ${state.rateLimitNotice}` : ""}
        </p>
        {state.error && (
          <div role="alert" className="card card-padding">
            <p className="text-sm">{state.error}</p>
            <button type="button" className="btn-outline mt-3 px-3 py-1" onClick={() => void state.refresh(true)}>
              Retry
            </button>
          </div>
        )}

        {state.isLoading ? (
          <div role="status" aria-live="polite" className="text-meta py-8">
            Loading CI runs and quality gates…
          </div>
        ) : (
          <>
            <section aria-label="Dashboard filters" className="card card-padding space-y-4">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                <label className="block text-sm">
                  <span className="text-meta block">Search</span>
                  <input
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
                    value={state.viewState.q ?? ""}
                    onChange={(event) => state.updateView({ q: event.target.value || undefined })}
                    placeholder="Workflow, test, commit, author"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-meta block">Branch</span>
                  <input
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
                    value={state.viewState.branch ?? ""}
                    onChange={(event) => state.updateView({ branch: event.target.value || undefined })}
                    placeholder="main"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-meta block">PR number</span>
                  <input
                    type="number"
                    min={1}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
                    value={state.viewState.pr ?? ""}
                    onChange={(event) =>
                      state.updateView({
                        pr: event.target.value ? Number.parseInt(event.target.value, 10) : undefined,
                      })
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-meta block">Gate</span>
                  <select
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
                    value={state.viewState.gate ?? ""}
                    onChange={(event) =>
                      state.updateView({ gate: (event.target.value || undefined) as ViewState["gate"] })
                    }
                  >
                    <option value="">All gates</option>
                    {GATE_KINDS.map((kind) => (
                      <option key={kind} value={kind}>{kind}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-meta block">Status</span>
                  <select
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
                    value={state.viewState.status ?? ""}
                    onChange={(event) =>
                      state.updateView({ status: (event.target.value || undefined) as ViewState["status"] })
                    }
                  >
                    <option value="">All statuses</option>
                    {CI_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(state.viewState.onlyFailures)}
                    onChange={(event) => state.updateView({ onlyFailures: event.target.checked || undefined })}
                  />
                  Only failed runs
                </label>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor="ci-share-url">Share URL</label>
                  <input
                    id="ci-share-url"
                    readOnly
                    className="min-w-[240px] flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
                    value={state.shareUrl}
                  />
                  <button type="button" className="btn-outline px-2 py-1 text-xs" onClick={() => void state.copyShareUrl()}>
                    Copy link
                  </button>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <details className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                  <summary className="cursor-pointer text-sm font-medium">Saved views</summary>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      aria-label="New saved view name"
                      className="min-w-[160px] flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
                      value={viewName}
                      onChange={(event) => setViewName(event.target.value)}
                      placeholder="View name"
                    />
                    <button
                      type="button"
                      className="btn-outline px-2 py-1 text-xs"
                      onClick={() => {
                        state.saveView(viewName);
                        setViewName("");
                      }}
                    >
                      Save current
                    </button>
                  </div>
                  {state.savedViews.length > 0 && (
                    <ul className="mt-3 space-y-2 text-sm">
                      {state.savedViews.map((saved) => (
                        <li key={saved.id} className="flex flex-wrap items-center justify-between gap-2">
                          <button type="button" className="underline" onClick={() => state.loadView(saved.id)}>
                            {saved.name}
                          </button>
                          <button
                            type="button"
                            className="text-meta"
                            onClick={() => state.deleteView(saved.id)}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </details>

                <details className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                  <summary className="cursor-pointer text-sm font-medium">Subscriptions</summary>
                  {state.permissions?.canManageSubscriptions ? (
                    <>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <input
                          aria-label="Subscription target"
                          className="min-w-[160px] flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
                          value={subscriptionTarget}
                          onChange={(event) => setSubscriptionTarget(event.target.value)}
                          placeholder="all, branch:main, pr:2314"
                        />
                        <select
                          aria-label="Notification kind"
                          className="rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
                          value={subscriptionKind}
                          onChange={(event) =>
                            setSubscriptionKind(event.target.value as typeof subscriptionKind)
                          }
                        >
                          <option value="gate-regression">Gate regression</option>
                          <option value="required-check-failure">Required check failure</option>
                        </select>
                        <button
                          type="button"
                          className="btn-outline px-2 py-1 text-xs"
                          onClick={() => {
                            state.subscribe(subscriptionTarget, [subscriptionKind]);
                            setSubscriptionTarget("");
                          }}
                        >
                          Subscribe
                        </button>
                      </div>
                      {state.subscriptions.length > 0 && (
                        <ul className="mt-3 space-y-2 text-sm">
                          {state.subscriptions.map((subscription) => (
                            <li key={subscription.id} className="flex flex-wrap items-center justify-between gap-2">
                              <span>{subscription.target} · {subscription.kinds.join(", ")}</span>
                              <button
                                type="button"
                                className="text-meta"
                                onClick={() => state.unsubscribe(subscription.id)}
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p className="text-meta mt-2">
                      Subscriptions require the analyst role. Notifications below remain visible locally.
                    </p>
                  )}
                </details>
              </div>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="tablist" aria-label="CI dashboard views" className="flex flex-wrap gap-2">
                {TABS.map((item) => (
                  <button
                    key={item.id}
                    ref={(element) => {
                      tabRefs.current[item.id] = element;
                    }}
                    type="button"
                    role="tab"
                    id={`ci-tab-${item.id}`}
                    aria-selected={tab === item.id}
                    aria-controls={`ci-panel-${item.id}`}
                    tabIndex={tab === item.id ? 0 : -1}
                    className={`chip ${tab === item.id ? "chip-active" : ""}`}
                    onClick={() => activate(item.id)}
                    onKeyDown={onTabKeyDown}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {TABS.map((item) => (
              <div
                key={item.id}
                role="tabpanel"
                id={`ci-panel-${item.id}`}
                aria-labelledby={`ci-tab-${item.id}`}
                hidden={tab !== item.id}
                tabIndex={0}
              >
                {tab === item.id ? panelFor(item.id) : null}
              </div>
            ))}

            <section aria-label="Notifications" className="card card-padding">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Notifications</h2>
              {state.notifications.length === 0 ? (
                <p className="text-meta mt-2">No active gate or flake notifications.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {state.notifications.map((notification) => (
                    <li key={notification.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <span className="text-meta uppercase">{notification.kind}</span> · {notification.message}
                      </span>
                      <button
                        type="button"
                        className="text-meta"
                        onClick={() => state.dismissNotification(notification.id)}
                      >
                        Dismiss
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default CiQualityDashboard;
