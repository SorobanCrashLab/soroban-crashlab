"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from 'next/dynamic';
import { LoadingSpinner } from "../components/LoadingSkeleton";
import { PageHeader, PageSection, StatCard } from "../components";
import { useRuns } from "../hooks/useRuns";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "../components/PullToRefreshIndicator";
import DashboardSectionLayoutEditor from "./dashboard-section-layout-editor";
import {
  DASHBOARD_LAYOUT_STORAGE_KEY,
  DEFAULT_DASHBOARD_LAYOUT,
  getVisibleDashboardSections,
  parseDashboardLayout,
  type DashboardSectionConfig,
  type DashboardSectionId,
} from "./dashboard-layout-utils";
import { ResourceFeeInsightPanel } from "./implement-resource-fee-insight-panel-component";
import RunHealthScoreWidget from "./implement-run-health-score-widget";
import Pagination from "./Pagination";
import { getPageSlice, computeTotalPages, clampPage } from "./pagination-utils";

const AddTaggingAndLabelsUi = dynamic(
  () => import("./add-tagging-and-labels-ui"),
  { ssr: false }
);
import { runMatchesTagFilter } from "./run-tags-utils";
import { FuzzingRun } from "./types";
import { useDataTableKeyboardNav } from "./use-data-table-keyboard-nav";

const makeSuggestedLabels = (run: FuzzingRun): string[] => [
  run.area,
  run.severity,
  run.status === "failed" ? "has-crash-details" : "stable-pass",
  run.minResourceFee >= 3_000 ? "high-fee" : "fee-ok",
];

const PAGE_SIZE = 10;

