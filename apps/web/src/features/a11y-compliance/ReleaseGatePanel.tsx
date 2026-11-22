"use client";

/**
 * Release gate panel: accessibility gate status for a release, blocking
 * findings, waiver request/approval workflow with audit trail, and
 * compliance report / trend exports (#2335).
 */
import { useState, type FormEvent } from "react";
import {
  buildComplianceReport,
  buildTrendCsv,
  type A11yFinding,
  type AuditEntry,
  type GateEvaluation,
  type GateWaiver,
  type TrendPoint,
} from "./model";
import type { WaiverRequestInput } from "./hooks/useA11yCompliance";

export interface ReleaseGatePanelProps {
  gate: GateEvaluation;
  findings: A11yFinding[];
  waivers: GateWaiver[];
  audit: AuditEntry[];
  trend: TrendPoint[];
  onRequestWaiver: (input: WaiverRequestInput) => Promise<boolean>;
  onDecideWaiver: (id: string, decision: "approved" | "rejected", approver: string) => Promise<boolean>;
}

const GATE_STYLE: Record<GateEvaluation["status"], { badge: string; label: string; icon: string }> = {
  pass: { badge: "badge-completed", label: "Pass", icon: "✓" },
  warn: { badge: "badge-running", label: "Pass with warnings", icon: "!" },
  fail: { badge: "badge-failed", label: "Blocked", icon: "✕" },
};

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ReleaseGatePanel({
  gate,
  findings,
  waivers,
  audit,
  trend,
  onRequestWaiver,
  onDecideWaiver,
}: ReleaseGatePanelProps) {
  const style = GATE_STYLE[gate.status];
  const [selected, setSelected] = useState<string[]>([]);
  const [justification, setJustification] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [approver, setApprover] = useState("a11y-lead");
  const [message, setMessage] = useState("");
  const releaseWaivers = waivers.filter((w) => w.release === gate.release);
  const byId = new Map(findings.map((f) => [f.id, f]));

  const submitWaiver = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected.length || !justification.trim()) {
      setMessage("Select at least one blocking finding and provide a justification.");
      return;
    }
    const ok = await onRequestWaiver({
      findingIds: selected,
      justification,
      expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59Z`).toISOString() : undefined,
    });
    if (ok) {
      setSelected([]);
      setJustification("");
      setExpiresAt("");
      setMessage("Waiver requested. It needs approval from someone other than the requester.");
    } else {
      setMessage("Waiver request failed.");
    }
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="a11y-gate-heading" className="card card-padding">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="a11y-gate-heading" className="heading-section">
              Release gate · <span className="font-mono">{gate.release}</span>
            </h2>
            <p className="text-caption">Evaluated {new Date(gate.evaluatedAt).toLocaleString()}</p>
          </div>
          <span className={`badge ${style.badge} text-base`} role="status">
            <span aria-hidden="true">{style.icon} </span>
            Accessibility gate: {style.label}
          </span>
        </div>
        <ul className="mt-3 list-disc pl-5 text-sm space-y-1">
          {gate.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-outline"
            onClick={() => download(`a11y-conformance-${gate.release}.md`, buildComplianceReport(findings, gate), "text/markdown")}
          >
            Export VPAT-oriented summary (.md)
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => download(`a11y-trend-${gate.release}.csv`, buildTrendCsv(trend), "text/csv")}
          >
            Export trend snapshot (.csv)
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() =>
              download(
                `a11y-gate-${gate.release}.json`,
                JSON.stringify({ gate, waivers: releaseWaivers }, null, 2),
                "application/json",
              )
            }
          >
            Export gate evidence (.json)
          </button>
        </div>
      </section>

      <section aria-labelledby="a11y-blocking-heading" className="card card-padding">
        <h2 id="a11y-blocking-heading" className="heading-section mb-3">Blocking findings &amp; waiver request</h2>
        {gate.blocking.length === 0 ? (
          <p className="text-meta">Nothing is blocking this release.</p>
        ) : (
          <form onSubmit={submitWaiver} className="space-y-3">
            <fieldset>
              <legend className="text-sm-semibold mb-2">Select findings to waive</legend>
              <ul className="space-y-1">
                {gate.blocking.map((f) => (
                  <li key={f.id}>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="checkbox mt-0.5"
                        checked={selected.includes(f.id)}
                        onChange={(e) =>
                          setSelected((s) => (e.target.checked ? [...s, f.id] : s.filter((id) => id !== f.id)))
                        }
                      />
                      <span>
                        <span className="font-medium">{f.title}</span>{" "}
                        <span className="text-caption">
                          ({f.impact}{f.regression ? ", regression" : ""}, {f.wcagCriteria.join(", ") || "no criteria"})
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <label htmlFor="a11y-waiver-justification" className="input-label">Justification (required)</label>
                <textarea
                  id="a11y-waiver-justification"
                  className="input-field min-h-[4rem]"
                  required
                  aria-required="true"
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="a11y-waiver-expiry" className="input-label">Expires (default 30 days)</label>
                <input id="a11y-waiver-expiry" type="date" className="input-field" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" className="btn-primary">Request waiver</button>
              <p role="status" className="text-sm">{message}</p>
            </div>
          </form>
        )}
      </section>

      <section aria-labelledby="a11y-waivers-heading" className="card card-padding">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <h2 id="a11y-waivers-heading" className="heading-section">Waivers</h2>
          <div>
            <label htmlFor="a11y-approver" className="input-label">Approving as</label>
            <input id="a11y-approver" className="input-field" value={approver} onChange={(e) => setApprover(e.target.value)} />
          </div>
        </div>
        {releaseWaivers.length === 0 ? (
          <p className="text-meta">No waivers for this release.</p>
        ) : (
          <ul className="space-y-3">
            {releaseWaivers.map((w) => (
              <li key={w.id} className="border border-token rounded-lg p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono">{w.id}</span>
                  <span className={`badge ${w.status === "approved" ? "badge-completed" : w.status === "rejected" ? "badge-failed" : "badge-running"}`}>
                    {w.status}
                  </span>
                </div>
                <p className="mt-1">{w.justification}</p>
                <p className="text-caption mt-1">
                  {w.findingIds.map((id) => byId.get(id)?.title ?? id).join("; ")}
                </p>
                <p className="text-caption">
                  Requested by {w.requestedBy} · expires {new Date(w.expiresAt).toLocaleDateString()}
                  {w.decidedBy && ` · ${w.status} by ${w.decidedBy}`}
                </p>
                {w.status === "pending" && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={approver.trim() === "" || approver === w.requestedBy}
                      onClick={() => void onDecideWaiver(w.id, "approved", approver)}
                    >
                      Approve
                    </button>
                    <button type="button" className="btn-outline" onClick={() => void onDecideWaiver(w.id, "rejected", approver)}>
                      Reject
                    </button>
                    {approver === w.requestedBy && <span className="text-caption self-center">Requesters cannot approve their own waiver.</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="a11y-audit-heading" className="card card-padding">
        <h2 id="a11y-audit-heading" className="heading-section mb-3">Audit log</h2>
        {audit.length === 0 ? (
          <p className="text-meta">No activity yet.</p>
        ) : (
          <ol className="text-sm space-y-1 max-h-72 overflow-auto" tabIndex={0} aria-labelledby="a11y-audit-heading">
            {audit.map((a, i) => (
              <li key={`${a.at}-${i}`}>
                <time className="text-caption font-mono" dateTime={a.at}>{new Date(a.at).toLocaleString()}</time>{" "}
                <span className="font-medium">{a.actor}</span> {a.action} <span className="font-mono">{a.target}</span>
                {a.detail && <span className="text-meta"> — {a.detail}</span>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
