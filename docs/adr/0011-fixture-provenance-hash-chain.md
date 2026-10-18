# ADR 0011: Fixture provenance — sign vs. hash chain

**Status:** Accepted
**Date:** 2026-01-01

## Context

Regression fixtures are trust anchors: a green suite only means something if the
fixtures it runs are the ones we think they are. Today a fixture is a payload
plus loose metadata; nothing ties it to the campaign that produced it, the
engine version that classified it, the environment it was captured on, or the
signature it is expected to reproduce. Anyone with repository write access can
plant a "known failing" fixture or silently rewrite history, and neither an
auditor nor CI can tell.

Issue #1864 asks for a provenance block (`run → seed → engine → environment →
expected signature → content hash`) and leaves one decision open: protect it with
a **signature** (repo/release key) or a **hash chain** (chained log). This ADR
records that decision (PR guideline: "sign-vs-hash-chain decision recorded as ADR
first").

## Decision

Protect provenance with a **SHA-256 hash chain**, not asymmetric signatures.

Each [`ProvenanceRecord`](../../contracts/crashlab-core/src/provenance.rs) is
canonically encoded (fixed field order, separator-delimited) and hashed into a
`content_hash`. Records are chained by `previous_hash`, so removing or mutating
any record invalidates every record after it. The wire format reserves a
`signature: Option<String>` field.

Verification is **fail-closed on tamper**: a record whose `content_hash` does not
match its contents never verifies, regardless of policy. A single
[`ProvenancePolicy`](../../contracts/crashlab-core/src/provenance.rs) knob only
controls how a *missing* block is treated (`Require` / `WarnOnMissing` /
`Disabled`), which lets legacy fixtures keep loading while provenance becomes
mandatory over time.

## Rationale

- **No key infrastructure yet.** Signing needs a release/repo key with rotation,
  revocation and secret distribution (compare the deferred key work in #1863
  W5-C01/W5-C14). A hash chain needs no secrets and works offline.
- **Tamper-evidence is the requirement.** The threat is *undetected* planting or
  rewriting of fixtures inside a repository — not forging a signature from a
  compromised key. A chain detects inserts, deletions and edits in exactly that
  setting.
- **Cheap and deterministic.** SHA-256 over a canonical encoding is stable across
  machines and languages, and reuses dependencies (`sha2`, `hex`) already in the
  workspace.
- **Upgrade path.** Because the format reserves `signature`, a later ADR can add
  signing (e.g. sigstore/cosign, matching W5-C14) without a breaking change.

## Consequences

- **Positive:** Fixtures carry verifiable lineage; tampering (or a deleted link)
  fails `fixture verify` and quarantines the fixture instead of running it.
  Legacy fixtures without provenance still load under `WarnOnMissing`.
- **Negative:** A hash chain proves integrity *relative to an anchor*, not
  authorship. Anyone who can rewrite the whole chain and its anchor can forge
  history; and unlike a signature it gives no non-repudiation.
- **Mitigations:** The chain anchor (the root `content_hash`, or a published
  baseline manifest digest) is committed/attested separately; the reserved
  `signature` field plus a future ADR (aligned with W5-C14) upgrades to
  asymmetric provenance when key infrastructure exists.

## Compliance & Verification

- `contracts/crashlab-core/src/provenance.rs` — canonical encoding, sealing,
  `verify`, `verify_chain`, `verify_optional`.
- `FixtureManifest::verify_all_provenance` and
  `classify_and_wrap_verified` implement verify-on-ingest/quarantine; a tampered
  test proves rejection.
- `crashlab fixture verify <path> [--policy require|warn|off]` exposes the same
  check to CI and operators.
- Unit tests: tamper fails verify, missing provenance warn→error per policy, and
  round-trip through export/import preserves the block.
