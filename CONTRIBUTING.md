# Contributing to Soroban CrashLab

Thanks for contributing. This project is maintainer-first and contributor-friendly: we optimize for clear issue scope, reproducible changes, and fast review cycles.

## Local setup checklist

These steps assume a brand-new contributor machine. After completing them,
you should be able to run the web verification commands and the Rust test
suite in under 20 minutes on a typical broadband connection.

### 1. Install Git

Make sure `git` is available in your shell:

```bash
git --version
```

If the command is missing, install Git from your operating system package
manager or from git-scm.com before continuing.

### 2. Install Node.js and npm

The frontend in `apps/web` targets Node.js 22+ and npm 10+.

Verify your versions:

```bash
node -v
npm -v
```

If either command is missing, install Node.js 22 LTS. The bundled npm
version that ships with Node.js 22 is supported.

### 3. Install Rust and Cargo

The core crate in `contracts/crashlab-core` uses the stable Rust toolchain.

Verify your versions:

```bash
rustc -V
cargo -V
```

If either command is missing, install Rust with `rustup` and keep the
default stable toolchain selected.

### 4. Optional: install GitHub CLI

`gh` is not required to run the app or tests locally, but it is useful for
Wave issue/PR workflows and the repository scripts under `scripts/`.

```bash
gh --version
gh auth status
```

If you do not plan to use the GitHub automation scripts yet, you can skip
this step.

Maintainers use `scripts/check-sla.sh` and `scripts/backlog-freshness-review.sh`
as described in [`MAINTAINER_WAVE_PLAYBOOK.md`](MAINTAINER_WAVE_PLAYBOOK.md).

### 5. Install frontend dependencies

```bash
cd apps/web
npm ci
```

Use `npm install` later only when you intentionally need to update
dependencies or the lockfile.

### 6. Run web verification

The web app does not currently have a dedicated test runner. Use the same
checks referenced by the maintainer playbook:

```bash
cd apps/web
npm run lint
npm run build
```

To start the local dashboard after the checks pass:

```bash
cd apps/web
npm run dev
```

### 7. Run core tests

```bash
cd contracts/crashlab-core
cargo test --all-targets
```

### 8. Expected first-run result

On a clean machine, a successful setup looks like this:

- `npm ci` completes without dependency errors
- `npm run lint` and `npm run build` both pass in `apps/web`
- `cargo test --all-targets` passes in `contracts/crashlab-core`

If one of those steps fails, include the failing command and its output in
your issue or PR so maintainers can reproduce it quickly.

## Contributor debugging playbook

Use this playbook when local setup, verification, or replay commands fail.
Each symptom maps to the most likely fix plus the commands maintainers will
usually ask you to run.

### Web checks fail with `Unsupported engine` or Next.js says Node is too old

- Likely cause: your shell is using an older Node.js version than the repo expects.
- Run:

```bash
node -v
npm -v
which node
which npm
```

- Fix: switch your shell back to Node.js 22+, then reinstall and rerun the web checks:

```bash
cd apps/web
npm ci
npm run lint
npm run build
```

### Web checks fail with `next: command not found` or `eslint: command not found`

- Likely cause: `apps/web/node_modules` is missing or only partially installed.
- Run:

```bash
cd apps/web
rm -rf node_modules
npm ci
npm run lint
npm run build
```

- Fix: if `npm ci` still fails, paste the full install error into your issue or PR instead of only the final `next` or `eslint` message.

### `cargo test --all-targets` fails before compilation starts

- Likely cause: your Rust toolchain is stale or `Cargo.lock` has unresolved local edits.
- Run:

```bash
rustc -V
cargo -V
rustup show active-toolchain
git diff -- contracts/crashlab-core/Cargo.lock
```

- Fix: if you did not intend to change dependencies, restore the lockfile and rerun the tests:

```bash
git restore contracts/crashlab-core/Cargo.lock
cd contracts/crashlab-core
cargo test --all-targets
```

### `cargo test --all-targets` compiles but fails after switching branches

- Likely cause: stale build artifacts from an older toolchain or dependency graph.
- Run:

```bash
cd contracts/crashlab-core
cargo clean
cargo test --all-targets
```

- Fix: if the failure persists, include the first Rust compiler error in your report, not only the final `could not compile` line.

### `replay-single-seed` exits non-zero with a signature or class mismatch

- Likely cause: the bundle was captured on a different commit or a materially different replay environment.
- Run:

```bash
git status --short
git rev-parse HEAD
rustc -vV | grep '^host:'
uname -sm
sed -n '1,80p' ./bundle.json
cd contracts/crashlab-core
cargo run --bin replay-single-seed -- ./bundle.json
```

