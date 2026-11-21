"use client";

/**
 * Remediation queue: prioritised, filterable list of deduplicated findings
 * with lifecycle actions (assign, status, link PR, verify) and user barrier
 * report intake (#2335).
 */
import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  HIGH_RISK_SURFACES,
  filterFindings,
  getCriterion,
  slaState,
  sortByPriority,
  type A11yFinding,
  type FindingImpact,
  type FindingQuery,
  type FindingSource,
  type FindingStatus,
} from "./model";
import type { BarrierReportInput, FindingUpdate } from "./hooks/useA11yCompliance";

export interface RemediationQueueProps {
  findings: A11yFinding[];
  selectedId?: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, update: FindingUpdate) => Promise<boolean>;
  onReportBarrier: (input: BarrierReportInput) => Promise<boolean>;
}

const STATUSES: FindingStatus[] = ["open", "triaged", "in-progress", "fixed", "verified", "wont-fix"];
const IMPACTS: FindingImpact[] = ["critical", "serious", "moderate", "minor"];
const SOURCES: FindingSource[] = ["axe-ci", "lint", "runtime", "manual-audit", "user-report"];

const IMPACT_BADGE: Record<FindingImpact, string> = {
  critical: "badge-critical",
  serious: "badge-failed",
  moderate: "badge-running",
  minor: "badge-cancelled",
};

