"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from 'next/dynamic';

const AddTaggingAndLabelsUi = dynamic(
  () => import("./add-tagging-and-labels-ui"),
  { ssr: false }
);
import { runMatchesTagFilter } from "./run-tags-utils";
import { FuzzingRun } from "./types";
import { fetchRuns } from "../lib/api-client";

const makeSuggestedLabels = (run: FuzzingRun): string[] => [
  run.area,
  run.severity,
  run.status === "failed" ? "has-crash-details" : "stable-pass",
  run.minResourceFee >= 3_000 ? "high-fee" : "fee-ok",
];

function DashboardContent() {
  const [runs, setRuns] = useState<FuzzingRun[]>([]);
  const [dataState, setDataState] = useState<"loading" | "error" | "success">("loading");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTag = searchParams.get("filter_tag") ?? "all";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setDataState("loading");
      try {
        const data = await fetchRuns();
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
        <div role="alert" className="card card-padding mb-4 sm:mb-6" style={{ borderLeft: "4px solid #CC1016" }}>
          <p className="font-semibold" style={{ color: "#CC1016" }}>Connection Error</p>
        </div>
      )}

      {dataState === "loading" && (
        <div role="status" aria-live="polite" className="card card-padding flex items-center justify-center py-8">
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
