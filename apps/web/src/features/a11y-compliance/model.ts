/**
 * Accessibility Compliance Automation Center — domain model (#2335).
 *
 * Pure, framework-free logic shared by the API route, the client hook and the
 * UI: normalisation of findings from heterogeneous sources, deterministic
 * deduplication with provenance, WCAG mapping, severity scoring, SLA
 * tracking, release-gate evaluation (with waivers) and report export.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FindingSource = "axe-ci" | "lint" | "runtime" | "manual-audit" | "user-report";
export type FindingImpact = "critical" | "serious" | "moderate" | "minor";
export type FindingStatus = "open" | "triaged" | "in-progress" | "fixed" | "verified" | "wont-fix";
export type WcagLevel = "A" | "AA" | "AAA";
export type WcagPrinciple = "Perceivable" | "Operable" | "Understandable" | "Robust";

/** High-risk UI surfaces that receive targeted audit coverage. */
export const HIGH_RISK_SURFACES = ["data-grid", "chart", "canvas", "diff", "trace"] as const;
export type HighRiskSurface = (typeof HIGH_RISK_SURFACES)[number];

export interface FindingProvenance {
  source: FindingSource;
  /** Source-specific identifier (axe rule id, CI job, auditor name, report id). */
  reference: string;
  detectedAt: string;
}

export interface A11yFinding {
  id: string;
  /** Stable dedupe key: route + component + rule/criterion + selector. */
  fingerprint: string;
  title: string;
  description: string;
  route: string;
  component: string;
  surface?: HighRiskSurface;
  selector?: string;
  ruleId?: string;
  wcagCriteria: string[];
  impact: FindingImpact;
  /** 0–100 priority score, derived from impact, WCAG level, reach and age. */
  score: number;
  status: FindingStatus;
  assignee?: string;
  linkedPrs: string[];
  provenance: FindingProvenance[];
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  /** True when a previously fixed/verified finding was detected again. */
  regression: boolean;
  resolvedAt?: string;
  verifiedAt?: string;
  verifiedBy?: string;
}

/** Raw input accepted from any source before normalisation. */
export interface RawFindingInput {
  title?: string;
  description?: string;
  route?: string;
  component?: string;
  surface?: string;
  selector?: string;
  ruleId?: string;
  wcagCriteria?: string[];
  impact?: string;
  reference?: string;
  detectedAt?: string;
}

export interface GateWaiver {
  id: string;
  findingIds: string[];
  release: string;
  justification: string;
  requestedBy: string;
  requestedAt: string;
  expiresAt: string;
  status: "pending" | "approved" | "rejected";
  decidedBy?: string;
  decidedAt?: string;
}

export interface AuditEntry {
  at: string;
  actor: string;
  action: string;
  target: string;
  detail?: string;
}

export interface GatePolicy {
  /** Max open findings per impact before the gate fails (unwaived). */
  maxOpen: Record<FindingImpact, number>;
  /** Fail on any unwaived regression. */
  blockOnRegression: boolean;
}

export const DEFAULT_GATE_POLICY: GatePolicy = {
  maxOpen: { critical: 0, serious: 0, moderate: 10, minor: Number.POSITIVE_INFINITY },
  blockOnRegression: true,
};

export interface GateEvaluation {
  release: string;
  status: "pass" | "warn" | "fail";
  blocking: A11yFinding[];
  waived: A11yFinding[];
  reasons: string[];
  evaluatedAt: string;
}

// ---------------------------------------------------------------------------
// WCAG catalogue (2.2 criteria most relevant to CrashLab surfaces)
// ---------------------------------------------------------------------------

export interface WcagCriterion {
  id: string;
  name: string;
  level: WcagLevel;
  principle: WcagPrinciple;
  /** Design-system / component guidance for remediation. */
  guidance: string;
}