function DashboardContent() {
  const { runs, dataState, refetch } = useRuns({
    revalidateOnFocus: true,
    revalidateOnVisibility: true,
  });
  const [layout, setLayout] = useState<DashboardSectionConfig[]>(DEFAULT_DASHBOARD_LAYOUT);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTag = searchParams.get("filter_tag") ?? "all";
  const rawPage = parseInt(searchParams.get("page") ?? "1", 10);
  const currentPage = isNaN(rawPage) ? 1 : rawPage;


  useEffect(() => {
    const loadLayout = () => {
      try {
        setLayout(parseDashboardLayout(localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY)));
      } catch {
        setLayout(DEFAULT_DASHBOARD_LAYOUT);
      }
    };
    loadLayout();
    window.addEventListener("dashboard-layout-updated", loadLayout);
    return () => window.removeEventListener("dashboard-layout-updated", loadLayout);
  }, []);

  const setActiveTag = useCallback(
    (tag: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (!tag || tag === "all") {
        next.delete("filter_tag");
      } else {
        next.set("filter_tag", tag);
      }
      next.delete("page");
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const handlePageChange = useCallback(
    (page: number) => {
      const next = new URLSearchParams(searchParams.toString());
      if (page <= 1) {
        next.delete("page");
      } else {
        next.set("page", String(page));
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const filteredRuns = useMemo(() => {
    if (activeTag === "all") return runs;
    return runs.filter((run) =>
      runMatchesTagFilter(run.tags ?? [], makeSuggestedLabels(run), activeTag),
    );
  }, [activeTag, runs]);

  const totalPages = computeTotalPages(filteredRuns.length, PAGE_SIZE);
  const clampedPage = clampPage(currentPage, totalPages);
  const recentRuns = getPageSlice(filteredRuns, clampedPage, PAGE_SIZE);

  const { getRowProps } = useDataTableKeyboardNav({
    rowCount: recentRuns.length,
    onActivate: (index) => {
      const run = recentRuns[index];
      if (run) {
        router.push(`/runs/${run.id}`);
      }
    },
  });

  const handleRefresh = useCallback(async () => {
    await refetch();
    await new Promise<void>((resolve) => setTimeout(resolve, 600));
  }, [refetch]);

  const { isPulling, isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: handleRefresh,
    disabled: dataState === 'loading',
  });

  return (
    <div className="container-full page-padding fade-in">
      <PullToRefreshIndicator isPulling={isPulling} isRefreshing={isRefreshing} pullDistance={pullDistance} />
      <PageHeader
        title="Dashboard"
        description="Fuzzing campaign overview"
        actions={
          <Link href="/runs" className="btn-primary text-xs sm:text-sm px-3 sm:px-6 h-9 sm:h-10">
            View All Runs
          </Link>
        }
      />

      {dataState === "success" && (
        <PageSection className="mb-6">
          <Link href="/analytics/clusters" className="card card-padding card-interactive block">
            <h2 className="heading-section">Failure Signature Clusters</h2>
            <p className="text-meta mt-1">Group repeated crashes by signature and open representative samples for triage.</p>
          </Link>
        </PageSection>
      )}

      {dataState === "loading" && <div className="card card-padding text-meta">Loading...</div>}

      {dataState === "success" && (
        <div className="card table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>Area</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run) => (
                <tr key={run.id}>
                  <td className="code-text text-meta">{run.id}</td>
                  <td><span className={`badge badge-${run.status}`}>{run.status}</span></td>
                  <td>{run.area}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dataState === "error" && (
        <div role="alert" className="card card-padding mb-4 sm:mb-6" style={{ borderLeft: "4px solid #CC1016" }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold" style={{ color: "#CC1016" }}>Connection Error</p>
              <p className="text-meta">Could not reach the backend API.</p>
            </div>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow transition"
              style={{ backgroundColor: "#CC1016" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#a50d12")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#CC1016")}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M5.635 15A9 9 0 1118.365 9" />
              </svg>
              Retry
            </button>
          </div>
        </div>
      )}

      {dataState === "loading" && (
        <div role="status" aria-live="polite" className="card card-padding py-8 sm:py-12">
          <LoadingSpinner label="Loading dashboard..." />
        </div>
      )}

      {dataState === "success" && (
        <>
          {getVisibleDashboardSections(layout).map((section) => {
            const sectionContent: Record<DashboardSectionId, ReactNode> = {
              stats: (
                <PageSection>
                  <div className="grid grid-cols-1 min-[360px]:grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "Total", value: filteredRuns.length },
                      { label: "Failed", value: filteredRuns.filter((r) => r.status === "failed").length },
                      { label: "Running", value: filteredRuns.filter((r) => r.status === "running").length },
                      { label: "Critical", value: filteredRuns.filter((r) => r.severity === "critical").length },
                    ].map((stat) => (
                      <StatCard key={stat.label} label={stat.label} value={stat.value} />
                    ))}
                  </div>
                </PageSection>
              ),
              "widget-editor": (
                <PageSection>
                  <DashboardSectionLayoutEditor />
                </PageSection>
              ),
              "recent-runs": (
                <>
                  <PageSection>
                    <AddTaggingAndLabelsUi
                      runs={filteredRuns}
                      activeTag={activeTag}
                      onActiveTagChange={setActiveTag}
                    />
                  </PageSection>
                  <PageSection
                    title="Recent Runs"
                    actions={<Link href="/runs" className="link text-xs sm:text-sm">View all</Link>}
                  >
                    <div className="card table-responsive">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Status</th>
                            <th>Area</th>
                            <th>Tags</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentRuns.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-6 py-16 text-center">
                                <div className="flex flex-col items-center gap-3">
                                  <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-full text-zinc-300">
                                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                  </div>
                                  <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">No matching fuzzing runs</span>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            recentRuns.map((run) => (
                              <tr key={run.id}>
                                <td className="code-text text-meta">{run.id}</td>
                                <td><span className={`badge badge-${run.status}`}>{run.status}</span></td>
                                <td>{run.area}</td>
                                <td className="text-meta">{(run.tags ?? []).join(", ") || "—"}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    {totalPages > 1 && (
                      <Pagination
                        currentPage={clampedPage}
                        totalPages={totalPages}
                        onPageChange={handlePageChange}
                      />
                    )}
                  </PageSection>
                </>
              ),
              "quick-actions": (
                <PageSection className="card card-padding">
                  <h3 className="font-semibold text-sm mb-3">Quick Actions</h3>
                  <div className="flex flex-col gap-2">
                    <Link href="/runs" className="link">Browse all runs</Link>
                    <Link href="/analytics" className="link">Open analytics</Link>
                  </div>
                </PageSection>
              ),
            };
            return <div key={section.id}>{sectionContent[section.id]}</div>;
          })}
          <PageSection>
            <RunHealthScoreWidget runs={filteredRuns} dataState={dataState} />
          </PageSection>

          <PageSection>
            <ResourceFeeInsightPanel runs={filteredRuns} dataState={dataState} />
          </PageSection>

          <PageSection>
            <AddTaggingAndLabelsUi
              runs={filteredRuns}
              activeTag={activeTag}
              onActiveTagChange={setActiveTag}
            />
          </PageSection>

          <PageSection
            title="Recent Runs"
            actions={<Link href="/runs" className="link text-xs sm:text-sm">View all</Link>}
          >
            <div className="card table-responsive">
                <table
                  className="data-table"
                  aria-label="Recent fuzzing runs"
                >
                  <thead>
                    <tr>
                      <th scope="col">ID</th>
                      <th scope="col">Status</th>
                      <th scope="col">Area</th>
                      <th scope="col">Tags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRuns.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-16 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-full text-zinc-300">
                              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
                            <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">No matching fuzzing runs</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      recentRuns.map((run, index) => (
                        <tr
                          key={run.id}
                          {...getRowProps(index)}
                          className="cursor-pointer"
                          onClick={() => router.push(`/runs/${run.id}`)}
                          aria-label={`Fuzzing run ${run.id}, status ${run.status}`}
                        >
                          <td className="code-text text-meta">{run.id}</td>
                          <td><span className={`badge badge-${run.status}`}>{run.status}</span></td>
                          <td>{run.area}</td>
                          <td className="text-meta">{(run.tags ?? []).join(", ") || "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
          </PageSection>
        </>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="container-full page-padding text-meta">Loading...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
