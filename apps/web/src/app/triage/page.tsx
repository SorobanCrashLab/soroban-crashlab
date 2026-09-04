"use client";

/**
 * Issue Triage Board page – /triage
 * Implements frontend Issue triage board UI for improved UX.
 *
 * Features: kanban-style columns (Failed / Active / Cancelled),
 * loading/error states, keyboard accessibility, responsive layout,
 * live issue data fetched from the /api/runs/[id]/issues endpoint.
 */

import { useEffect, useRef, useState } from "react";
import type { FuzzingRun, RunIssueLink } from "../types";
import { fetchRuns as fetchRunsFromApi } from "../../lib/api-client";
import {
  TRIAGE_COLUMNS,
  getColumnRuns,
  getRunsWithIssues,
  getIssueCounts,
  type TriageColumnDef,
} from "./triage-board-utils";
import {
  createInitialState,
  handleLift as liftCard,
  handleDrop,
  handleCancel,
  handleMove,
  getRovingTabIndex,
  type KeyboardBoardState,
} from "./triage-board-keyboard";

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchRuns(): Promise<FuzzingRun[]> {
  const data = await fetchRunsFromApi();
  return data.runs ?? [];
}

async function fetchIssuesForRuns(
  runs: FuzzingRun[],
): Promise<Map<string, RunIssueLink[]>> {
  const issueMap = new Map<string, RunIssueLink[]>();

  const results = await Promise.allSettled(
    runs.map(async (run) => {
      const res = await fetch(`/api/runs/${run.id}/issues`);
      if (!res.ok) return;
      const data = await res.json();
      issueMap.set(run.id, (data.data?.issues ?? []) as RunIssueLink[]);
    }),
  );

  void results;

  return issueMap;
}

