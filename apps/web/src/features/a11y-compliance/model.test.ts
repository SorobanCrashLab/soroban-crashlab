import assert from "node:assert/strict";
import {
  buildComplianceReport,
  evaluateGate,
  mergeFinding,
  normaliseFinding,
  normaliseRoute,
  redactPersonalData,
  sortByPriority,
  type A11yFinding,
  type GateWaiver,
} from "./model";

const NOW = "2026-11-21T00:00:00.000Z";
let seq = 0;
const makeId = () => `a11y-${++seq}`;

// Route normalisation collapses ids, strips origin/query.
assert.equal(normaliseRoute("https://x.dev/runs/42/trace?x=1#y"), "/runs/[id]/trace");
assert.equal(normaliseRoute(""), "/");

// Axe rule → WCAG mapping and impact aliases.
const a = normaliseFinding({ route: "/runs", component: "RunTable", ruleId: "color-contrast", impact: "error", selector: "td" }, "axe-ci", NOW);
assert.deepEqual(a.wcagCriteria, ["1.4.3"]);
assert.equal(a.impact, "serious");

// Dedupe across sources merges provenance; keeps most severe impact.
let findings: A11yFinding[] = [];
findings = mergeFinding(findings, a, makeId).findings;
const dup = normaliseFinding({ route: "/runs/", component: "runtable", ruleId: "color-contrast", impact: "critical", selector: "td", reference: "audit-1" }, "manual-audit", NOW);
const merged = mergeFinding(findings, dup, makeId);
assert.equal(merged.isNew, false);
assert.equal(merged.findings.length, 1);
assert.equal(merged.merged.occurrences, 2);
assert.equal(merged.merged.impact, "critical");
assert.deepEqual(merged.merged.provenance.map((p) => p.source), ["axe-ci", "manual-audit"]);
findings = merged.findings;

// Re-detection of a verified finding flags a regression.
findings[0] = { ...findings[0], status: "verified" };
const again = mergeFinding(findings, a, makeId);
assert.equal(again.isRegression, true);
assert.equal(again.merged.status, "open");
assert.equal(again.merged.regression, true);
findings = again.findings;

// Gate fails on unwaived critical; approved waiver downgrades to warn.
const gate = evaluateGate(findings, [], "v1", undefined, new Date(NOW));
assert.equal(gate.status, "fail");
const waiver: GateWaiver = {
  id: "w1", findingIds: [findings[0].id], release: "v1", justification: "x", requestedBy: "dev",
  requestedAt: NOW, expiresAt: "2026-12-31T00:00:00.000Z", status: "approved", decidedBy: "lead",
};
assert.equal(evaluateGate(findings, [waiver], "v1", undefined, new Date(NOW)).status, "warn");
// Expired or other-release waivers are ignored.
assert.equal(evaluateGate(findings, [{ ...waiver, expiresAt: "2026-01-01T00:00:00.000Z" }], "v1", undefined, new Date(NOW)).status, "fail");
assert.equal(evaluateGate(findings, [waiver], "v2", undefined, new Date(NOW)).status, "fail");

// Privacy redaction for user reports.
const r = redactPersonalData("mail me at jane@example.com /runs?token=abc123 id 1234567890");
assert.ok(!r.includes("jane@example.com"));
assert.ok(!r.includes("abc123"));
assert.ok(!r.includes("1234567890"));
const user = normaliseFinding({ description: "contact bob@corp.io" }, "user-report", NOW);
assert.ok(user.description.includes("[redacted-email]"));

// Deterministic ordering.
const b = { ...findings[0], id: "z", score: findings[0].score };
const order1 = sortByPriority([b, findings[0]]).map((f) => f.id);
const order2 = sortByPriority([findings[0], b]).map((f) => f.id);
assert.deepEqual(order1, order2);

// Report export includes VPAT labels.
assert.match(buildComplianceReport(findings, gate, new Date(NOW)), /Does Not Support/);

console.log("a11y-compliance model tests passed");