export const WCAG_CRITERIA: WcagCriterion[] = [
  { id: "1.1.1", name: "Non-text Content", level: "A", principle: "Perceivable", guidance: "Give charts and canvas views a text alternative (summary table or aria-describedby)." },
  { id: "1.3.1", name: "Info and Relationships", level: "A", principle: "Perceivable", guidance: "Use semantic table markup (th scope, caption) in data grids; label form groups with fieldset/legend." },
  { id: "1.3.2", name: "Meaningful Sequence", level: "A", principle: "Perceivable", guidance: "Keep DOM order aligned with visual order in split diff and trace panes." },
  { id: "1.4.1", name: "Use of Color", level: "A", principle: "Perceivable", guidance: "Pair diff add/remove colours and severity badges with icons or text labels." },
  { id: "1.4.3", name: "Contrast (Minimum)", level: "AA", principle: "Perceivable", guidance: "Use theme tokens from add-theme-tokens-and-contrast; body text ≥ 4.5:1." },
  { id: "1.4.10", name: "Reflow", level: "AA", principle: "Perceivable", guidance: "Wide grids must scroll within a labelled region rather than the page at 320px." },
  { id: "1.4.11", name: "Non-text Contrast", level: "AA", principle: "Perceivable", guidance: "Chart series, focus rings and control borders need ≥ 3:1 contrast." },
  { id: "1.4.13", name: "Content on Hover or Focus", level: "AA", principle: "Perceivable", guidance: "Chart tooltips must be dismissible (Esc), hoverable and persistent." },
  { id: "2.1.1", name: "Keyboard", level: "A", principle: "Operable", guidance: "Use the data-table keyboard nav hook; canvas/trace views need arrow-key navigation." },
  { id: "2.1.2", name: "No Keyboard Trap", level: "A", principle: "Operable", guidance: "Modals and code editors must release focus via Esc or documented shortcut." },
  { id: "2.4.3", name: "Focus Order", level: "A", principle: "Operable", guidance: "Return focus to the trigger when drawers and modals close." },
  { id: "2.4.6", name: "Headings and Labels", level: "AA", principle: "Operable", guidance: "Each dashboard panel needs a descriptive heading referenced by aria-labelledby." },
  { id: "2.4.7", name: "Focus Visible", level: "AA", principle: "Operable", guidance: "Never remove outlines without a focus-visible replacement." },
  { id: "2.4.11", name: "Focus Not Obscured (Minimum)", level: "AA", principle: "Operable", guidance: "Sticky headers/toolbars must not cover focused rows in grids." },
  { id: "2.5.8", name: "Target Size (Minimum)", level: "AA", principle: "Operable", guidance: "Icon buttons in toolbars must be at least 24×24 CSS px." },
  { id: "3.2.2", name: "On Input", level: "A", principle: "Understandable", guidance: "Filters must not navigate or reorder focus unexpectedly on change." },
  { id: "3.3.1", name: "Error Identification", level: "A", principle: "Understandable", guidance: "Associate validation messages with inputs via aria-describedby." },
  { id: "3.3.2", name: "Labels or Instructions", level: "A", principle: "Understandable", guidance: "Every input needs a visible label; placeholders are not labels." },
  { id: "4.1.2", name: "Name, Role, Value", level: "A", principle: "Robust", guidance: "Custom widgets (tabs, toggles, tree rows) need correct roles and states." },
  { id: "4.1.3", name: "Status Messages", level: "AA", principle: "Robust", guidance: "Announce async results (loading, saved, filtered counts) via role=status." },
];

const CRITERIA_BY_ID = new Map(WCAG_CRITERIA.map((c) => [c.id, c]));

export function getCriterion(id: string): WcagCriterion | undefined {
  return CRITERIA_BY_ID.get(id);
}

/** Common axe rule → WCAG criterion mapping used when a source omits criteria. */
export const AXE_RULE_TO_WCAG: Record<string, string[]> = {
  "color-contrast": ["1.4.3"],
  "image-alt": ["1.1.1"],
  "svg-img-alt": ["1.1.1"],
  label: ["3.3.2", "4.1.2"],
  "button-name": ["4.1.2"],
  "link-name": ["4.1.2"],
  "aria-required-children": ["1.3.1"],
  "td-headers-attr": ["1.3.1"],
  "th-has-data-cells": ["1.3.1"],
  "scrollable-region-focusable": ["2.1.1"],
  "focus-order-semantics": ["2.4.3"],
  "target-size": ["2.5.8"],
  "aria-valid-attr-value": ["4.1.2"],
};

// ---------------------------------------------------------------------------
// Normalisation, scoring and deduplication
// ---------------------------------------------------------------------------

