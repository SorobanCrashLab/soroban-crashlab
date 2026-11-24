# Cross-artifact correlation workspace

`/investigations` links runs, traces, logs, state diffs, artifacts, reproducers, issues and incidents (#2304).

## Suggestions

`lib/correlation/engine.ts#suggestLinks` compares artifacts in the same workspace and scores shared metadata as signals:

| Signal | Base weight |
|---|---|
| identical content hash | 0.95 |
| same run id / same trace id | 0.90 |
| same failure signature | 0.60 |
| same commit and environment | 0.35 |
| produced close in time (corroborates other signals only) | up to 0.30 |

Signals combine with noisy-OR, so independent evidence raises confidence but never exceeds 1. Every suggestion carries its **rationale** (the reasons shown in the UI). Ordering is deterministic (confidence, then id).

## Feedback loop

Confirm or reject a suggestion. Rejected pairs never resurface; confirmed pairs are not re-suggested. `learnWeights` nudges each signal's weight down (rejections) or up (confirmations) within 0.2x-1.2x of its base, so a noisy signal quiets down without disappearing.

## Workspace

- **Graph**: a column per artifact type; solid lines are links, dashed are suggestions (opacity = confidence). A list view with real table markup is the accessible alternative.
- **Pivot**: select an artifact to see its metadata and everything within two hops; suggestions re-rank around the selection.
- Filter by artifact type and minimum confidence; link artifacts manually.
- **Investigation sets** group artifacts and links; export an **evidence bundle** (JSON) for incidents and postmortems.

## Permissions and audit

Viewers cannot write. Restricted artifacts are redacted (`[restricted]`, metadata removed) for everyone except maintainers, and bundles/suggestions never expose artifacts the caller cannot see. Scoring runs on full metadata so redaction does not change ranking. Link, decision and set changes are appended to an audit trail. The `x-crashlab-role` header is a placeholder for real auth.

## Not included yet

Persistence is in-memory. Synchronized pivots into the existing trace/log/state inspector panes, progressive graph loading for very large investigations, and embedding bundles in report generators are follow-ups.

Tests: `npm run test:features` (from `apps/web`).
