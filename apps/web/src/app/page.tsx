"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from 'next/dynamic';
import { LoadingSpinner } from "../components/LoadingSkeleton";

const AddTaggingAndLabelsUi = dynamic(
  () => import("./add-tagging-and-labels-ui"),
  { ssr: false }
);
import { runMatchesTagFilter } from "./run-tags-utils";
import { FuzzingRun } from "./types";
import { fetchRuns } from "../lib/api-client";
import { useDataTableKeyboardNav } from "./use-data-table-keyboard-nav";

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

  const { getRowProps } = useDataTableKeyboardNav({
    rowCount: recentRuns.length,
    onActivate: (index) => {
      const run = recentRuns[index];
      if (run) {
        router.push(`/runs/${run.id}`);
      }
    },
  });

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
        <div role="status" aria-live="polite" className="card card-padding py-8 sm:py-12">
          <LoadingSpinner label="Loading dashboard..." />
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
