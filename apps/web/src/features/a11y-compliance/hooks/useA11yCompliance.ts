"use client";

/**
 * Client state for the Accessibility Compliance Automation Center (#2335).
 * Talks to /api/a11y-compliance/findings and derives dashboard aggregates.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  conformanceByCriterion,
  hotspots,
  surfaceCoverage,
  trend,
  type A11yFinding,
  type AuditEntry,
  type FindingImpact,
  type FindingStatus,
  type GateEvaluation,
  type GateWaiver,
} from "../model";

const ENDPOINT = "/api/a11y-compliance/findings";

interface FindingsResponse {
  findings: A11yFinding[];
  waivers: GateWaiver[];
  gate: GateEvaluation;
  audit: AuditEntry[];
  generatedAt: string;
}

export interface FindingUpdate {
  status?: FindingStatus;
  assignee?: string;
  impact?: FindingImpact;
  linkPr?: string;
}

export interface BarrierReportInput {
  title?: string;
  description: string;
  route?: string;
  component?: string;
  surface?: string;
  wcagCriteria?: string[];
}

export interface WaiverRequestInput {
  findingIds: string[];
  justification: string;
  expiresAt?: string;
}

async function send<T>(method: "POST" | "PATCH", body: unknown): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export function useA11yCompliance(options: { release?: string; actor?: string } = {}) {
  const release = options.release ?? "next";
  const actor = options.actor ?? "current-user";
  const [data, setData] = useState<FindingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string>("");

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${ENDPOINT}?release=${encodeURIComponent(release)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load findings (${res.status})`);
      setData((await res.json()) as FindingsResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load findings");
    } finally {
      setIsLoading(false);
    }
  }, [release]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
        setLastAction(label);
        await refresh();
        return true;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Action failed";
        setLastAction(`Error: ${message}`);
        return false;
      }
    },
    [refresh],
  );

  const updateFinding = useCallback(
    (id: string, update: FindingUpdate) =>
      run(`Updated ${id}`, () => send("PATCH", { kind: "finding", id, actor, ...update })),
    [run, actor],
  );

  const reportBarrier = useCallback(
    (input: BarrierReportInput) =>
      run("Barrier report submitted", () => send("POST", { kind: "barrier-report", ...input })),
    [run],
  );

  const requestWaiver = useCallback(
    (input: WaiverRequestInput) =>
      run("Waiver requested", () => send("POST", { kind: "waiver", release, actor, ...input })),
    [run, release, actor],
  );

  const decideWaiver = useCallback(
    (id: string, decision: "approved" | "rejected", approver: string) =>
      run(`Waiver ${decision}`, () => send("PATCH", { kind: "waiver", id, decision, actor: approver })),
    [run],
  );

  const findings = useMemo(() => data?.findings ?? [], [data]);
  const derived = useMemo(
    () => ({
      routeHotspots: hotspots(findings, "route"),
      componentHotspots: hotspots(findings, "component"),
      conformance: conformanceByCriterion(findings),
      coverage: surfaceCoverage(findings),
      trend: trend(findings, 30),
    }),
    [findings],
  );

  return {
    release,
    actor,
    findings,
    waivers: data?.waivers ?? [],
    gate: data?.gate ?? null,
    audit: data?.audit ?? [],
    generatedAt: data?.generatedAt,
    isLoading,
    error,
    lastAction,
    refresh,
    updateFinding,
    reportBarrier,
    requestWaiver,
    decideWaiver,
    ...derived,
  };
}

export type A11yComplianceState = ReturnType<typeof useA11yCompliance>;
