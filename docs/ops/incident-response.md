# Incident response

How we respond when the CrashLab service itself breaks: nightly campaigns,
storage, the dashboard, CI, or its security (#1899). For vulnerabilities
reported *to* us, follow `.github/SECURITY.md`; a confirmed exploit in
progress is a SEV1 here as well.

## Severity

| Sev | Definition | Examples | Acknowledge | Updates | Who is paged |
|---|---|---|---|---|---|
| **SEV1** | Data integrity, security, or total outage | Suspected credential compromise; corrupted or lost runs/artifacts; tampered results; dashboard and API fully down | **15 min** | every 30 min | On-call + secondary + maintainer lead, immediately |
| **SEV2** | Major function down, no data at risk | KV/Redis down (API errors, no data loss); every nightly red; deploy broke a core flow | **1 h** | every 2 h | On-call; secondary after 1 h unacknowledged |
| **SEV3** | Degraded, workaround exists | One nightly job red; storage health `degraded`; a campaign wedged | **1 business day** | daily | On-call (working hours) |
| **SEV4** | Cosmetic / no user impact | Broken chart, flaky non-gating check | Triage queue | — | — |

When unsure, pick the higher severity; downgrading later is free.
Escalation order: **on-call → secondary → maintainer lead** (CODEOWNERS
default owner) → all maintainers. Unacknowledged pages escalate one step at
the acknowledge deadline. Alert routing that implements this is W5-I06 (#1892).

## Signals → playbook

Automated signals that open issues today, and where each leads. The titles
must match the workflows exactly (checked by `scripts/check-ops-docs.mjs`).

| Signal (auto-issue title) | Source | Default sev | Playbook |
|---|---|---|---|
| `Nightly fuzz campaign: regression suite failed` | [`fuzz-campaign.yml`](../../.github/workflows/fuzz-campaign.yml) | SEV3 (SEV2 if several nightlies red) | [Mass nightly red](playbooks/nightly-red.md) |
| `CI failure: storage-driver-minio nightly` | [`storage-minio.yml`](../../.github/workflows/storage-minio.yml) | SEV3 | [Storage degraded / corrupt](playbooks/storage-degraded.md) |

Signals without automation yet (watch for them by hand, or wire them when
W5-I02 #1888 / W5-D08 #1826 land):

| Signal | Playbook |
|---|---|
| `/api/health` `degraded`/`unhealthy`, storage integrity errors (W5-E11) | [Storage degraded / corrupt](playbooks/storage-degraded.md) |
| `/api/runs` 5xx, `UpstashError` in web logs | [KV / Redis down](playbooks/kv-down.md) |
| Campaign progress stalls, heartbeat stale, run stuck in `running` | [Campaign wedge](playbooks/campaign-wedge.md) |
| Unknown token use, unexpected role change in the audit log, leaked secret | [Credential compromise](playbooks/credential-compromise.md) |
| Errors right after a deploy | [Deploy rollback](playbooks/deploy-rollback.md) |

## Roles

| Role | Does | Does not |
|---|---|---|
| **Incident commander (IC)** — the first responder until handed off | Sets severity, owns decisions, assigns roles, decides when it is over | Debug hands-on in a SEV1 (delegate) |
| **Ops lead** | Diagnoses and mitigates, following the playbook | Make external comms |
| **Comms** (IC in small incidents) | Posts status updates on schedule | Speculate about cause |
| **Scribe** (IC in small incidents) | Keeps the timeline | — |

Hand-offs are explicit: "You are now IC" / "Confirmed, I am IC".

## Communication

Open an **incident issue** titled `INCIDENT <SEV>: <short symptom>` (for a
suspected compromise use a private channel and a private security advisory
instead — never a public issue). First message, and every update:

```text
Status:      investigating | mitigating | monitoring | resolved
Severity:    SEV1–4
Impact:      who/what is affected, since when (UTC)
IC:          @handle
Next update: HH:MM UTC
Now:         what we are doing
```

## Timeline discipline

- Times in **UTC**. One line per event: `HH:MM — who — what (evidence link)`.
- Record actions *as they happen*, including the ones that did not work.
- Paste commands and outputs, not paraphrases.
- The timeline feeds the postmortem; no timeline, no postmortem.

## After the incident

- SEV1/SEV2: a blameless postmortem within **5 business days** using the
  [template](postmortem-template.md); every action item has an owner and a date.
- SEV3: a short note in the incident issue (cause, fix, follow-ups).
- Update the playbook that was used if any step was wrong or missing.

## Playbooks

1. [Storage degraded / corrupt](playbooks/storage-degraded.md)
2. [Campaign wedge](playbooks/campaign-wedge.md)
3. [KV / Redis down](playbooks/kv-down.md)
4. [Mass nightly red](playbooks/nightly-red.md)
5. [Suspected credential compromise](playbooks/credential-compromise.md)
6. [Deploy rollback](playbooks/deploy-rollback.md)

## Game days

A **quarterly** drill exercises one playbook, rotating through the list.
Format: 60 minutes, an IC and an ops lead, fault injected on the reference
stack ([`deploy/compose`](../../deploy/compose/)) or run as a tabletop.
Output: a note in [`game-days/`](game-days/) with timings, what the playbook
got wrong, and follow-ups with owners.

| Quarter | Date | Playbook | Notes |
|---|---|---|---|
| 2026 Q4 | 2026-10-16 | KV / Redis down (live fault injection) | [2026-10-16-kv-down.md](game-days/2026-10-16-kv-down.md) |
| 2027 Q1 | 2027-01-14 (scheduled) | Suspected credential compromise (tabletop) | — |
| 2027 Q2 | 2027-04-15 (scheduled) | Storage degraded / corrupt (restore drill) | — |
| 2027 Q3 | 2027-07-15 (scheduled) | Deploy rollback | — |