async function loadTriageData(): Promise<FuzzingRun[]> {
  const runs = await fetchRuns();
  const issueMap = await fetchIssuesForRuns(runs);
  return getRunsWithIssues(runs, issueMap);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type PageDataState = "loading" | "success" | "error";
type TriageFilter = "all" | TriageColumnDef["id"];

const SEVERITY_DOT: Record<string, string> = {
  low: "bg-zinc-400",
  medium: "bg-amber-400",
  high: "bg-orange-500",
  critical: "bg-rose-600",
};

const COLUMN_STYLE: Record<
  string,
  { bg: string; border: string; badge: string }
> = {
  failed: {
    bg: "bg-rose-50/50 dark:bg-rose-950/10",
    border: "border-rose-100 dark:border-rose-900/30",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  },
  active: {
    bg: "bg-blue-50/50 dark:bg-blue-950/10",
    border: "border-blue-100 dark:border-blue-900/30",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  cancelled: {
    bg: "bg-zinc-50/50 dark:bg-zinc-950/10",
    border: "border-zinc-200 dark:border-zinc-800",
    badge: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function LoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading triage board"
      className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-2xl border p-5 space-y-3 min-h-[320px]"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <div className="skeleton h-5 w-24" />
          {Array.from({ length: 4 }).map((_, j) => (
            <div key={j} className="skeleton h-16 w-full" />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 py-20 text-center"
    >
      <p className="text-meta">Failed to load triage data. Check your connection and try again.</p>
      <button
        type="button"
        onClick={onRetry}
        className="btn-primary text-xs sm:text-sm"
      >
        Retry
      </button>
    </div>
  );
}

function IssueBadge({ issue }: { issue: RunIssueLink }) {
  return (
    <a
      href={issue.href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold truncate max-w-[120px] sm:max-w-[180px]"
      style={{
        background: 'var(--highlight-bg)',
        color: '#0A66C2',
      }}
      title={issue.label}
    >
      <svg
        className="w-3 h-3 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101"
        />
      </svg>
      <span className="truncate">{issue.label}</span>
    </a>
  );
}

function RunCard({
  run,
  colId,
  colIndex,
  isFirstInBoard,
  kbState,
  onLift,
  onKeyNav,
}: {
  run: FuzzingRun;
  colId: string;
  colIndex: number;
  isFirstInBoard: boolean;
  kbState: KeyboardBoardState;
  onLift: (id: string, pos: { col: string; index: number }) => void;
  onKeyNav: (e: React.KeyboardEvent, id: string) => void;
}) {
  const issues = run.associatedIssues ?? [];
  const isLifted = kbState.liftedId === run.id;
  const tabIndex = getRovingTabIndex(run.id, kbState.focusedId, isFirstInBoard);
  return (
    <article
      tabIndex={tabIndex}
      data-card-id={run.id}
      onKeyDown={(e) => onKeyNav(e, run.id)}
      onFocus={() => {}}
      onClick={() => onLift(run.id, { col: colId, index: colIndex })}
      className={`p-4 rounded-xl border shadow-sm hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#0A66C2] focus-visible:ring-offset-2 transition-all outline-none ${
        isLifted ? 'ring-2 ring-amber-500 border-amber-300 bg-amber-50 dark:bg-amber-950/20 shadow-lg scale-[1.02]' : ''
      }`}
      style={{
        background: isLifted ? undefined : 'var(--surface)',
        borderColor: isLifted ? undefined : 'var(--border-color)',
      }}
      aria-label={`Run ${run.id}, area ${run.area}, severity ${run.severity}${isLifted ? ', lifted' : ''}`}
      aria-selected={isLifted}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-xs font-bold" style={{ color: '#0A66C2' }}>
          {run.id}
        </span>
        <span
          className={`h-2 w-2 rounded-full ${SEVERITY_DOT[run.severity] ?? "bg-zinc-400"}`}
          aria-label={`Severity: ${run.severity}`}
        />
      </div>
      <div className="text-sm font-semibold mb-2 capitalize">
        {run.area}
      </div>
      <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        <span className="uppercase tracking-wide font-semibold">
          {run.severity}
        </span>
        <span>{Math.round(run.seedCount / 1000)}k seeds</span>
      </div>
      {run.crashDetail && (
        <div
          className="mt-2 text-[11px] text-rose-600 dark:text-rose-400 truncate"
          title={run.crashDetail.failureCategory}
        >
          {run.crashDetail.failureCategory}
        </div>
      )}
      {issues.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {issues.map((issue) => (
            <IssueBadge key={issue.href} issue={issue} />
          ))}
        </div>
      )}
    </article>
  );
}

function TriageColumn({
  col,
  runs,
  kbState,
  onLift,
  onKeyNav,
  firstBoardId,
}: {
  col: TriageColumnDef;
  runs: FuzzingRun[];
  kbState: KeyboardBoardState;
  onLift: (id: string, pos: { col: string; index: number }) => void;
  onKeyNav: (e: React.KeyboardEvent, id: string) => void;
  firstBoardId: string | null;
}) {
  const style = COLUMN_STYLE[col.id];
  return (
    <section
      aria-labelledby={`col-${col.id}`}
      className={`flex flex-col rounded-2xl border ${style.border} ${style.bg} p-5 min-h-[400px]`}
    >
      <div className="flex items-center justify-between mb-5">
        <h2
          id={`col-${col.id}`}
          className="font-bold text-lg"
        >
          {col.title}
        </h2>
        <span
          className={`text-xs font-bold px-2.5 py-1 rounded-full ${style.badge}`}
        >
          {runs.length}
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {runs.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-40 border-2 border-dashed rounded-xl text-xs font-medium"
            style={{
              borderColor: 'var(--border-color)',
              color: 'var(--text-secondary)',
            }}
          >
            No items
          </div>
        ) : (
          runs.map((run, idx) => (
            <RunCard
              key={run.id}
              run={run}
              colId={col.id}
              colIndex={idx}
              isFirstInBoard={run.id === firstBoardId}
              kbState={kbState}
              onLift={onLift}
              onKeyNav={onKeyNav}
            />
          ))
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function TriageBoardPage() {
  const [dataState, setDataState] = useState<PageDataState>("loading");
  const [runs, setRuns] = useState<FuzzingRun[]>([]);
  const [activeFilter, setActiveFilter] = useState<TriageFilter>("all");
  const filterButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    let cancelled = false;
    loadTriageData()
      .then((data) => {
        if (!cancelled) {
          setRuns(data);
          setDataState("success");
        }
      })
      .catch(() => {
        if (!cancelled) setDataState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRetry = () => {
    setDataState("loading");
    setRuns([]);
    loadTriageData()
      .then((data) => {
        setRuns(data);
        setDataState("success");
      })
      .catch(() => setDataState("error"));
  };

  const totalIssues = getIssueCounts(runs);
  const visibleColumns =
    activeFilter === "all"
      ? TRIAGE_COLUMNS
      : TRIAGE_COLUMNS.filter((column) => column.id === activeFilter);

  // #1405: keyboard-complete triage board (roving tabindex, lift-and-move)
  const [kbState, setKbState] = useState<KeyboardBoardState>(createInitialState(null));
  const allVisibleRuns = visibleColumns.flatMap((c) => getColumnRuns(runs, c));
  const firstBoardId = allVisibleRuns[0]?.id ?? null;

  // Until a card has been focused, the roving tabindex points at the first
  // card in the board. Derived during render rather than synced through an
  // effect: setting state from an effect body triggers a cascading render.
  const kbStateForBoard: KeyboardBoardState =
    kbState.focusedId || !firstBoardId ? kbState : { ...kbState, focusedId: firstBoardId };

  const handleLift = (id: string, pos: { col: string; index: number }) => {
    setKbState((prev) => {
      if (prev.liftedId === id) return handleDrop(prev, pos.col);
      if (prev.liftedId) return handleDrop(prev, pos.col);
      return liftCard(prev, id, pos);
    });
  };

  const handleKeyNav = (e: React.KeyboardEvent, id: string) => {
    const columns = visibleColumns.map((c) => c.id);
    const colForId = visibleColumns.find((c) => getColumnRuns(runs, c).some((r) => r.id === id))?.id ?? columns[0];
    const idx = allVisibleRuns.findIndex((r) => r.id === id);
    if (e.key === ' ') {
      e.preventDefault();
      const pos = { col: colForId, index: Math.max(0, idx) };
      handleLift(id, pos);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setKbState((prev) => handleCancel(prev));
    } else if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const dirMap: Record<string, 'up' | 'down' | 'left' | 'right' | 'home' | 'end'> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Home: 'home', End: 'end',
      };
      const dir = dirMap[e.key];
      // Move focus via DOM (roving tabindex) - find next card
      let nextIdx = idx;
      if (dir === 'up' || dir === 'left') nextIdx = Math.max(0, idx - 1);
      if (dir === 'down' || dir === 'right') nextIdx = Math.min(allVisibleRuns.length - 1, idx + 1);
      if (dir === 'home') nextIdx = 0;
      if (dir === 'end') nextIdx = allVisibleRuns.length - 1;
      const nextId = allVisibleRuns[nextIdx]?.id;
      if (nextId) {
        // If lifted, announce move target
        if (kbState.liftedId) {
          const colSizes: Record<string, number> = {};
          visibleColumns.forEach((c) => { colSizes[c.id] = getColumnRuns(runs, c).length; });
          setKbState((prev) => handleMove(prev, dir, columns, colSizes));
        }
        setKbState((prev) => ({ ...prev, focusedId: nextId }));
        // Focus DOM
        requestAnimationFrame(() => {
          document.querySelector<HTMLElement>(`[data-card-id="${nextId}"]`)?.focus();
        });
      }
    }
  };

  const handleFilterKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const buttons = filterButtonRefs.current.filter(
      (button): button is HTMLButtonElement => button !== null,
    );
    if (buttons.length === 0) return;

    let nextIndex = index;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % buttons.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + buttons.length) % buttons.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = buttons.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    buttons[nextIndex]?.focus();
  };

  return (
    <div className="container-full page-padding fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="heading-page">Issue Triage Board</h1>
          <p className="text-meta mt-0.5 sm:mt-1">
            Manage failures and active campaigns in a kanban-style view.
            {dataState === "success" && totalIssues > 0 && (
              <span
                className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{
                  background: 'var(--highlight-bg)',
                  color: '#0A66C2',
                }}
              >
                {totalIssues} linked {totalIssues === 1 ? "issue" : "issues"}
              </span>
            )}
          </p>
        </div>
      </div>

      {dataState === "loading" && <LoadingSkeleton />}
      {dataState === "error" && <ErrorState onRetry={handleRetry} />}

      {dataState === "success" && (
        <>
          <div
            role="group"
            aria-label="Filter triage columns"
            className="mb-4 flex flex-wrap items-center gap-2"
          >
            {(["all", ...TRIAGE_COLUMNS.map((column) => column.id)] as TriageFilter[]).map((filter, index) => {
              const isActive = activeFilter === filter;
              const label = filter === "all" ? "All" : TRIAGE_COLUMNS.find((column) => column.id === filter)?.title ?? filter;

              return (
                <button
                  key={filter}
                  ref={(element) => {
                    filterButtonRefs.current[index] = element;
                  }}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveFilter(filter)}
                  onKeyDown={(event) => handleFilterKeyDown(event, index)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:ring-offset-2 dark:focus:ring-offset-zinc-950 ${
                    isActive
                      ? "border-[#0A66C2] bg-[#0A66C2] text-white"
                      : "border-zinc-300 bg-white text-zinc-700 hover:border-[#0A66C2] hover:text-[#0A66C2] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* #1405: aria-live announcements (assertive for drop/cancel, polite for lift/move) */}
          <div aria-live={kbState.liftedId ? 'polite' : 'polite'} aria-atomic="true" className="sr-only" role="status">
            {kbState.announcement}
          </div>
          <div aria-live="assertive" aria-atomic="true" className="sr-only" role="alert">
            {kbState.announcement.includes('Dropped') || kbState.announcement.includes('Cancelled') ? kbState.announcement : ''}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6" role="region" aria-label="Triage board - one tab stop, arrows navigate, Space lifts/drops, Escape cancels">
            {visibleColumns.map((col) => (
            <TriageColumn
              key={col.id}
              col={col}
              runs={getColumnRuns(runs, col)}
              kbState={kbStateForBoard}
              onLift={handleLift}
              onKeyNav={handleKeyNav}
              firstBoardId={firstBoardId}
            />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