const IMPACTS: FindingImpact[] = ["critical", "serious", "moderate", "minor"];
const SOURCES: FindingSource[] = ["axe-ci", "lint", "runtime", "manual-audit", "user-report"];
const STATUSES: FindingStatus[] = ["open", "triaged", "in-progress", "fixed", "verified", "wont-fix"];

export function isFindingSource(value: unknown): value is FindingSource {
  return typeof value === "string" && (SOURCES as string[]).includes(value);
}

export function isFindingStatus(value: unknown): value is FindingStatus {
  return typeof value === "string" && (STATUSES as string[]).includes(value);
}

export function normaliseImpact(value: string | undefined): FindingImpact {
  const v = (value ?? "").toLowerCase();
  if ((IMPACTS as string[]).includes(v)) return v as FindingImpact;
  // Map common aliases from lint / manual audit tooling.
  if (v === "error" || v === "blocker" || v === "high") return "serious";
  if (v === "warning" || v === "medium") return "moderate";
  return "minor";
}

export function normaliseSurface(value: string | undefined): HighRiskSurface | undefined {
  const v = (value ?? "").toLowerCase().replace(/[\s_]+/g, "-");
  if ((HIGH_RISK_SURFACES as readonly string[]).includes(v)) return v as HighRiskSurface;
  if (v === "grid" || v === "table") return "data-grid";
  if (v === "charts") return "chart";
  return undefined;
}

export function normaliseRoute(value: string | undefined): string {
  const raw = (value ?? "/").trim() || "/";
  // Strip origin, query and hash; collapse dynamic ids so findings group by route template.
  const path = raw.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0] || "/";
  return (
    path
      .split("/")
      .map((seg) => (/^[0-9a-f-]{8,}$/i.test(seg) || /^\d+$/.test(seg) ? "[id]" : seg))
      .join("/")
      .replace(/\/+$/, "") || "/"
  );
}

/** Stable string hash (FNV-1a, 32-bit) for deterministic fingerprints. */
export function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function computeFingerprint(f: {
  route: string;
  component: string;
  ruleId?: string;
  wcagCriteria: string[];
  selector?: string;
}): string {
  const rule = f.ruleId ?? [...f.wcagCriteria].sort().join(",");
  return stableHash([f.route, f.component.toLowerCase(), rule, f.selector ?? ""].join("|"));
}

const IMPACT_WEIGHT: Record<FindingImpact, number> = { critical: 50, serious: 35, moderate: 20, minor: 8 };
const LEVEL_WEIGHT: Record<WcagLevel, number> = { A: 20, AA: 12, AAA: 4 };

/** Priority score 0–100: impact + strictest WCAG level + reach + high-risk surface bonus. */
export function scoreFinding(f: Pick<A11yFinding, "impact" | "wcagCriteria" | "occurrences" | "surface" | "provenance">): number {
  const levels = f.wcagCriteria.map((id) => getCriterion(id)?.level).filter((l): l is WcagLevel => !!l);
  const levelScore = levels.length ? Math.max(...levels.map((l) => LEVEL_WEIGHT[l])) : 6;
  const reach = Math.min(15, Math.round(Math.log2(1 + f.occurrences) * 4));
  const surfaceBonus = f.surface ? 5 : 0;
  const userReported = f.provenance.some((p) => p.source === "user-report") ? 10 : 0;
  return Math.min(100, IMPACT_WEIGHT[f.impact] + levelScore + reach + surfaceBonus + userReported);
}

/**
 * Remove personal data from free text submitted by users (emails, tokens in
 * URLs, long digit sequences) so barrier reports are privacy-safe at rest.
 */
export function redactPersonalData(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/([?&](?:token|key|auth|session|code)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\b\d{9,}\b/g, "[redacted-number]")
    .slice(0, 2000);
}

