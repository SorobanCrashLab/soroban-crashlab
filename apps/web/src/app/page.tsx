"use client";

import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import RunHistoryTable from "./implement-run-history-table-component";
import RunHistoryTableSkeleton from "./RunHistoryTableSkeleton";
import Pagination from "./Pagination";
import CrashDetailDrawer from "./CrashDetailDrawer";
import { FuzzingRun, RunStatus, RunArea, RunSeverity } from "./types";
import ReportModal from "./ReportModal";
import { generateMarkdownReport } from "./report-utils";
import CreateRunHeatmapPage55 from "./create-run-heatmap-page-55";
import AddRunComparisonCharts from "./add-run-comparison-charts";
import AddTaggingAndLabelsUi from "./add-tagging-and-labels-ui";
import AlertingSettingsPage54 from "./implement-alerting-settings-page-54";
import AlertingSettingsPage from "./create-alerting-settings-page-page";
import CrossRunBoardWidgets from "./implement-cross-run-board-widgets-component";
import CrossRunBoardCustomWidgets from "./create-cross-run-board-custom-widgets-63";
import RunClusterVisualization from "./add-run-cluster-visualization";
import RunClusterOverview from "./add-run-cluster-overview";
import ImplementRunWorkflowBoardPage58 from "./implement-run-workflow-board-page-58";
import FailureClusterView from "./FailureClusterView";
import MaintainerToggle from "./MaintainerToggle";
import { useMaintainerMode } from "./useMaintainerMode";
import AlertPresets from "./AlertPresets";
import CreateReportingTemplatesPage60 from "./create-reporting-templates-page-60";
import TimelineScrubber from "./implement-timeline-scrubber-component-component";
import ColumnCustomization, { ColumnId } from "./add-column-customization";
import IssueTriageBoard from "./add-issue-triage-board-ui";
import CampaignMilestoneTimeline from "./campaign-milestone-timeline-55";
import VirtualizedRunTable from "./implement-virtualized-run-table-component";
import ReportingTemplatesManager from "./add-reporting-templates-manager";
import AutomatedRegressionDeployIntegration from "./integrate-automated-regression-deploy-integration";
import IntegrationTestHarnessForUIFlows from "./integrate-integration-test-harness-for-ui-flows";
import ReportGenerator from "./add-report-generator";
import WidgetLayoutEditor from "./implement-widget-layout-editor-component";
import AddRunStatusTimeline from "./add-run-status-timeline";
import AddExportRunJson from "./add-export-run-json";
import AddExportRunCsv from "./add-export-run-csv";
import IntegrateWebhookManagerForRunEvents from "./integrate-webhook-manager-for-run-events";
import MetricsExportToPrometheus from "./integrate-metrics-export-to-prometheus";
import LogViewer from "./implement-log-viewer-component";
import AddAccessibleKeyboardNavBlueprint from "./add-accessible-keyboard-nav-blueprint";
import ArtifactExplorer from "./add-artifact-explorer";
import RunSeverityFilter from "./add-run-filtering-by-severity";
import AddRunTimeline from "./add-run-timeline";
import OnboardingChecklistModal from "./implement-onboarding-checklist-modal-component";
import FailureClassificationTaxonomy from "./add-failure-classification-taxonomy";
import AddAFuzzyQueryBuilderPage51 from "./add-a-fuzzy-query-builder-page-51";
import AddResponsiveLayoutImprovements from "./add-responsive-layout-improvements";
import AddKeyboardNavigationHelp from "./add-keyboard-navigation-help";
import AddRunAnnotations from "./add-run-annotations";

// Mock data for demonstration
const MOCK_RUNS: FuzzingRun[] = Array.from({ length: 25 }, (_, i) => ({
  id: `run-${1000 + i}`,
  status: ["completed", "failed", "running", "cancelled"][i % 4] as RunStatus,
  area: ["auth", "state", "budget", "xdr"][i % 4] as RunArea,
  severity: ["low", "medium", "high", "critical"][i % 4] as RunSeverity,
  duration: 120000 + Math.random() * 3600000, // 2m to 1h
  seedCount: Math.floor(10000 + Math.random() * 90000),
  cpuInstructions: Math.floor(400000 + Math.random() * 900000),
  memoryBytes: Math.floor(1_500_000 + Math.random() * 8_000_000),
  minResourceFee: Math.floor(500 + Math.random() * 5000),
  crashDetail:
    i % 4 === 1
      ? {
          failureCategory: i % 8 === 1 ? "Panic" : "InvariantViolation",
          signature: `sig:${1000 + i}:contract::transfer:assert_balance_nonnegative`,
          payload: JSON.stringify(
            {
              contract: "token",
              method: "transfer",
              args: {
                from: "GABCD...1234",
                to: "GXYZ...7890",
                amount: 999999999,
              },
            },
            null,
            2,
          ),
          replayAction: `cargo run --bin crash-replay -- --run-id run-${1000 + i}`,
        }
      : null,
})).reverse();