export function RemediationQueue({ findings, selectedId, onSelect, onUpdate, onReportBarrier }: RemediationQueueProps) {
  const [query, setQuery] = useState<FindingQuery>({ status: "open-any" });
  const visible = useMemo(() => sortByPriority(filterFindings(findings, query)), [findings, query]);
  const selected = findings.find((f) => f.id === selectedId) ?? null;
  const set = <K extends keyof FindingQuery>(key: K, value: string) =>
    setQuery((q) => ({ ...q, [key]: value === "" ? undefined : (value as FindingQuery[K]) }));

  return (
    <div className="space-y-6">
      <section aria-labelledby="a11y-queue-heading" className="card card-padding">
        <h2 id="a11y-queue-heading" className="heading-section mb-3">Remediation queue</h2>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-4" role="search" aria-label="Filter findings" onSubmit={(e) => e.preventDefault()}>
          <Field label="Search">
            {(id) => (
              <input id={id} type="search" className="input-field" value={query.search ?? ""} onChange={(e) => set("search", e.target.value)} />
            )}
          </Field>
          <Field label="Status">
            {(id) => (
              <select id={id} className="input-field" value={query.status ?? ""} onChange={(e) => set("status", e.target.value)}>
                <option value="open-any">All open</option>
                <option value="">Any</option>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </Field>
          <Field label="Impact">
            {(id) => (
              <select id={id} className="input-field" value={query.impact ?? ""} onChange={(e) => set("impact", e.target.value)}>
                <option value="">Any</option>
                {IMPACTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </Field>
          <Field label="Source">
            {(id) => (
              <select id={id} className="input-field" value={query.source ?? ""} onChange={(e) => set("source", e.target.value)}>
                <option value="">Any</option>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </Field>
          <Field label="Surface">
            {(id) => (
              <select id={id} className="input-field" value={query.surface ?? ""} onChange={(e) => set("surface", e.target.value)}>
                <option value="">Any</option>
                {HIGH_RISK_SURFACES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </Field>
        </form>

        <p role="status" className="text-meta mb-2">{visible.length} finding{visible.length === 1 ? "" : "s"} shown</p>

        <div className="table-responsive overflow-x-auto" role="region" aria-labelledby="a11y-queue-heading" tabIndex={0}>
          <table className="w-full text-sm">
            <caption className="sr-only">Accessibility findings ordered by priority score</caption>
            <thead>
              <tr className="text-left text-meta">
                <th scope="col" className="py-2 pr-2 font-medium">Finding</th>
                <th scope="col" className="py-2 px-2 font-medium">Impact</th>
                <th scope="col" className="py-2 px-2 font-medium">WCAG</th>
                <th scope="col" className="py-2 px-2 font-medium">Status</th>
                <th scope="col" className="py-2 px-2 font-medium">Owner</th>
                <th scope="col" className="py-2 px-2 font-medium">SLA</th>
                <th scope="col" className="py-2 pl-2 font-medium text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((f) => (
                <tr key={f.id} className={`border-t border-token ${f.id === selectedId ? "bg-token-surface" : ""}`}>
                  <th scope="row" className="py-2 pr-2 text-left font-normal">
                    <button
                      type="button"
                      className="link text-left font-medium"
                      aria-expanded={f.id === selectedId}
                      aria-controls="a11y-finding-detail"
                      onClick={() => onSelect(f.id === selectedId ? null : f.id)}
                    >
                      {f.title}
                    </button>
                    <div className="text-caption font-mono break-all">
                      {f.route} · {f.component}
                      {f.occurrences > 1 && ` · ${f.occurrences}× from ${new Set(f.provenance.map((p) => p.source)).size} source(s)`}
                    </div>
                  </th>
                  <td className="py-2 px-2"><span className={`badge ${IMPACT_BADGE[f.impact]}`}>{f.impact}</span></td>
                  <td className="py-2 px-2 font-mono text-xs">{f.wcagCriteria.join(", ") || "—"}</td>
                  <td className="py-2 px-2">
                    {f.status}
                    {f.regression && <span className="badge badge-critical ml-1">regression</span>}
                  </td>
                  <td className="py-2 px-2">{f.assignee ?? <span className="text-meta">Unassigned</span>}</td>
                  <td className="py-2 px-2">{slaState(f)}</td>
                  <td className="py-2 pl-2 text-right tabular-nums">{f.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <p className="text-meta py-4">No findings match these filters.</p>}
        </div>
      </section>

      {selected && <FindingDetail key={selected.id} finding={selected} onUpdate={onUpdate} onClose={() => onSelect(null)} />}

      <BarrierReportForm onSubmit={onReportBarrier} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="input-label">{label}</label>
      {children(id)}
    </div>
  );
}

function FindingDetail({
  finding,
  onUpdate,
  onClose,
}: {
  finding: A11yFinding;
  onUpdate: RemediationQueueProps["onUpdate"];
  onClose: () => void;
}) {
  const [assignee, setAssignee] = useState(finding.assignee ?? "");
  const [pr, setPr] = useState("");
  const [busy, setBusy] = useState(false);

  const act = async (update: FindingUpdate) => {
    setBusy(true);
    await onUpdate(finding.id, update);
    setBusy(false);
  };

  return (
    <section id="a11y-finding-detail" aria-labelledby="a11y-detail-heading" className="card card-padding space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="a11y-detail-heading" className="heading-section">{finding.title}</h2>
          <p className="text-caption font-mono">{finding.id} · fingerprint {finding.fingerprint}</p>
        </div>
        <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close finding detail">Close</button>
      </div>
      {finding.description && <p className="body-text">{finding.description}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-sm-semibold mb-1">WCAG guidance</h3>
          <ul className="text-sm space-y-1">
            {finding.wcagCriteria.length === 0 && <li className="text-meta">No criteria mapped.</li>}
            {finding.wcagCriteria.map((id) => {
              const c = getCriterion(id);
              return (
                <li key={id}>
                  <span className="font-mono">{id}</span> {c ? `${c.name} (${c.level}) — ${c.guidance}` : ""}
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h3 className="text-sm-semibold mb-1">Provenance</h3>
          <ul className="text-sm space-y-1">
            {finding.provenance.map((p, i) => (
              <li key={`${p.source}-${p.reference}-${i}`}>
                <span className="chip">{p.source}</span> <span className="font-mono text-xs">{p.reference}</span>{" "}
                <time className="text-caption" dateTime={p.detectedAt}>{new Date(p.detectedAt).toLocaleDateString()}</time>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 items-end">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void act({ assignee });
          }}
        >
          <label htmlFor="a11y-assignee" className="input-label">Owner</label>
          <div className="flex gap-2">
            <input id="a11y-assignee" className="input-field" value={assignee} onChange={(e) => setAssignee(e.target.value)} />
            <button type="submit" className="btn-outline" disabled={busy}>Assign</button>
          </div>
        </form>
        <div>
          <label htmlFor="a11y-status" className="input-label">Status</label>
          <select
            id="a11y-status"
            className="input-field"
            value={finding.status}
            disabled={busy}
            onChange={(e) => void act({ status: e.target.value as FindingStatus })}
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (pr.trim()) void act({ linkPr: pr.trim() }).then(() => setPr(""));
          }}
        >
          <label htmlFor="a11y-pr" className="input-label">Link PR / fix</label>
          <div className="flex gap-2">
            <input id="a11y-pr" className="input-field" placeholder="#123" aria-describedby="a11y-pr-hint" value={pr} onChange={(e) => setPr(e.target.value)} />
            <button type="submit" className="btn-outline" disabled={busy}>Link</button>
          </div>
          <p id="a11y-pr-hint" className="text-caption">#123 or a GitHub pull request URL</p>
        </form>
      </div>

      {finding.linkedPrs.length > 0 && (
        <p className="text-sm">Linked: {finding.linkedPrs.join(", ")}</p>
      )}
      {finding.status === "fixed" && (
        <button
          type="button"
          className="btn-primary"
          disabled={busy || finding.linkedPrs.length === 0}
          aria-describedby="a11y-verify-hint"
          onClick={() => void act({ status: "verified" })}
        >
          Verify resolution
        </button>
      )}
      {finding.status === "fixed" && finding.linkedPrs.length === 0 && (
        <p id="a11y-verify-hint" className="text-caption">Link the fixing PR before verifying.</p>
      )}
      {finding.verifiedAt && (
        <p className="text-sm">Verified by {finding.verifiedBy} on {new Date(finding.verifiedAt).toLocaleDateString()}.</p>
      )}
    </section>
  );
}

function BarrierReportForm({ onSubmit }: { onSubmit: RemediationQueueProps["onReportBarrier"] }) {
  const [description, setDescription] = useState("");
  const [route, setRoute] = useState("");
  const [component, setComponent] = useState("");
  const [surface, setSurface] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setMessage("Describe the barrier you encountered.");
      return;
    }
    setBusy(true);
    const ok = await onSubmit({ description, route: route || undefined, component: component || undefined, surface: surface || undefined });
    setBusy(false);
    if (ok) {
      setDescription("");
      setRoute("");
      setComponent("");
      setSurface("");
      setMessage("Thanks — your report was recorded and correlated with known issues.");
    } else {
      setMessage("The report could not be submitted. Please try again.");
    }
  };

  return (
    <section aria-labelledby="a11y-barrier-heading" className="card card-padding">
      <h2 id="a11y-barrier-heading" className="heading-section mb-1">Report an accessibility barrier</h2>
      <p className="text-meta mb-3" id="a11y-barrier-privacy">
        Emails, tokens and long numbers are redacted automatically. Please don&apos;t include personal details.
      </p>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-3" aria-describedby="a11y-barrier-privacy">
        <div className="md:col-span-3">
          <label htmlFor="a11y-barrier-desc" className="input-label">What happened? (required)</label>
          <textarea
            id="a11y-barrier-desc"
            className="input-field min-h-[5rem]"
            required
            aria-required="true"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="a11y-barrier-route" className="input-label">Page or route</label>
          <input id="a11y-barrier-route" className="input-field" placeholder="/runs" value={route} onChange={(e) => setRoute(e.target.value)} />
        </div>
        <div>
          <label htmlFor="a11y-barrier-component" className="input-label">Component (if known)</label>
          <input id="a11y-barrier-component" className="input-field" value={component} onChange={(e) => setComponent(e.target.value)} />
        </div>
        <div>
          <label htmlFor="a11y-barrier-surface" className="input-label">Surface</label>
          <select id="a11y-barrier-surface" className="input-field" value={surface} onChange={(e) => setSurface(e.target.value)}>
            <option value="">Other / not sure</option>
            {HIGH_RISK_SURFACES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="md:col-span-3 flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Submitting…" : "Submit report"}</button>
          <p role="status" className="text-sm">{message}</p>
        </div>
      </form>
    </section>
  );
}