export function normaliseFinding(raw: RawFindingInput, source: FindingSource, now: string): Omit<A11yFinding, "id"> {
  const route = normaliseRoute(raw.route);
  const component = (raw.component ?? "unknown").trim() || "unknown";
  const ruleId = raw.ruleId?.trim() || undefined;
  const fromRule = ruleId ? AXE_RULE_TO_WCAG[ruleId] ?? [] : [];
  const wcagCriteria = Array.from(
    new Set([...(raw.wcagCriteria ?? []), ...fromRule].map((c) => c.trim()).filter((c) => /^\d\.\d{1,2}\.\d{1,2}$/.test(c))),
  ).sort();
  const isUser = source === "user-report";
  const title = (raw.title ?? ruleId ?? "Accessibility issue").trim();
  const description = raw.description ?? "";
  const detectedAt = raw.detectedAt && !Number.isNaN(Date.parse(raw.detectedAt)) ? raw.detectedAt : now;

  const base = {
    fingerprint: "",
    title: isUser ? redactPersonalData(title).slice(0, 200) : title,
    description: isUser ? redactPersonalData(description) : description,
    route,
    component,
    surface: normaliseSurface(raw.surface),
    selector: raw.selector,
    ruleId,
    wcagCriteria,
    impact: normaliseImpact(raw.impact),
    score: 0,
    status: "open" as FindingStatus,
    linkedPrs: [],
    provenance: [{ source, reference: (raw.reference ?? source).slice(0, 200), detectedAt }],
    occurrences: 1,
    firstSeenAt: detectedAt,
    lastSeenAt: detectedAt,
    regression: false,
  };
  base.fingerprint = computeFingerprint(base);
  base.score = scoreFinding(base);
  return base;
}

const IMPACT_RANK: Record<FindingImpact, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

/**
 * Merge a normalised finding into an existing set. Duplicates (same
 * fingerprint) accumulate provenance and occurrences; a duplicate of a
 * fixed/verified finding re-opens it as a regression.
 */
export function mergeFinding(
  existing: A11yFinding[],
  incoming: Omit<A11yFinding, "id">,
  makeId: () => string,
): { findings: A11yFinding[]; merged: A11yFinding; isNew: boolean; isRegression: boolean } {
  const idx = existing.findIndex((f) => f.fingerprint === incoming.fingerprint);
  if (idx === -1) {
    const created: A11yFinding = { ...incoming, id: makeId() };
    return { findings: [...existing, created], merged: created, isNew: true, isRegression: false };
  }
  const prev = existing[idx];
  const provKey = (p: FindingProvenance) => `${p.source}|${p.reference}|${p.detectedAt}`;
  const seen = new Set(prev.provenance.map(provKey));
  const provenance = [...prev.provenance, ...incoming.provenance.filter((p) => !seen.has(provKey(p)))];
  const wasResolved = prev.status === "fixed" || prev.status === "verified";
  const impact = IMPACT_RANK[incoming.impact] < IMPACT_RANK[prev.impact] ? incoming.impact : prev.impact;
  const merged: A11yFinding = {
    ...prev,
    impact,
    surface: prev.surface ?? incoming.surface,
    wcagCriteria: Array.from(new Set([...prev.wcagCriteria, ...incoming.wcagCriteria])).sort(),
    provenance,
    occurrences: prev.occurrences + 1,
    lastSeenAt: incoming.lastSeenAt > prev.lastSeenAt ? incoming.lastSeenAt : prev.lastSeenAt,
    status: wasResolved ? "open" : prev.status,
    regression: prev.regression || wasResolved,
    resolvedAt: wasResolved ? undefined : prev.resolvedAt,
    verifiedAt: wasResolved ? undefined : prev.verifiedAt,
    verifiedBy: wasResolved ? undefined : prev.verifiedBy,
  };
  merged.score = scoreFinding(merged);
  const findings = existing.slice();
  findings[idx] = merged;
  return { findings, merged, isNew: false, isRegression: wasResolved };
}

// ---------------------------------------------------------------------------
// SLA, aggregation and querying
// ---------------------------------------------------------------------------

/** Remediation SLA in days per impact. */
export const SLA_DAYS: Record<FindingImpact, number> = { critical: 7, serious: 14, moderate: 30, minor: 90 };

export function isOpenStatus(s: FindingStatus): boolean {
  return s === "open" || s === "triaged" || s === "in-progress";
}

export type SlaState = "ok" | "at-risk" | "breached" | "closed";

export function slaState(f: A11yFinding, now: Date = new Date()): SlaState {
  if (!isOpenStatus(f.status)) return "closed";
  const ageDays = (now.getTime() - Date.parse(f.firstSeenAt)) / 86_400_000;
  const limit = SLA_DAYS[f.impact];
  if (ageDays > limit) return "breached";
  if (ageDays > limit * 0.75) return "at-risk";
  return "ok";
}

