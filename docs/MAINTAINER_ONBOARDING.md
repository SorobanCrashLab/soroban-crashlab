# Maintainer Onboarding Checklist

Welcome to the Soroban CrashLab maintainer team! This checklist is designed to help new maintainers onboard quickly and understand the operational requirements, SLA targets, and policies for Drips Wave cycles.

---

## 1. Setup & Environment Verification

Before participating in issue triage or code reviews, ensure your local environment is fully set up and configured.

- [ ] **Install Prerequisites**: Ensure you have Node.js 22+ and npm 10+, Rust 1.80+ (stable), Git, and optionally the GitHub CLI (`gh`) installed.
- [ ] **Clone and Install**: Clone the repository and install the frontend dependencies:
  ```bash
  cd apps/web
  npm ci
  ```
- [ ] **Run Web Validation**: Confirm that frontend tests, linting, and production builds pass:
  ```bash
  cd apps/web
  npm run test
  npm run lint
  npm run build
  ```
- [ ] **Run Core Engine Validation**: Compile and run the Rust fuzzing engine tests:
  ```bash
  cd contracts/crashlab-core
  cargo test --all-targets
  ```

---

## 2. Issue Triage and Backlog Management

Maintainers share the responsibility of keeping the backlog curated and responding to applicants.

- [ ] **Review Project Roadmap**: Review [`docs/ROADMAP.md`](ROADMAP.md) to understand current milestone focus and issue conventions.
- [ ] **Apply Wave Labels**: Maintain consistent labeling for all open issues:
  - `wave4`: Must be applied to all current Wave issues.
  - `complexity:trivial|medium|high`: Indicates estimated complexity.
  - `area:<surface>`: (e.g., `area:fuzzer`, `area:web`, `area:docs`, `area:ops`, `area:security`).
- [ ] **Understand Contributor Limits**: Restrict assignments to a maximum of **4 issues** historically per contributor across the organization.
- [ ] **Fast Application Rejections**: Reject misaligned applications quickly using the Wave UI so contributors can reapply to other issues.
- [ ] **Run Backlog Freshness Review**: Perform the weekly freshness check every Monday at 09:00 UTC (or run `scripts/backlog-freshness-review.sh` locally) to clean up stale issues:
  - **Assigned `wave4` issues**: Stale if no updates in **3 days**. Request status, then unassign if unresponsive.
  - **Unassigned `wave4` issues**: Stale if quiet for **14 days**. Re-scope, split, or close.
  - **`wave4` + `stale` issues**: Stale if open and quiet for **7 days** with the label. Unassign and reopen.

---

## 3. SLA Targets and Escalation Path

Soroban CrashLab operates under strict SLA targets during sprint cycles to prevent automated appeals.

- [ ] **SLA Target Monitoring**:
  - **New application received**: Review and decide within **24 hours** (Wave lead escalates at 36 hours).
  - **Issue assigned**: First contributor update/progress must be posted within **24 hours** (Unassign and reopen at 48 hours).
  - **PR submitted**: First review must be completed within **24 hours** (Any maintainer can review and claim at 36 hours).
  - **PR review comments**: Contributor must respond within **48 hours** (Apply `stale` label at 60 hours).
  - **Blocked PR**: Blocked on external dependencies must be reviewed within **24 hours** (Wave lead escalates at 36 hours).
- [ ] **Run SLA Verification**: Execute the SLA checking script to identify breaching issues/PRs:
  ```bash
  bash scripts/check-sla.sh
  ```

---

## 4. Pull Request Review & Secret Scanning

When reviewing contributor submissions, maintainers must verify that code meets the quality bar and security assumptions.

- [ ] **Review Hierarchy**: Review PRs in the following priority order:
  1. Correctness and safety (ensure all inputs are validated).
  2. Adherence to the issue's strict "Definition of Done".
  3. Deterministic reproducibility of behavior (replay results are stable).
  4. Test coverage (focused unit/integration tests).
  5. Clarity, structure, and maintainability.
- [ ] **Secret Scanning Compliance**: If a PR touches configuration files, scripts, command logs, or environmental variables, verify that the contributor ran a recommended scanner (`gitleaks` or `trufflehog`) before submission.
- [ ] **Handling Secret Exposure**: If a credential or secret is exposed, immediately route to a private channel and require revocation before public review continues. Ensure the contributor removes the secret from the branch history.

---

## 5. Conflict of Interest and Resolution Policies

- [ ] **Identify Conflicts**: Disclose conflicts of interest if you are the reporter, assignee, employer, close collaborator, or financial beneficiary of the PR/issue under review.
- [ ] **Recuse and Reassign**: Recuse yourself from making decisions on conflicted items. Reassign to an unconflicted maintainer within **24 hours** (escalate to Wave lead at 36 hours).
- [ ] **Vulnerability Timeline**: For security reports, acknowledge within **48 hours**, triage within **5 business days**, and implement the fix/mitigation within **14 days**.
- [ ] **Run Conflict Policy Validation**: Validate policy logic by running:
  ```bash
  cd apps/web
  npm run test:policy
  ```
- [ ] **Resolution / Credit Policy**: If a PR is high quality but blocked by external factors, resolve it per Wave guidance to credit the contributor. Move incomplete or out-of-scope enhancements to separate linked issues.