const ITEMS_PER_PAGE = 10;
const CPU_WARNING = 900_000;
const MEMORY_WARNING = 7_000_000;
const FEE_WARNING = 3_000;
const STATUS_OPTIONS: Array<"all" | RunStatus> = [
  "all",
  "running",
  "completed",
  "failed",
  "cancelled",
];
const ONBOARDING_SEEN_STORAGE_KEY = "crashlab:onboarding-checklist-seen:v1";
const ONBOARDING_DISMISSED_STORAGE_KEY =
  "crashlab:onboarding-checklist-dismissed:v1";

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatFee = (fee: number): string => `${fee.toLocaleString()} stroops`;

const isExpensiveRun = (run: FuzzingRun): boolean =>
  run.cpuInstructions >= CPU_WARNING ||
  run.memoryBytes >= MEMORY_WARNING ||
  run.minResourceFee >= FEE_WARNING;

const toStableQueryString = (params: URLSearchParams): string => {
  const sorted = Array.from(params.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return new URLSearchParams(sorted).toString();
};

function HomeContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [runs, setRuns] = useState<FuzzingRun[]>([]);
  const [dataState, setDataState] = useState<"loading" | "error" | "success">(
    "loading",
  );
  const [fetchAttempt, setFetchAttempt] = useState(0);
  const [selectedCardIndex, setSelectedCardIndex] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [reportRun, setReportRun] = useState<FuzzingRun | null>(null);
  const [showOnboardingChecklist, setShowOnboardingChecklist] = useState(false);
  const cardsContainerRef = useRef<HTMLDivElement>(null);
  const {
    isMaintainer,
    toggle: toggleMaintainerMode,
    mounted: maintainerMounted,
  } = useMaintainerMode();
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>([
    "id",
    "status",
    "duration",
    "seedCount",
    "report",
  ]);

  const selectedRunId = searchParams.get("run");
  const statusFilter = STATUS_OPTIONS.includes(
    (searchParams.get("status") ?? "all") as "all" | RunStatus,
  )
    ? ((searchParams.get("status") ?? "all") as "all" | RunStatus)
    : "all";
  const severityFilter = ["all", "low", "medium", "high", "critical"].includes(
    searchParams.get("severity") ?? "all",
  )
    ? ((searchParams.get("severity") ?? "all") as "all" | RunSeverity)
    : "all";
  const expensiveOnly = searchParams.get("expensive") === "1";
  const pageParam = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const currentPage =
    Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const setQueryState = useCallback(
    (updates: Record<string, string | null>) => {
      const nextParams = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "") {
          nextParams.delete(key);
          return;
        }
        nextParams.set(key, value);
      });

      const query = toStableQueryString(nextParams);
      const nextUrl = query ? `${pathname}?${query}` : pathname;
      const currentQuery = toStableQueryString(
        new URLSearchParams(searchParams.toString()),
      );
      const currentUrl = currentQuery
        ? `${pathname}?${currentQuery}`
        : pathname;
      if (nextUrl !== currentUrl) {
        router.replace(nextUrl, { scroll: false });
      }
    },
    [pathname, router, searchParams],
  );

  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      if (statusFilter !== "all" && run.status !== statusFilter) {
        return false;
      }
      if (severityFilter !== "all" && run.severity !== severityFilter) {
        return false;
      }
      if (expensiveOnly && !isExpensiveRun(run)) {
        return false;
      }
      return true;
    });
  }, [runs, statusFilter, expensiveOnly]);
  const stableQueryString = useMemo(
    () => toStableQueryString(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const hasSeenOnboarding =
          localStorage.getItem(ONBOARDING_SEEN_STORAGE_KEY) === "true";
        const hasDismissedOnboarding =
          localStorage.getItem(ONBOARDING_DISMISSED_STORAGE_KEY) === "true";

        if (!hasSeenOnboarding && !hasDismissedOnboarding) {
          localStorage.setItem(ONBOARDING_SEEN_STORAGE_KEY, "true");
          setShowOnboardingChecklist(true);
        }
      } catch {
        setShowOnboardingChecklist(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRuns.length / ITEMS_PER_PAGE),
  );
  const clampedPage = Math.min(currentPage, totalPages);
  const startIndex = (clampedPage - 1) * ITEMS_PER_PAGE;
  const paginatedRuns = filteredRuns.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );
  const expensiveRuns = paginatedRuns.filter(isExpensiveRun);
  const selectedRun = selectedRunId
    ? (runs.find((run) => run.id === selectedRunId) ?? null)
    : null;
  // Simulate async data fetch with loading and error states.
  // In production this would be a real API call (e.g. fetch('/api/runs')).
  // startTransition is used to batch the loading reset so it's treated as a
  // non-urgent update, which avoids the react-hooks/set-state-in-effect lint rule.
  useEffect(() => {
    let cancelled = false;
    // Mark the loading reset as a low-priority transition so React batches it
    // together with any concurrent work, avoiding a synchronous setState in effect.
    const ctrl = new AbortController();
    const resetAndFetch = async () => {
      setDataState("loading");
      setRuns([]);
      try {
        // Simulate a network round-trip (800ms)
        await new Promise<void>((resolve, reject) => {
          const t = window.setTimeout(() => {
            if (ctrl.signal.aborted) return;
            // ~10% chance of simulated failure to exercise the error path.
            if (Math.random() < 0.1)
              reject(new Error("Simulated network error"));
            else resolve();
          }, 800);
          ctrl.signal.addEventListener("abort", () => window.clearTimeout(t));
        });
        if (!cancelled) {
          setRuns(MOCK_RUNS);
          setDataState("success");
        }
      } catch {
        if (!cancelled) setDataState("error");
      }
    };
    // Schedule on next tick so the setState calls go through React's batching.
    const t = window.setTimeout(() => {
      void resetAndFetch();
    }, 0);
    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [fetchAttempt]);

  useEffect(() => {
    if (selectedRunId && !selectedRun) {
      setQueryState({ run: null });
    }
  }, [selectedRun, selectedRunId, setQueryState]);

  useEffect(() => {
    if (currentPage !== clampedPage) {
      setQueryState({ page: clampedPage === 1 ? null : String(clampedPage) });
    }
  }, [clampedPage, currentPage, setQueryState]);

  const handleOpenRunDrawer = useCallback(
    (runId: string) => setQueryState({ run: runId }),
    [setQueryState],
  );

  const handleCloseRunDrawer = useCallback(
    () => setQueryState({ run: null }),
    [setQueryState],
  );

  const handleReplayComplete = useCallback(
    (data: FuzzingRun | { id: string; status: "running" }) => {
      let newRun: FuzzingRun;
      if ("area" in data) {
        newRun = data;
      } else {
        newRun = {
          id: data.id,
          status: "running",
          area: "state",
          severity: "medium",
          duration: 0,
          seedCount: 0,
          crashDetail: null,
          cpuInstructions: 0,
          memoryBytes: 0,
          minResourceFee: 0,
        };
      }
      setRuns((prev) => [newRun, ...prev]);
    },
    [],
  );

  const handlePageChange = useCallback(
    (page: number) => {
      setQueryState({ page: page <= 1 ? null : String(page) });
      cardsContainerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    },
    [setQueryState],
  );

  const handleCopyPermalink = useCallback(async () => {
    try {
      const stableQuery = toStableQueryString(
        new URLSearchParams(searchParams.toString()),
      );
      const permalink = `${window.location.origin}${pathname}${stableQuery ? `?${stableQuery}` : ""}`;
      await navigator.clipboard.writeText(permalink);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    if (copyState === "idle") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const cards = [
    {
      title: "Intelligent Mutation",
      description:
        "Automatically mutate transaction envelopes and inputs to explore complex state transitions specific to Soroban.",
      icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
      color: "blue",
      details:
        "Our intelligent mutation engine uses advanced algorithms to systematically explore the state space of your Soroban contracts. It generates meaningful test cases by mutating transaction parameters, account states, and contract inputs in ways that are likely to expose edge cases and vulnerabilities.",
    },
    {
      title: "Invariant Testing",
      description:
        "Define robust invariants and property assertions. We run permutations to ensure they hold up under stress.",
      icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
      color: "purple",
      details:
        "Property-based testing for Soroban contracts. Define invariants that should always hold true, and our fuzzer will attempt to break them through millions of randomized test cases. When an invariant is violated, we provide a minimal reproducible example.",
    },
    {
      title: "Actionable Reports",
      description:
        "Get actionable, detailed execution traces when our fuzzer detects a crash, panic, or invariant breach.",
      icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
      color: "green",
      details:
        "When issues are found, CrashLab generates comprehensive reports including full execution traces, contract state at the time of failure, and suggested fixes. Reports are formatted for easy integration into your CI/CD pipeline.",
    },
  ];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const runDrawerOpen = Boolean(searchParams.get("run"));
      if (runDrawerOpen && e.key === "Escape") {
        e.preventDefault();
        handleCloseRunDrawer();
        return;
      }
      if (showDetailView && e.key !== "Escape") return;

      switch (e.key) {
        case "ArrowDown":
        case "ArrowRight":
          e.preventDefault();
          setSelectedCardIndex((prev) => (prev + 1) % cards.length);
          break;
        case "ArrowUp":
        case "ArrowLeft":
          e.preventDefault();
          setSelectedCardIndex(
            (prev) => (prev - 1 + cards.length) % cards.length,
          );
          break;
        case "Enter":
          e.preventDefault();
          setShowDetailView(true);
          break;
        case "Escape":
          e.preventDefault();
          if (showDetailView) {
            setShowDetailView(false);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showDetailView, cards.length, searchParams, handleCloseRunDrawer]);

  const handleCardClick = (index: number) => {
    setSelectedCardIndex(index);
    setShowDetailView(true);
  };

  const handleOpenOnboardingChecklist = useCallback(() => {
    setShowOnboardingChecklist(true);
    try {
      localStorage.setItem(ONBOARDING_SEEN_STORAGE_KEY, "true");
      localStorage.setItem(ONBOARDING_DISMISSED_STORAGE_KEY, "false");
    } catch {
      // ignore storage write errors
    }
  }, []);

  const handleCloseOnboardingChecklist = useCallback(() => {
    setShowOnboardingChecklist(false);
    try {
      localStorage.setItem(ONBOARDING_DISMISSED_STORAGE_KEY, "true");
    } catch {
      // ignore storage write errors
    }
  }, []);

  return (
    <div className="min-h-screen w-full">
      <AddAccessibleKeyboardNavBlueprint />
      <AddResponsiveLayoutImprovements />
      <div
        id="main-content"
        className="flex flex-col items-center justify-center py-20 px-8 max-w-5xl mx-auto w-full responsive-container"
      >
        <AddKeyboardNavigationHelp />
        <div
          id="main-content"
          className="flex flex-col items-center justify-center py-20 px-8 max-w-5xl mx-auto w-full"
        >
          {/* Role toggle */}
          <div className="w-full flex flex-wrap justify-end gap-3 mb-6">
            <button
              type="button"
              onClick={handleOpenOnboardingChecklist}
              className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200 dark:hover:border-blue-800 dark:hover:bg-blue-950/60"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Onboarding checklist
            </button>
            <MaintainerToggle
              isMaintainer={isMaintainer}
              onToggle={toggleMaintainerMode}
              mounted={maintainerMounted}
            />
          </div>

          {/* Run workflow board section */}
          <div className="w-full mb-12">
            <ImplementRunWorkflowBoardPage58 runs={runs} />
          </div>

          {/* Fuzzy query builder section */}
          <div className="w-full mb-12">
            <AddAFuzzyQueryBuilderPage51 runs={runs} />
          </div>
          {/* Cross-run board widgets section — maintainer only */}
          {isMaintainer && (
            <div className="w-full mb-12">
              <CrossRunBoardWidgets />
              <CrossRunBoardCustomWidgets runs={runs} />
            </div>
          )}

          <div className="text-center max-w-3xl mb-16">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent hero-title">
              Bulletproof Your Soroban Smart Contracts
            </h1>
            <p className="text-xl leading-8 text-zinc-600 dark:text-zinc-400">
              An advanced fuzzing and mutation testing framework designed to
              discover elusive edge cases in Stellar&apos;s Soroban ecosystem.
            </p>
          </div>

          <div
            ref={cardsContainerRef}
            className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full mb-20"
            role="list"
            aria-label="Features"
          >
            {cards.map((card, index) => {
              const isSelected = index === selectedCardIndex;
              const colorClasses = {
                blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
                purple:
                  "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400",
                green:
                  "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
              };

              return (
                <div
                  key={index}
                  role="listitem"
                  tabIndex={0}
                  onClick={() => handleCardClick(index)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleCardClick(index);
                    }
                  }}
                  className={`border rounded-xl p-8 bg-white dark:bg-zinc-950 shadow-sm transition-all hover:shadow-md cursor-pointer ${
                    isSelected
                      ? "border-blue-500 dark:border-blue-400 ring-2 ring-blue-500 dark:ring-blue-400 ring-offset-2 dark:ring-offset-zinc-900"
                      : "border-black/[.08] dark:border-white/[.145]"
                  }`}
                >
                  <div
                    className={`h-12 w-12 rounded-lg flex items-center justify-center mb-6 ${colorClasses[card.color as keyof typeof colorClasses]}`}
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d={card.icon}
                      />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{card.title}</h3>
                  <p className="text-zinc-600 dark:text-zinc-400">
                    {card.description}
                  </p>
                </div>
              );
            })}
          </div>

          {dataState === "success" && (
            <>
              <TimelineScrubber runs={runs} onSelectRun={handleOpenRunDrawer} />
              <AddRunTimeline runs={runs} onSelectRun={handleOpenRunDrawer} />
              <div className="mt-12 w-full">
                <AddRunStatusTimeline runs={runs} />
              </div>
              <div className="mt-12 w-full">
                <LogViewer />
              </div>
            </>
          )}

          {dataState === "loading" && (
            <div className="w-full h-48 rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse mb-6" />
          )}
          {dataState === "success" && <RunClusterOverview runs={runs} />}

          <div id="recent-runs" className="w-full mb-8 scroll-mt-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Recent Fuzzing Runs</h2>
              <div className="flex items-center gap-3">
                <ColumnCustomization
                  visibleColumns={visibleColumns}
                  onChange={setVisibleColumns}
                />
                <button
                  type="button"
                  onClick={handleCopyPermalink}
                  className="px-3 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
                >
                  Copy report link
                </button>
                <div className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-xs font-medium text-zinc-500">
                  {filteredRuns.length} Matching Runs
                </div>
              </div>
            </div>

            <div className="mb-4 flex flex-col md:flex-row md:items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">Status</span>
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setQueryState({
                      status: e.target.value === "all" ? null : e.target.value,
                      page: null,
                    })
                  }
                  className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
                >
                  <option value="all">All</option>
                  <option value="running">Running</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
              <RunSeverityFilter
                value={severityFilter}
                onChange={(val) =>
                  setQueryState({
                    severity: val === "all" ? null : val,
                    page: null,
                  })
                }
              />
              <label className="inline-flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300 group cursor-pointer">
                <input
                  type="checkbox"
                  checked={expensiveOnly}
                  onChange={(e) =>
                    setQueryState({
                      expensive: e.target.checked ? "1" : null,
                      page: null,
                    })
                  }
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Only expensive runs
              </label>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Shared links preserve page, selected run, and filters.
              </p>
            </div>

            {copyState === "copied" && (
              <p className="mb-3 text-sm text-green-700 dark:text-green-400">
                Permalink copied to clipboard.
              </p>
            )}
            {copyState === "failed" && (
              <p className="mb-3 text-sm text-red-700 dark:text-red-400">
                Could not copy link. Copy the URL from your browser address bar.
              </p>
            )}

            {isMaintainer && (
              <div className="mb-5 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 bg-amber-50/70 dark:bg-amber-950/20">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    Resource Fee Insight
                  </h3>
                  <span className="text-xs text-amber-800 dark:text-amber-300">
                    thresholds: cpu &ge; {CPU_WARNING.toLocaleString()}, mem
                    &ge; {formatBytes(MEMORY_WARNING)}, fee &ge;{" "}
                    {formatFee(FEE_WARNING)}
                  </span>
                </div>

                {expensiveRuns.length === 0 ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    No expensive runs on this page.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {expensiveRuns.map((run) => (
                      <li
                        key={run.id}
                        className="text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2 bg-white/60 dark:bg-zinc-900/40 rounded-lg px-3 py-2 border border-amber-100 dark:border-amber-900/40"
                      >
                        <div className="font-mono text-zinc-800 dark:text-zinc-200">
                          {run.id}
                        </div>
                        <div className="text-zinc-700 dark:text-zinc-300">
                          cpu {run.cpuInstructions.toLocaleString()} &middot;
                          mem {formatBytes(run.memoryBytes)} &middot; min fee{" "}
                          {formatFee(run.minResourceFee)}
                        </div>
                        <Link
                          href={`/runs/${run.id}`}
                          className="text-amber-700 dark:text-amber-300 hover:underline underline-offset-4 font-medium"
                        >
                          View run details
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {isMaintainer && (
              <FailureClusterView
                runs={runs}
                pathname={pathname}
                queryString={stableQueryString}
              />
            )}
            <div className="mb-8 w-full">
              <CampaignMilestoneTimeline
                runs={runs}
                dataState={dataState}
                onRetry={() => setFetchAttempt((n) => n + 1)}
                errorMessage="Timeline stream unavailable while run data is loading."
                campaignId="campaign-001"
                autoUpdateInterval={5000}
                maxEventsDisplayed={10}
              />
            </div>
            <RunHistoryTable
              runs={paginatedRuns}
              onSelectRun={handleOpenRunDrawer}
              onViewReport={setReportRun}
              onReplayRun={handleReplayComplete}
              visibleColumns={visibleColumns}
            />
            {dataState === "loading" && (
              <RunHistoryTableSkeleton rows={ITEMS_PER_PAGE} />
            )}
            {dataState === "error" && (
              <div className="flex flex-col items-center gap-4 border border-red-200 dark:border-red-900/50 rounded-xl p-8 bg-red-50/60 dark:bg-red-950/20 text-center">
                <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-red-600 dark:text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-red-900 dark:text-red-100">
                    Failed to load fuzzing runs
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    Check your connection and try again.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFetchAttempt((n) => n + 1)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all shadow active:scale-95 text-sm"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582M20 20v-5h-.581M5.635 15A9 9 0 1118.365 9"
                    />
                  </svg>
                  Retry
                </button>
              </div>
            )}
            <Pagination
              currentPage={clampedPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />

            <div className="mt-12 w-full">
              <ArtifactExplorer />
            </div>

            {/* Virtualized run table — renders all filtered runs without pagination */}
            {dataState === "success" && filteredRuns.length > 0 && (
              <div className="mt-10">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold">Virtualized Run Table</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                      All {filteredRuns.length} runs rendered in a single
                      scrollable viewport — only visible rows are in the DOM.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    Virtualized
                  </span>
                </div>
                <VirtualizedRunTable
                  runs={filteredRuns}
                  viewportHeight={480}
                  onSelectRun={handleOpenRunDrawer}
                  onViewReport={setReportRun}
                  visibleColumns={visibleColumns}
                />
              </div>
            )}

            {/* Report Generator Section */}
            {dataState === "success" && (
              <div className="mt-12 w-full">
                <ReportGenerator availableRuns={runs} />
              </div>
            )}
          </div>

          <div className="mb-12 w-full grid grid-cols-1 md:grid-cols-2 gap-8">
            <AddExportRunJson runs={filteredRuns} />
            <AddExportRunCsv runs={filteredRuns} />
          </div>

          <div className="mb-12 w-full">
            <AddRunComparisonCharts runs={filteredRuns} />
          </div>

          <div className="mb-12 w-full">
            <RunClusterVisualization
              runs={filteredRuns}
              onRunSelect={handleOpenRunDrawer}
              showTimeline={true}
              showMetrics={true}
            />
          </div>

          <div className="mb-12 w-full">
            <FailureClassificationTaxonomy runs={filteredRuns} />
          </div>

          <div className="mb-12 w-full">
            <AddTaggingAndLabelsUi runs={filteredRuns} />
          </div>

          <div className="mb-12 w-full">
            <AddRunAnnotations runs={runs} />
          </div>

          <div className="mb-12 w-full">
            <AlertPresets
              onSelectPreset={(config) =>
                console.log("Applied Alert Preset:", config)
              }
            />
          </div>

          <div className="mb-12 w-full">
            <CreateReportingTemplatesPage60 />
          </div>

          <div className="mb-12 w-full">
            <ReportingTemplatesManager />
          </div>

          <div className="mb-12 w-full">
            <AutomatedRegressionDeployIntegration />
          </div>

          <div className="mb-12 w-full">
            <IntegrationTestHarnessForUIFlows />
          </div>

          {isMaintainer && (
            <div className="mb-12 w-full">
              <CreateRunHeatmapPage55 />
            </div>
          )}

          {isMaintainer && (
            <div className="mb-12 w-full">
              <AlertingSettingsPage54 />
            </div>
          )}

          {isMaintainer && (
            <div className="mb-12 w-full">
              <WidgetLayoutEditor />
            </div>
          )}

          {isMaintainer && (
            <div className="mb-12 w-full">
              <AlertingSettingsPage />
            </div>
          )}

          {showDetailView && (
            <div
              className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4"
              onClick={() => setShowDetailView(false)}
            >
              <div
                className="bg-white dark:bg-zinc-900 rounded-xl max-w-2xl w-full p-8 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="detail-title"
              >
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div
                      className={`h-12 w-12 rounded-lg flex items-center justify-center ${
                        cards[selectedCardIndex].color === "blue"
                          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                          : cards[selectedCardIndex].color === "purple"
                            ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                            : "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                      }`}
                    >
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d={cards[selectedCardIndex].icon}
                        />
                      </svg>
                    </div>
                    <h2 id="detail-title" className="text-2xl font-bold">
                      {cards[selectedCardIndex].title}
                    </h2>
                  </div>
                  <button
                    onClick={() => setShowDetailView(false)}
                    className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                    aria-label="Close detail view"
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
                <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed mb-4">
                  {cards[selectedCardIndex].description}
                </p>
                <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4 mt-4">
                  <h3 className="font-semibold mb-2">More Details</h3>
                  <p className="text-zinc-600 dark:text-zinc-400">
                    {cards[selectedCardIndex].details}
                  </p>
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setShowDetailView(false)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                  >
                    Close (Esc)
                  </button>
                </div>
              </div>
            </div>
          )}

          {reportRun && (
            <ReportModal
              isOpen={true}
              onClose={() => setReportRun(null)}
              markdown={generateMarkdownReport(reportRun)}
              runId={reportRun.id}
            />
          )}

          <OnboardingChecklistModal
            isOpen={showOnboardingChecklist}
            onClose={handleCloseOnboardingChecklist}
          />

          {selectedRun && (
            <CrashDetailDrawer
              key={selectedRun.id}
              run={selectedRun}
              onClose={handleCloseRunDrawer}
              onReplayComplete={handleReplayComplete}
            />
          )}

          <div className="mb-12 w-full">
            <MetricsExportToPrometheus />
          </div>

          <div className="mt-12 mb-16 w-full">
            <IntegrateWebhookManagerForRunEvents />
          </div>

          <div className="mt-16 text-center border-t border-black/[.08] dark:border-white/[.145] pt-12 w-full">
            <h2 className="text-2xl font-bold mb-4">Stellar Wave 3 is Open!</h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-8 max-w-2xl mx-auto">
              We are actively looking for contributors. Check out our open
              issues to build the future of Soroban dev tooling with us.
            </p>
            <div className="flex justify-center gap-4">
              <a
                href="https://github.com/SorobanCrashLab/soroban-crashlab/issues?q=is%3Aissue+is%3Aopen+label%3Awave3"
                className="flex items-center justify-center h-12 px-6 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
                target="_blank"
                rel="noopener noreferrer"
              >
                Browse Wave 3 Issues
              </a>
              <a
                href="https://github.com/SorobanCrashLab/soroban-crashlab"
                className="flex items-center justify-center h-12 px-6 rounded-full border border-black/[.15] dark:border-white/[.15] font-medium hover:bg-black/[.04] dark:hover:bg-white/[.04] transition dark:hover:text-black dark:text-white"
                target="_blank"
                rel="noopener noreferrer"
              >
                Star the Repo
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center min-h-[50vh] text-zinc-500 dark:text-zinc-400">
          Loading…
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
