"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import DashboardSectionLayoutEditor from "./dashboard-section-layout-editor";
import {
  DASHBOARD_LAYOUT_STORAGE_KEY,
  DEFAULT_DASHBOARD_LAYOUT,
  getVisibleDashboardSections,
  parseDashboardLayout,
  type DashboardSectionConfig,
  type DashboardSectionId,
} from "./dashboard-layout-utils";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AddTaggingAndLabelsUi from "./add-tagging-and-labels-ui";
import { runMatchesTagFilter } from "./run-tags-utils";
import { FuzzingRun } from "./types";
import { dedupedFetchJson } from "../lib/request-dedup";

const makeSuggestedLabels = (run: FuzzingRun): string[] => [
  run.area,
  run.severity,
  run.status === "failed" ? "has-crash-details" : "stable-pass",
  run.minResourceFee >= 3_000 ? "high-fee" : "fee-ok",
];

function DashboardContent() {
  const [runs, setRuns] = useState<FuzzingRun[]>([]);
  const [dataState, setDataState] = useState<"loading" | "error" | "success">("loading");
  const [layout, setLayout] = useState<DashboardSectionConfig[]>(DEFAULT_DASHBOARD_LAYOUT);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTag = searchParams.get("filter_tag") ?? "all";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/runs");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const data = await dedupedFetchJson<{ runs?: FuzzingRun[] }>("/api/runs");
        if (!cancelled) {
          setRuns(data.runs ?? []);
          setDataState("success");
        }
      } catch {
        if (!cancelled) setDataState("error");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const recentRuns = runs.slice(0, 8);
  const visibleSections = getVisibleDashboardSections(layout);

  const sectionContent: Record<DashboardSectionId, ReactNode> = {
    stats: (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total", value: runs.length },
          { label: "Failed", value: runs.filter((r) => r.status === "failed").length },
          { label: "Running", value: runs.filter((r) => r.status === "running").length },
          { label: "Critical", value: runs.filter((r) => r.severity === "critical").length },
        ].map((stat) => (
          <div key={stat.label} className="card card-padding stat-card">
            <div className="stat-value">{dataState === "loading" ? "..." : stat.value}</div>
            <div className="stat-label">{stat.label}</div>
          </div>
        ))}
      </div>
    ),
    "widget-editor": (
      <div className="section">
        <DashboardSectionLayoutEditor />
      </div>
    ),
    "recent-runs": (
      <div className="section">
        <h2 className="heading-section mb-3">Recent Runs</h2>
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
      </div>
    ),
    "quick-actions": (
      <div className="section card card-padding">
        <h3 className="font-semibold text-sm mb-3">Quick Actions</h3>
        <div className="flex flex-col gap-2">
          <Link href="/runs" className="link">Browse all runs</Link>
          <Link href="/analytics" className="link">Open analytics</Link>
        </div>
      </div>
    ),
  };

  return (
    <div className="container-full page-padding fade-in">
      <h1 className="heading-page mb-6">Dashboard</h1>
      {dataState === "error" && <div className="card card-padding mb-4">Connection error</div>}
      {visibleSections.map((section) => (
        <div key={section.id}>{sectionContent[section.id]}</div>
      ))}
  const setActiveTag = useCallback(
    (tag: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (!tag || tag === "all") {
        next.delete("filter_tag");
      } else {
        next.set("filter_tag", tag);
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

  const recentRuns = filteredRuns.slice(0, 8);

  return (
    <div className="container-full page-padding fade-in">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="heading-page">Dashboard</h1>
          <p className="text-meta mt-0.5 sm:mt-1">Fuzzing campaign overview</p>
        </div>
        <Link href="/runs" className="btn-primary text-xs sm:text-sm px-3 sm:px-6 h-9 sm:h-10">
          View All Runs
        </Link>
      </div>

      {dataState === "error" && (
        <div className="card card-padding mb-4 sm:mb-6" style={{ borderLeft: "4px solid #CC1016" }}>
          <p className="font-semibold" style={{ color: "#CC1016" }}>Connection Error</p>
        </div>
      )}

      {dataState === "loading" && (
        <div className="card card-padding flex items-center justify-center py-8">
          <span className="text-meta">Loading data...</span>
        </div>
      )}

      {dataState === "success" && (
        <>
          <div className="section">
            <AddTaggingAndLabelsUi
              runs={filteredRuns}
              activeTag={activeTag}
              onActiveTagChange={setActiveTag}
            />
          </div>

          <div className="section">
            <div className="flex items-center justify-between mb-3">
              <h2 className="heading-section">Recent Runs</h2>
              <Link href="/runs" className="link text-xs sm:text-sm">View all</Link>
            </div>
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
                  {recentRuns.map((run) => (
                    <tr key={run.id}>
                      <td className="code-text text-meta">{run.id}</td>
                      <td><span className={`badge badge-${run.status}`}>{run.status}</span></td>
                      <td>{run.area}</td>
                      <td className="text-meta">{(run.tags ?? []).join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
