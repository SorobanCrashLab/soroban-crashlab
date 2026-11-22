# Release policy: semantic versioning by surface

Status: adopted with #1901. Release mechanics live in
[`checklist.md`](checklist.md) and [`docs/RELEASE_PROCESS.md`](../RELEASE_PROCESS.md);
this page decides **which number moves**.

Versions are `vMAJOR.MINOR.PATCH`. While the project is `0.x`, a breaking
change bumps **MINOR** (`0.2.0 → 0.3.0`) and everything else bumps PATCH; from
`1.0.0` on, a breaking change bumps MAJOR. Either way, a breaking change is
never shipped without an upgrade note.

## Surfaces

A change is judged by the public surface it touches. If it touches several,
the strictest rule wins.

| Surface | Where it is defined | Breaking (major; minor while 0.x) | Minor | Patch |
|---|---|---|---|---|
| **CLI** | `contracts/crashlab-core/src/bin/` (`crashlab`, `import-corpus`, `export-corpus`, `check-fixtures`, `lint-fixtures`, …) | removing/renaming a command or flag, changing a flag's meaning or default, changing exit codes, changing `CRASHLAB_OUTPUT_FORMAT=json` output shape | new command, new optional flag, new JSON field | bug fixes, help text |
| **HTTP API** (W5-D13) | `apps/web/src/app/api/**`, published spec `apps/web/src/lib/openapi/openapi.json` | removing a route or method, removing/renaming a response field, tightening validation of previously accepted input, changing auth requirements in a way that rejects existing callers | new route, new optional request field, new response field | fixes that keep the contract |
| **Bundle schema** (W5-B06) | `bundle_persist.rs` — `CASE_BUNDLE_SCHEMA_VERSION`, `SUPPORTED_BUNDLE_SCHEMAS` | bumping the schema version **and** dropping a version from `SUPPORTED_BUNDLE_SCHEMAS`; changing the meaning of a stored field | bumping the schema version while still reading N-1 | none |
| **Other persisted schemas** | `CORPUS_ARCHIVE_SCHEMA_VERSION`, `RUN_CHECKPOINT_SCHEMA_VERSION`, `RUN_METADATA_SCHEMA_VERSION`, `FIXTURE_MANIFEST_SCHEMA_VERSION`, `HEALTH_SNAPSHOT_SCHEMA_VERSION` | as bundle schema | as bundle schema | none |
| **Signature / taxonomy** (W5-G05) | `signature_hash.rs`, `taxonomy.rs` | any change that alters the signature hash or failure class of an existing input (it re-buckets every stored crash) | new failure class that existing inputs never map to | none |
| **Engine behaviour** (W5-B02) | `prng.rs`, `replay.rs`, mutators | any change that alters the seed sequence or replay outcome for an existing (seed, preset) pair — reproducibility is the product | new preset or mutator that is opt-in | performance work with identical outputs |
| **Configuration / env** | `docs/ENV.md` | removing or renaming a variable, changing a default in a way that changes behaviour | new optional variable | doc fixes |
| **Dashboard UI** | `apps/web/src/app/**` pages | — (UI is not a compatibility surface unless a documented workflow breaks) | new pages/features | fixes |

Docs, tests, CI and internal refactors with no surface change are PATCH (or
ride along in the next release without a bump of their own).

### Is it breaking?

Ask: *does an existing user, script, stored bundle, or CI pipeline need to
change to keep working?* Yes → breaking. "Nobody uses that flag" is not an
exemption; deprecate it first (below).

The fixture-compat gate in the release workflow
([`scripts/release/fixture-compat.sh`](../../scripts/release/fixture-compat.sh))
checks the previous release's fixture corpus still imports with the new
engine. If it does not, the release is breaking by definition.

## Deprecation window (N-1)

- Readers support the **current and previous** persisted schema version
  (`SUPPORTED_*_SCHEMAS` always contains N and N-1). Writers emit N.
- A CLI flag, API field or env var is first **deprecated** (still works, warns,
  documented in the upgrade note) in release N, and removed no earlier than
  release N+1 — the removal is the breaking change, and it is announced in N.
- Dropping N-1 read support is a breaking change and needs its own upgrade note
  with a migration command (e.g. re-export bundles with the current writer).

## Commit conventions → changelog

Conventional commit types (enforced on PR titles by `semantic-pr.yml`) drive
the generated changelog ([`scripts/release/changelog.mjs`](../../scripts/release/changelog.mjs)):
`feat` → Features, `fix` → Fixes, `perf` → Performance, others grouped below.
Mark breaking changes with `type!:` or a `BREAKING CHANGE:` footer — they are
listed first and force the bump above. Squash-merge titles are what land, so
the PR title is what must be right.

## Tags and signing

- Tags are `vX.Y.Z`, cut from `main`, **signed** (`git tag -s`) by a release
  maintainer whose key is registered on GitHub.
- The release workflow checks the tag's signature and image signing; both are
  **non-blocking warnings** until the maintainer key / OIDC setup in
  [`checklist.md`](checklist.md#one-time-maintainer-setup) is done, then they
  become blocking.

## Upgrade notes

Every release with a breaking change or deprecation ships
`docs/releases/upgrade-notes/vX.Y.Z.md` from the
[template](upgrade-notes/TEMPLATE.md); the release workflow puts the template
skeleton into the draft release body so it cannot be forgotten.
