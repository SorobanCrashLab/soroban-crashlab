/**
 * /api/a11y-compliance/findings — Accessibility Compliance Automation Center (#2335).
 *
 * GET    list findings (filters: status, impact, source, route, surface,
 *        criterion, assignee, q) plus waivers, gate evaluation and audit log.
 * POST   { kind: "findings", source, items[] }   ingest + normalise + dedupe
 *        { kind: "barrier-report", ... }         user barrier report intake
 *        { kind: "waiver", ... }                 request a release-gate waiver
 * PATCH  { kind: "finding", id, ... }            lifecycle update
 *        { kind: "waiver", id, decision, actor } approve / reject a waiver
 *
 * Storage is an in-memory, process-local store seeded with representative
 * data; swap `store` for a persistent backend without changing the contract.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  evaluateGate,
  filterFindings,
  isFindingSource,
  isFindingStatus,
  mergeFinding,
  normaliseFinding,
  normaliseSurface,
  redactPersonalData,
  sortByPriority,
  type A11yFinding,
  type AuditEntry,
  type FindingImpact,
  type FindingQuery,
  type FindingStatus,
  type GateWaiver,
  type RawFindingInput,
} from "@/features/a11y-compliance/model";

export const dynamic = "force-dynamic";

const MAX_BATCH = 500;
const DEFAULT_RELEASE = "next";

interface Store {
  findings: A11yFinding[];
  waivers: GateWaiver[];
  audit: AuditEntry[];
  seq: number;
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

function createSeededStore(): Store {
  const store: Store = { findings: [], waivers: [], audit: [], seq: 0 };
  const seed: Array<[RawFindingInput, Parameters<typeof normaliseFinding>[1], Partial<A11yFinding>?]> = [
    [{ title: "Run table cells lack header association", route: "/runs", component: "RunHistoryTable", surface: "data-grid", ruleId: "td-headers-attr", impact: "serious", reference: "ci#4821", detectedAt: daysAgo(12) }, "axe-ci", { assignee: "frontend-core", status: "in-progress" }],
    [{ title: "Crash trend chart has no text alternative", route: "/trends", component: "TrendChart", surface: "chart", ruleId: "svg-img-alt", impact: "critical", reference: "audit-2026-Q4", detectedAt: daysAgo(9) }, "manual-audit"],
    [{ title: "Diff add/remove lines conveyed by colour only", route: "/diff-review/123", component: "DiffViewer", surface: "diff", wcagCriteria: ["1.4.1"], impact: "serious", reference: "audit-2026-Q4", detectedAt: daysAgo(20) }, "manual-audit", { status: "triaged" }],
    [{ title: "Trace canvas not keyboard operable", route: "/runs/42/trace", component: "TraceCanvas", surface: "canvas", wcagCriteria: ["2.1.1"], impact: "critical", reference: "runtime-diag", detectedAt: daysAgo(3) }, "runtime"],
    [{ title: "Severity badge contrast below 4.5:1", route: "/", component: "LogSeverityBadge", ruleId: "color-contrast", impact: "serious", reference: "ci#4790", detectedAt: daysAgo(40) }, "axe-ci", { status: "verified", resolvedAt: daysAgo(30), verifiedAt: daysAgo(29), verifiedBy: "a11y-champion", linkedPrs: ["#1980"] }],
    [{ title: "Icon-only toolbar buttons missing accessible name", route: "/trace", component: "TraceToolbar", surface: "trace", ruleId: "button-name", impact: "serious", reference: "eslint jsx-a11y", detectedAt: daysAgo(5) }, "lint"],
    [{ title: "Filter change does not announce result count", route: "/runs", component: "RunFilters", wcagCriteria: ["4.1.3"], impact: "moderate", reference: "audit-2026-Q4", detectedAt: daysAgo(25) }, "manual-audit"],
    [{ title: "Chart tooltip cannot be dismissed with Esc", route: "/analytics", component: "ChartTooltip", surface: "chart", wcagCriteria: ["1.4.13"], impact: "moderate", reference: "ci#4801", detectedAt: daysAgo(18) }, "axe-ci", { status: "fixed", resolvedAt: daysAgo(2), linkedPrs: ["#2101"] }],
  ];
  for (const [raw, source, overrides] of seed) {
    const normalised = normaliseFinding(raw, source, raw.detectedAt ?? new Date().toISOString());
    const res = mergeFinding(store.findings, normalised, () => nextId(store, "a11y"));
    store.findings = res.findings;
    if (overrides) Object.assign(res.merged, overrides);
  }
  return store;
}

function nextId(store: Store, prefix: string): string {
  store.seq += 1;
  return `${prefix}-${String(store.seq).padStart(4, "0")}`;
}

const globalForStore = globalThis as unknown as { __a11yComplianceStore?: Store };
function getStore(): Store {
  if (!globalForStore.__a11yComplianceStore) globalForStore.__a11yComplianceStore = createSeededStore();
  return globalForStore.__a11yComplianceStore;
}

function audit(store: Store, actor: string, action: string, target: string, detail?: string) {
  store.audit.unshift({ at: new Date().toISOString(), actor: actor.slice(0, 80) || "unknown", action, target, detail });
  if (store.audit.length > 500) store.audit.length = 500;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function str(value: unknown, max = 500): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const store = getStore();
  const p = req.nextUrl.searchParams;
  const statusParam = p.get("status");
  const query: FindingQuery = {
    status: statusParam === "open-any" ? "open-any" : isFindingStatus(statusParam) ? statusParam : undefined,
    impact: (["critical", "serious", "moderate", "minor"] as const).find((i) => i === p.get("impact")),
    source: isFindingSource(p.get("source")) ? (p.get("source") as FindingQuery["source"]) : undefined,
    route: p.get("route") ?? undefined,
    surface: normaliseSurface(p.get("surface") ?? undefined),
    criterion: p.get("criterion") ?? undefined,
    assignee: p.get("assignee") ?? undefined,
    search: p.get("q")?.slice(0, 200) ?? undefined,
  };
  const release = p.get("release")?.slice(0, 80) || DEFAULT_RELEASE;
  const findings = sortByPriority(filterFindings(store.findings, query));
  const gate = evaluateGate(store.findings, store.waivers, release);

  return NextResponse.json({
    findings,
    total: findings.length,
    allFindings: store.findings.length,
    waivers: store.waivers,
    gate,
    audit: store.audit.slice(0, 100),
    generatedAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const store = getStore();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("Invalid JSON body.");
  }
  const actor = str(body.actor, 80) ?? "system";
  const now = new Date().toISOString();

  if (body.kind === "findings") {
    if (!isFindingSource(body.source)) return bad("`source` must be one of axe-ci, lint, runtime, manual-audit, user-report.");
    if (!Array.isArray(body.items) || body.items.length === 0) return bad("`items` must be a non-empty array.");
    if (body.items.length > MAX_BATCH) return bad(`At most ${MAX_BATCH} items per batch.`, 413);
    let created = 0;
    let deduplicated = 0;
    let regressions = 0;
    for (const item of body.items) {
      if (!item || typeof item !== "object") continue;
      const normalised = normaliseFinding(item as RawFindingInput, body.source, now);
      const res = mergeFinding(store.findings, normalised, () => nextId(store, "a11y"));
      store.findings = res.findings;
      if (res.isNew) created += 1;
      else deduplicated += 1;
      if (res.isRegression) {
        regressions += 1;
        audit(store, actor, "regression-detected", res.merged.id, `via ${body.source}`);
      }
    }
    audit(store, actor, "ingest", String(body.source), `${created} new, ${deduplicated} deduplicated`);
    return NextResponse.json({ created, deduplicated, regressions }, { status: 201 });
  }

  if (body.kind === "barrier-report") {
    const description = str(body.description, 2000);
    if (!description) return bad("`description` is required.");
    const raw: RawFindingInput = {
      title: str(body.title, 200) ?? "User-reported barrier",
      description,
      route: str(body.route, 300),
      component: str(body.component, 120) ?? "unknown",
      surface: str(body.surface, 40),
      wcagCriteria: Array.isArray(body.wcagCriteria) ? body.wcagCriteria.filter((c): c is string => typeof c === "string") : [],
      impact: str(body.impact, 20) ?? "serious",
      reference: `barrier-report:${nextId(store, "br")}`,
    };
    const normalised = normaliseFinding(raw, "user-report", now);
    // Correlate to known issues on the same route/component and criteria
    // even when the fingerprint differs (users don't supply selectors/rule ids).
    const related = store.findings.find(
      (f) =>
        f.route === normalised.route &&
        f.component.toLowerCase() === normalised.component.toLowerCase() &&
        (normalised.wcagCriteria.length === 0 || normalised.wcagCriteria.some((c) => f.wcagCriteria.includes(c))),
    );
    if (related && normalised.component !== "unknown") {
      related.provenance.push(...normalised.provenance);
      related.occurrences += 1;
      related.lastSeenAt = now;
      audit(store, "user-report", "barrier-correlated", related.id);
      return NextResponse.json({ correlatedTo: related.id, created: false }, { status: 201 });
    }
    const res = mergeFinding(store.findings, normalised, () => nextId(store, "a11y"));
    store.findings = res.findings;
    audit(store, "user-report", "barrier-reported", res.merged.id);
    return NextResponse.json({ correlatedTo: res.isNew ? undefined : res.merged.id, created: res.isNew, id: res.merged.id }, { status: 201 });
  }

  if (body.kind === "waiver") {
    const findingIds = Array.isArray(body.findingIds) ? body.findingIds.filter((id): id is string => typeof id === "string") : [];
    const justification = str(body.justification, 1000);
    if (!findingIds.length) return bad("`findingIds` is required.");
    if (!justification) return bad("`justification` is required.");
    const unknown = findingIds.filter((id) => !store.findings.some((f) => f.id === id));
    if (unknown.length) return bad(`Unknown finding id(s): ${unknown.join(", ")}`, 404);
    const expiresAt = str(body.expiresAt, 40);
    const waiver: GateWaiver = {
      id: nextId(store, "waiver"),
      findingIds,
      release: str(body.release, 80) ?? DEFAULT_RELEASE,
      justification: redactPersonalData(justification),
      requestedBy: actor,
      requestedAt: now,
      expiresAt: expiresAt && !Number.isNaN(Date.parse(expiresAt)) ? expiresAt : new Date(Date.now() + 30 * 86_400_000).toISOString(),
      status: "pending",
    };
    store.waivers.unshift(waiver);
    audit(store, actor, "waiver-requested", waiver.id, `${findingIds.length} finding(s) for ${waiver.release}`);
    return NextResponse.json({ waiver }, { status: 201 });
  }

  return bad("`kind` must be one of findings, barrier-report, waiver.");
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  const store = getStore();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("Invalid JSON body.");
  }
  const actor = str(body.actor, 80) ?? "unknown";
  const now = new Date().toISOString();

  if (body.kind === "waiver") {
    const waiver = store.waivers.find((w) => w.id === body.id);
    if (!waiver) return bad("Waiver not found.", 404);
    if (body.decision !== "approved" && body.decision !== "rejected") return bad("`decision` must be approved or rejected.");
    if (waiver.status !== "pending") return bad("Waiver has already been decided.", 409);
    if (actor === waiver.requestedBy) return bad("A waiver cannot be approved by its requester.", 403);
    waiver.status = body.decision;
    waiver.decidedBy = actor;
    waiver.decidedAt = now;
    audit(store, actor, `waiver-${body.decision}`, waiver.id);
    return NextResponse.json({ waiver });
  }

  if (body.kind === "finding") {
    const finding = store.findings.find((f) => f.id === body.id);
    if (!finding) return bad("Finding not found.", 404);
    const changes: string[] = [];

    if (body.status !== undefined) {
      if (!isFindingStatus(body.status)) return bad("Invalid `status`.");
      const next: FindingStatus = body.status;
      if (next === "verified" && finding.status !== "fixed") return bad("Only fixed findings can be verified.", 409);
      if (next === "verified" && finding.linkedPrs.length === 0) return bad("Link a PR/fix before verifying.", 409);
      finding.status = next;
      if (next === "fixed") finding.resolvedAt = now;
      if (next === "verified") {
        finding.verifiedAt = now;
        finding.verifiedBy = actor;
      }
      if (next === "open" || next === "triaged" || next === "in-progress") {
        finding.resolvedAt = undefined;
        finding.verifiedAt = undefined;
        finding.verifiedBy = undefined;
      }
      changes.push(`status=${next}`);
    }
    if (body.assignee !== undefined) {
      finding.assignee = str(body.assignee, 80);
      changes.push(`assignee=${finding.assignee ?? "none"}`);
    }
    if (body.impact !== undefined) {
      const impact = (["critical", "serious", "moderate", "minor"] as FindingImpact[]).find((i) => i === body.impact);
      if (!impact) return bad("Invalid `impact`.");
      finding.impact = impact;
      changes.push(`impact=${impact}`);
    }
    const pr = str(body.linkPr, 200);
    if (pr) {
      if (!/^(#\d+|https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+)$/.test(pr)) return bad("`linkPr` must be #123 or a GitHub PR URL.");
      if (!finding.linkedPrs.includes(pr)) finding.linkedPrs.push(pr);
      changes.push(`pr=${pr}`);
    }
    if (!changes.length) return bad("No changes supplied.");
    audit(store, actor, "finding-updated", finding.id, changes.join(", "));
    return NextResponse.json({ finding });
  }

  return bad("`kind` must be finding or waiver.");
}
