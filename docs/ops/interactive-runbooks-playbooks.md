# Interactive runbooks and debugging playbooks

Guided, auditable response steps (#2301). UI at `/runbooks` and `/runbooks/<executionId>`.

## Model

A **template** is an ordered list of steps (`manual`, `decision`, `automation`). Steps can require evidence (`log`, `trace`, `diff`, `artifact`, `screenshot`, `note`), a minimum role, an SLA hint, and a **condition** on an earlier decision (`{stepId, equals}`), which gives branching. `features/runbooks/engine.ts` owns all rules; the UI and API only call it.

## Governance

- Editing a template creates a new **draft** version; a maintainer must approve it. Only approved versions can be executed.
- Templates show a freshness label and are flagged **stale** after 90 days.
- The catalog ranks approved, matching (failure type / service) templates first.

## Execution

- Starting a playbook records where it was launched from (`/runbooks?source=incident&ref=inc-14`; the topology explorer links here).
- A step cannot be completed until its required evidence is attached; decision steps need a valid outcome; steps not matching a branch are skipped.
- **Automation steps** support a **dry run** (describes the effect and is audited). Steps marked `requiresApproval` need a maintainer approval, and a requester cannot approve their own request.
- Every transition is appended to the execution's audit timeline. Executions are persisted server-side, resumable, and polled so collaborators see progress.
- Finishing produces a summary (steps, evidence count, duration) and collects helpful / needs-work feedback.

## API

`GET/POST /api/runbooks` (list, create, revise, approve) and `GET/POST /api/runbooks/executions` (start, evidence, complete, block, dry_run, request_approval, approve, feedback). Roles come from `x-crashlab-role`; this header is a placeholder for real auth and defaults to the least privilege (`viewer`).

## Not included yet

Automation actions are described and audited but not wired to the real rerun/replay/pause/notify/issue services; storage is in-memory; usage analytics and improvement suggestions beyond the feedback field are future work.

Tests: `npm run test:features` (from `apps/web`).