export interface FindingQuery {
  status?: FindingStatus | "open-any";
  impact?: FindingImpact;
  source?: FindingSource;
  route?: string;
  surface?: HighRiskSurface;
  criterion?: string;
  assignee?: string;
  search?: string;
}

export function filterFindings(findings: A11yFinding[], q: FindingQuery): A11yFinding[] {
  const search = q.search?.trim().toLowerCase();
  return findings.filter((f) => {
    if (q.status === "open-any" && !isOpenStatus(f.status)) return false;
    if (q.status && q.status !== "open-any" && f.status !== q.status) return false;
    if (q.impact && f.impact !== q.impact) return false;
    if (q.source && !f.provenance.some((p) => p.source === q.source)) return false;
    if (q.route && f.route !== q.route) return false;
    if (q.surface && f.surface !== q.surface) return false;
    if (q.criterion && !f.wcagCriteria.includes(q.criterion)) return false;
    if (q.assignee && f.assignee !== q.assignee) return false;
    if (search && !`${f.title} ${f.component} ${f.route} ${f.ruleId ?? ""}`.toLowerCase().includes(search)) return false;
    return true;
  });
}

/** Deterministic priority order: score desc, impact, first seen, id. */
export function sortByPriority(findings: A11yFinding[]): A11yFinding[] {
  return findings.slice().sort(
    (a, b) =>
      b.score - a.score ||
      IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] ||
      a.firstSeenAt.localeCompare(b.firstSeenAt) ||
      a.id.localeCompare(b.id),
  );
}

export interface Hotspot {
  key: string;
  open: number;
  critical: number;
  score: number;
}

