# Label taxonomy and triage lifecycle

This is the **authoritative** reference for issue/PR labels in Soroban CrashLab.
It documents which labels the automation depends on, who owns them, and how an
issue moves from creation to closure. When this file and any script disagree,
treat the script that consumes the label (listed below) as the source of truth
and open a docs issue.

Related: [`../MAINTAINER_WAVE_PLAYBOOK.md`](../MAINTAINER_WAVE_PLAYBOOK.md),
[`../CONTRIBUTING.md`](../CONTRIBUTING.md).

## Authoritative labels

Only the labels below are authoritative. Everything under
[Deprecated labels](#deprecated-labels) must not be applied to new issues.

| Label | Values | Owner | Purpose | Automation that depends on it |
| --- | --- | --- | --- | --- |
| `wave4` | — | Triage maintainer | Marks an issue as part of the active Stellar Wave backlog | `scripts/backlog-freshness-review.sh`, `.github/workflows/backlog-freshness.yml`, maintainer board queries |
| `Stellar Wave` | — | Triage maintainer | Program participation tracking | Wave reporting |
| `complexity:*` | `complexity:trivial`, `complexity:medium`, `complexity:high` | Triage maintainer (set at triage) | Required scope-sizing signal | `scripts/triage-reminder.sh` (flags unassigned `complexity:high`) |
| `area:*` | `area:fuzzer`, `area:runtime`, `area:generator`, `area:web`, `area:docs`, `area:ops`, `area:security` | Triage maintainer (set at triage) | Which subsystem the issue touches | `scripts/triage-reminder.sh` (completeness check), `scripts/detect-duplicates.py` (area overlap) |
| `type:*` | `type:task`, `type:feature` | Triage maintainer | Classifies the work | Wave reporting, duplicate detection |
| `rfc` | — | Issue author / maintainer | Marks a Request-for-Comments issue | RFC workflow |
| `blocked` | — | Triage maintainer | Blocked on a dependency or external factor | `MAINTAINER_WAVE_PLAYBOOK.md` blocked-PR query, `scripts/check-sla.sh` |
| `stale` | — | Automation only | Applied by the stale bot after inactivity | `.github/workflows/stale.yml`, `scripts/suggest-stale-labels.sh` |

### Reserved automation labels (do not repurpose)

These labels are consumed by automation and **must keep their exact names**.
Do not rename, reuse, or remove them.

| Label | Reserved for |
| --- | --- |
| `pinned` | Stale exemption (`.github/workflows/stale.yml`) |
| `security` | Stale exemption **and** security triage; staleness depends on this exact name |
| `backlog` | Stale exemption |
| `dependencies` | PR stale exemption |

## Deprecated labels

The backlog accumulated legacy labels with overlapping meaning. Retire them and
map any existing usage onto the canonical labels above.

| Deprecated | Canonical replacement |
| --- | --- |
| bare `high` | `complexity:high` |
| bare `medium` | `complexity:medium` |
| bare `trivial` | `complexity:trivial` |
| `severity:hard` / `severity:*` | `complexity:*` (scope) — reserve `security` for security triage |
| `priority:high` / `priority:*` | `complexity:*` |
| `stack:*` | `area:*` (the subsystem, not the language) |
| `touch:*` | `area:*` |
| `area:dx` | `area:docs` or `area:web` (whichever subsystem the change targets) |

### Cleanup commands (run by a maintainer with `gh` authenticated)

List current labels to confirm what exists before deleting:

```bash
gh label list --repo SorobanCrashLab/soroban-crashlab --limit 200
```

Migrate an issue off a deprecated label (repeat per issue):

```bash
gh issue edit <number> --repo SorobanCrashLab/soroban-crashlab \
  --remove-label "high" --add-label "complexity:high"
```

Delete a deprecated label once no issue uses it:

```bash
gh label delete "high" --repo SorobanCrashLab/soroban-crashlab --yes
```

> Never delete `security`, `pinned`, `backlog`, or `dependencies` — the stale
> workflow exemptions depend on those exact names.

The canonical labels are created/updated by
`scripts/bootstrap-wave4-labels.sh` (idempotent upsert). Run it after cleanup to
restore any accidental deletion.

## Issue lifecycle

1. **Create** — an issue opens from a template (`.github/ISSUE_TEMPLATE/`).
2. **Triage SLA: 48h** — the triage maintainer applies the required labels:
   `wave4`, `complexity:*`, and at least one `area:*` (plus `type:*` where
   useful). Unlabelled, unassigned issues escalate to the wave lead at 72h.
3. **Assign** — a contributor is assigned. Contributors follow the branch/PR
   rules in [`../CONTRIBUTING.md`](../CONTRIBUTING.md).
4. **SLA timers** — `scripts/check-sla.sh` flags breaches:
   - open PR without review > **24h** (`PR_SLA_H`),
   - assigned issue without update > **48h** (`ISSUE_SLA_H`),
   - blocked PR without update > **24h** (`BLOCKED_PR_SLA_H`).
5. **Backlog freshness** — `scripts/backlog-freshness-review.sh` (weekly,
   `.github/workflows/backlog-freshness.yml`) reports:
   - assigned `wave4` issues not updated in **3d** (`ASSIGNED_STALE_DAYS`),
   - unassigned `wave4` issues not updated in **14d** (`UNASSIGNED_STALE_DAYS`),
   - `wave4` + `stale` issues still open after **7d** (`STALE_LABEL_QUIET_DAYS`).
6. **Stale/close** — `.github/workflows/stale.yml` marks issues/PRs stale after
   **60 days** of inactivity and closes them **7 days** later, unless they carry
   a reserved exemption label (`pinned`, `security`, `backlog`, `dependencies`).
7. **Resolve** — merge or close per the resolution policy in
   [`../CONTRIBUTING.md`](../CONTRIBUTING.md).

## Required labels (what `scripts/label-audit.sh` enforces)

For every open issue labelled `wave4`, the audit expects:

- exactly one `complexity:*` label,
- at least one `area:*` label.

It also reports any issue still carrying a deprecated label. Missing labels are
warnings, not failures, so the check is safe to run as an optional CI step.

```bash
bash scripts/label-audit.sh [--repo OWNER/REPO]
```

## Label operations

- `scripts/bootstrap-wave4-labels.sh` — create/update the canonical labels.
- `scripts/label-audit.sh` — report issues missing required labels or carrying
  deprecated ones.
- `scripts/suggest-stale-labels.sh` — suggest `stale` candidates.
- `scripts/triage-reminder.sh` — high-priority triage queue.
