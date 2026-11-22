# Security Policy

Soroban CrashLab handles API tokens, sessions, webhook secrets, multi-tenant
data and adversarial fuzz inputs. If you find a way to break any of that,
please tell us privately first — this page explains how, and what we commit to
in return.

> This file is mirrored at `.github/SECURITY.md` (the repository's Security
> tab). Keep the two identical — `scripts/check-doc-links.mjs` fails CI when
> they drift — and use absolute links so both copies resolve.

## Supported Versions

Per the [release policy](https://github.com/SorobanCrashLab/soroban-crashlab/blob/main/docs/releases/policy.md),
security fixes land on `main` and in a patch release of the latest minor line.
The previous minor line receives fixes for **90 days** after its successor
ships (the N-1 window).

| Version | Supported |
| --- | --- |
| `main` | ✅ |
| `v0.2.x` (latest release) | ✅ |
| `< v0.2.0` | ❌ |

## Reporting a Vulnerability

**Do not open a public issue, pull request or discussion for a vulnerability.**

1. **Preferred — GitHub private vulnerability reporting:**
   [Security → Report a vulnerability](https://github.com/SorobanCrashLab/soroban-crashlab/security/advisories/new).
   The report is visible only to you and the maintainers, and becomes the
   advisory we publish later.
2. **Fallback — if you cannot use GitHub's form:** open a public issue titled
   only `Security contact request` with **no details**. A maintainer will reply
   with a private channel (email) within the acknowledgement time below.

### What to include

- **Affected component** — e.g. `contracts/crashlab-core` (engine, CLI,
  bundle/corpus parsing), `apps/web` (API route, auth/session, RBAC, tenancy,
  webhooks, artifact upload), CI workflows, scripts, Docker images.
- **Version or commit** you tested.
- **Impact class** — which trust boundary is crossed: authentication bypass,
  privilege escalation (RBAC), cross-tenant access, secret disclosure, code
  execution from a fuzz input/bundle/artifact, integrity of results
  (forged/hidden crashes, tampered audit log), supply chain. The
  [threat model](https://github.com/SorobanCrashLab/soroban-crashlab/blob/main/docs/THREAT_MODEL_ARTIFACT_HANDLING.md)
  lists the boundaries we defend.
- **Reproduction** — minimal steps, request/response pairs or a proof of
  concept, and what you observed vs expected.
- Whether you want to be **credited**, and under what name.

### Response expectations

| Step | Target |
| --- | --- |
| Acknowledgement of your report | **48 hours** (never more than 3 business days) |
| Initial triage and severity assessment | **5 business days** |
| Status updates until resolved | at least every **10 business days** |
| Fix or mitigation plan communicated to you | **14 days** |
| Fix released — critical / high | 14 / 30 days from triage |
| Fix released — medium / low | 60 days / next scheduled release |
| Public disclosure (coordinated with you) | when the fix ships, and no later than **90 days** from your report |

We will tell you if we cannot meet a target and why. If a vulnerability is
being actively exploited we may publish an advisory with mitigations before a
fix is ready, and we will tell you first.

### Coordinated disclosure

We follow a **coordinated disclosure** model:

- Please keep details private until the advisory is published or 90 days
  have passed, whichever comes first.
- We publish a GitHub Security Advisory for every confirmed vulnerability in a
  supported version, request a CVE where warranted, and ship the fix in a
  release whose notes link the advisory.
- We will not pursue good-faith research that follows this policy: no privacy
  violations, no destruction or exfiltration of other people's data, no
  service degradation, and only accounts and deployments you own.

### Credit

Credit is **opt-in**. With your permission we name you (or your handle /
organisation) in the advisory and the release notes. There is no paid bounty.

## Scope

In scope:

- `contracts/crashlab-core` — Rust fuzzing engine, CLI and persisted formats
- `apps/web` — Next.js dashboard and API routes
- CI/CD configuration under `.github/workflows`, scripts under `scripts/` and
  `deploy/`, and published Docker images
- Vulnerabilities in dependencies that are **reachable** from CrashLab, and the
  review/rollback of dependency updates proposed here

Out of scope:

- Social engineering, phishing or physical attacks against maintainers or
  infrastructure
- Denial of service by volume (floods, resource exhaustion) without a
  security impact beyond availability
- Reports from automated scanners without a demonstrated impact
- Missing headers or best-practice suggestions with no exploit path (open a
  normal issue instead)
- Unreachable vulnerabilities in third-party dependencies (report upstream)
- Findings that require a compromised maintainer account, a malicious
  deployment operator, or physical access
- Testnet-only behaviour with no path to user impact
- Crashes **in contracts under test** that CrashLab finds — that is the
  product working; report them to the contract's authors

## Maintainer Conflicts of Interest

Assignment, triage, review, merge, severity and disclosure decisions must be
made by a maintainer who can act independently. A maintainer has a conflict
of interest when they are the reporter, author, assignee, PR author, employer,
client, sponsor, close collaborator, direct financial beneficiary, direct
competitor, or prior private implementer for the item under decision.

1. The conflicted maintainer discloses the conflict before taking any
   assignment, review, merge, severity, fix-readiness, bounty, point-award or
   disclosure decision — publicly for public items (no sensitive detail), and
   only inside the private advisory or maintainer channel for private reports.
2. An unconflicted maintainer takes ownership before the decision continues.
3. The conflicted maintainer may supply facts on request but must not approve,
   merge, assign, close, set severity, decide disclosure timing or award credit.

Timelines: replacement owner within **24 hours**, escalation to any available
unconflicted maintainer at **36 hours**. Security reports keep the timers
above: acknowledgement within **48 hours**, initial triage within **5 business
days**, fix or mitigation plan within **14 days**.

## Known Gaps and Accepted Risks

See the Operational Security Assumptions section of
[`MAINTAINER_WAVE_PLAYBOOK.md`](https://github.com/SorobanCrashLab/soroban-crashlab/blob/main/MAINTAINER_WAVE_PLAYBOOK.md#operational-security-assumptions).

## For maintainers

Intake, severity mapping, advisory and release steps, and the
repository-settings checklist are in
[`docs/security/disclosure.md`](https://github.com/SorobanCrashLab/soroban-crashlab/blob/main/docs/security/disclosure.md).