export function hotspots(findings: A11yFinding[], by: "route" | "component"): Hotspot[] {
  const map = new Map<string, Hotspot>();
  for (const f of findings) {
    if (!isOpenStatus(f.status)) continue;
    const key = f[by];
    const h = map.get(key) ?? { key, open: 0, critical: 0, score: 0 };
    h.open += 1;
    if (f.impact === "critical" || f.impact === "serious") h.critical += 1;
    h.score += f.score;
    map.set(key, h);
  }
  return [...map.values()].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

export interface CriterionConformance {
  criterion: WcagCriterion;
  open: number;
  resolved: number;
  status: "conformant" | "partial" | "non-conformant";
}

export function conformanceByCriterion(findings: A11yFinding[]): CriterionConformance[] {
  return WCAG_CRITERIA.map((criterion) => {
    const related = findings.filter((f) => f.wcagCriteria.includes(criterion.id));
    const open = related.filter((f) => isOpenStatus(f.status));
    const resolved = related.length - open.length;
    const hasSevere = open.some((f) => f.impact === "critical" || f.impact === "serious");
    const status: CriterionConformance["status"] =
      open.length === 0 ? "conformant" : hasSevere ? "non-conformant" : "partial";
    return { criterion, open: open.length, resolved, status };
  });
}

export interface SurfaceCoverage {
  surface: HighRiskSurface;
  audited: boolean;
  sources: FindingSource[];
  open: number;
  lastAuditedAt?: string;
}

export function surfaceCoverage(findings: A11yFinding[]): SurfaceCoverage[] {
  return HIGH_RISK_SURFACES.map((surface) => {
    const related = findings.filter((f) => f.surface === surface);
    const sources = Array.from(new Set(related.flatMap((f) => f.provenance.map((p) => p.source)))).sort() as FindingSource[];
    const lastAuditedAt = related.reduce<string | undefined>(
      (acc, f) => (!acc || f.lastSeenAt > acc ? f.lastSeenAt : acc),
      undefined,
    );
    return {
      surface,
      audited: sources.includes("manual-audit"),
      sources,
      open: related.filter((f) => isOpenStatus(f.status)).length,
      lastAuditedAt,
    };
  });
}

export interface TrendPoint {
  date: string;
  opened: number;
  resolved: number;
  openTotal: number;
}

/** Daily trend snapshot for the last `days` days (UTC). */
export function trend(findings: A11yFinding[], days: number, now: Date = new Date()): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const date = d.toISOString().slice(0, 10);
    const end = new Date(d.getTime() + 86_400_000).toISOString();
    const opened = findings.filter((f) => f.firstSeenAt.slice(0, 10) === date).length;
    const resolved = findings.filter((f) => f.resolvedAt?.slice(0, 10) === date).length;
    const openTotal = findings.filter((f) => f.firstSeenAt < end && (!f.resolvedAt || f.resolvedAt >= end)).length;
    points.push({ date, opened, resolved, openTotal });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Release gate
// ---------------------------------------------------------------------------

export function activeWaiverIds(waivers: GateWaiver[], release: string, now: Date = new Date()): Set<string> {
  const ids = new Set<string>();
  for (const w of waivers) {
    if (w.status !== "approved" || w.release !== release) continue;
    if (Date.parse(w.expiresAt) < now.getTime()) continue;
    w.findingIds.forEach((id) => ids.add(id));
  }
  return ids;
}

export function evaluateGate(
  findings: A11yFinding[],
  waivers: GateWaiver[],
  release: string,
  policy: GatePolicy = DEFAULT_GATE_POLICY,
  now: Date = new Date(),
): GateEvaluation {
  const waivedIds = activeWaiverIds(waivers, release, now);
  const open = sortByPriority(findings.filter((f) => isOpenStatus(f.status)));
  const waived = open.filter((f) => waivedIds.has(f.id));
  const unwaived = open.filter((f) => !waivedIds.has(f.id));

  const reasons: string[] = [];
  const blocking: A11yFinding[] = [];
  for (const impact of IMPACTS) {
    const items = unwaived.filter((f) => f.impact === impact);
    if (items.length > policy.maxOpen[impact]) {
      reasons.push(`${items.length} unwaived ${impact} finding(s) exceed the limit of ${policy.maxOpen[impact]}.`);
      blocking.push(...items);
    }
  }
  if (policy.blockOnRegression) {
    const regressions = unwaived.filter((f) => f.regression && !blocking.includes(f));
    if (regressions.length) {
      reasons.push(`${regressions.length} unwaived regression(s) detected.`);
      blocking.push(...regressions);
    }
  }

  const breached = unwaived.filter((f) => slaState(f, now) === "breached").length;
  let status: GateEvaluation["status"] = blocking.length ? "fail" : "pass";
  if (status === "pass" && (breached > 0 || waived.length > 0)) {
    status = "warn";
    if (breached) reasons.push(`${breached} finding(s) past remediation SLA.`);
    if (waived.length) reasons.push(`${waived.length} finding(s) covered by approved waivers.`);
  }
  if (!reasons.length) reasons.push("No blocking accessibility findings.");

  return { release, status, blocking: sortByPriority(blocking), waived, reasons, evaluatedAt: now.toISOString() };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const VPAT_LABEL: Record<CriterionConformance["status"], string> = {
  conformant: "Supports",
  partial: "Partially Supports",
  "non-conformant": "Does Not Support",
};

/** VPAT-oriented markdown summary (internal use; not a legal conformance claim). */
export function buildComplianceReport(
  findings: A11yFinding[],
  gate: GateEvaluation,
  now: Date = new Date(),
): string {
  const rows = conformanceByCriterion(findings);
  const open = findings.filter((f) => isOpenStatus(f.status));
  const lines: string[] = [
    `# Accessibility Conformance Summary — ${gate.release}`,
    "",
    `Generated ${now.toISOString()}. Internal VPAT-oriented summary against WCAG 2.2 A/AA; not a formal conformance claim.`,
    "",
    `- Release gate: **${gate.status.toUpperCase()}**`,
    `- Open findings: ${open.length} (critical ${open.filter((f) => f.impact === "critical").length}, serious ${open.filter((f) => f.impact === "serious").length})`,
    `- Regressions: ${open.filter((f) => f.regression).length}`,
    `- Waived for this release: ${gate.waived.length}`,
    "",
    "## WCAG criteria",
    "",
    "| Criterion | Level | Conformance | Open | Remarks |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| ${r.criterion.id} ${r.criterion.name} | ${r.criterion.level} | ${VPAT_LABEL[r.status]} | ${r.open} | ${r.open ? r.criterion.guidance : ""} |`,
    ),
    "",
    "## Gate reasons",
    "",
    ...gate.reasons.map((r) => `- ${r}`),
    "",
  ];
  return lines.join("\n");
}

export function buildTrendCsv(points: TrendPoint[]): string {
  return ["date,opened,resolved,open_total", ...points.map((p) => `${p.date},${p.opened},${p.resolved},${p.openTotal}`)].join("\n");
}