- Fix: replay from a clean checkout of the same code that captured the bundle, and prefer the same OS and architecture when the bundle includes an `environment` fingerprint. For deeper replay-specific guidance, see [`docs/REPRODUCIBILITY.md`](docs/REPRODUCIBILITY.md#troubleshooting-mismatched-replays).

### Replay bundle load fails with `unsupported bundle schema version` or JSON decode errors

- Likely cause: the file is not a valid CrashLab bundle or it was produced by a newer schema than this checkout supports.
- Run:

```bash
sed -n '1,80p' ./bundle.json
cd contracts/crashlab-core
cargo test bundle_persist -- --nocapture
```

- Fix: confirm the JSON includes a top-level `schema` field, then regenerate the bundle with the current crate version or switch to a checkout that supports the bundle's schema.

### Replay result changes to `timeout`

- Likely cause: the current run is hitting a stricter wall-clock timeout than the original failure.
- Run:

```bash
grep -R -n "SimulationTimeoutConfig\|simulation_timeout_ms\|timeout_ms" contracts/crashlab-core/src README.md
cd contracts/crashlab-core
cargo test simulation -- --nocapture
```

- Fix: compare the timeout configuration used for the original failure versus your replay run, then rerun with the intended timeout before treating it as a new regression.

### What to paste when you ask for help

Include these details in one comment so maintainers can reproduce the problem faster:

```bash
git status --short
node -v
npm -v
rustc -V
cargo -V
```

Also paste the exact failing command and the first relevant error block.

## Branch and PR flow

1. Create a branch from `main` named `feat/<short-name>` or `fix/<short-name>`.
2. Keep PRs focused on one issue.
3. Link the issue in the PR description using `Closes #<number>`.
4. Include test evidence and reproduction notes for behavior changes.
5. If your change alters a public API, persisted schema, CLI contract, or
   documented maintainer workflow, call that out clearly in the PR so the next
   release maintainer can update [`CHANGELOG.md`](CHANGELOG.md) and run the
   compatibility review in [`docs/RELEASE_PROCESS.md`](docs/RELEASE_PROCESS.md).

## Conflict of interest disclosures

If you know that an issue assignment, PR review, merge, security triage, or resolution-credit decision involves a maintainer with a personal, employment, sponsor, financial, close-collaboration, direct-competition, or prior private implementation conflict, flag it early.

- For normal issues and PRs, leave a concise public comment asking for an unconflicted maintainer.
- For private vulnerability reports, keep details in GitHub private vulnerability reporting or maintainer email. Do not move sensitive security details into a public issue or PR.
- A conflicted maintainer may provide factual context when asked, but an unconflicted maintainer must own assignment, review approval, merge, severity, disclosure timing, and credit decisions.

## Quality bar

- changes are readable and maintainable
- no dead code or placeholder logic in merged PRs
- tests cover the introduced behavior
- docs are updated when user-facing behavior changes

## Security Guidance for Contributors
When adding new fuzz input handling:
- Treat all input as fully adversarial: assume any data entering via `CaseSeed` is malicious.
- Validate using `SeedSchema`: all new entry points that accept external seeds must validate them against a `SeedSchema` (from `seed_validator.rs`). Use the default schema or define appropriate bounds.
- Handle validation errors gracefully: do not panic on malformed input. Return errors or skip execution with a clear log. The `validate` method returns `Result<(), Vec<SeedValidationError>>`; propagate or handle these errors.
- Do not derive storage paths from untrusted data: if your code writes artifacts, never use raw payloads, seed IDs, or user-controlled strings in filenames. Use `compute_signature_hash` to generate safe identifiers.

When modifying artifact storage:
- Sanitize filenames: if deriving a name from untrusted data, remove path separators (`/`, `\`), null bytes, and relative path components (`..`). Prefer the signature hash.
- Prevent path traversal: ensure all path constructions use a safe base directory and resolve the final path to confirm it stays within the intended directory.
- Set file permissions: when creating files or directories, set permissions explicitly (e.g., `0o644` for files, `0o755` for directories). Do not rely on default umask.
- Handle storage exhaustion: catch I/O errors such as `ENOSPC` (no space left) and fail gracefully with a clear error message.

Security review checklist for PRs touching fuzz input or artifact storage:
- [ ] All new seed entry points call `validate` with an appropriate `SeedSchema`.
- [ ] Validation errors are handled without panicking.
- [ ] No code derives filenames directly from payload or seed ID without sanitization.
- [ ] If filenames are derived from untrusted data, is there explicit sanitization (remove path separators, resolve path)?
- [ ] File creation uses explicit permissions (e.g., `OpenOptions::new().mode(0o644)`).
- [ ] Storage I/O errors are handled and do not cause silent data loss.
- [ ] New code does not introduce null-byte vulnerabilities (e.g., by passing payloads to C APIs without checks).


## Review expectations

- Maintainers prioritize active Wave issues during the sprint window
- Contributors should respond to review comments within 24 hours when possible
- Unresolved architectural debates should move to issue discussion to keep PRs focused

## Resolution policy

- If work quality is acceptable but merge is blocked for external reasons, resolve per Wave guidance so contributor effort is credited
- Move partial work to follow-up issues with clear boundaries

## Post-resolution feedback

- Leave practical, direct feedback
- Highlight what was done well and what should improve
- Keep comments specific to code and collaboration behavior
