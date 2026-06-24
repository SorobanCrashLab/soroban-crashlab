"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { FuzzingRun } from "./types";

function DashboardContent() {
  const [runs, setRuns] = useState<FuzzingRun[]>([]);
  const [dataState, setDataState] = useState<"loading" | "error" | "success">("loading");

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const load = async () => {
      setDataState("loading");
      try {
        const res = await fetch("/api/runs", { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
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
      ctrl.abort();
    };
  }, []);

  const recentRuns = runs.slice(0, 8);

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

      {dataState === "success" && (
        <div className="section mb-6">
          <Link href="/analytics/clusters" className="card card-padding card-interactive block">
            <h2 className="heading-section">Failure Signature Clusters</h2>
            <p className="text-meta mt-1">Group repeated crashes by signature and open representative samples for triage.</p>
          </Link>
        </div>
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
