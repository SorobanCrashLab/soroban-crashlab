# Parity Contract Evolution Policy

The versioned mock/host parity contract lives at
`contracts/crashlab-core/parity/expectations.toml` and is loaded by
`fixture_compat::load_parity_expectations`. The differential harness
(`contracts/crashlab-core/tests/differential_runner.rs`) reads this contract
instead of hard-coded asserts.

## Rules

1. Every fixture class must have an entry. The drift-detector test
   (`parity_contract_drift_detector_fails_on_silent_additions`) fails if a
   fixture exists without an expectation entry — no silent additions.
2. Loosening an expectation (widening allowed categories, dropping required
   fields) requires `// parity-contract: <reason>` in the PR description and
   re-review by a CODEOWNER.
3. Any semantic change bumps `version`. The loader gates on
   `PARITY_CONTRACT_VERSION`, so engine upgrades, mutator changes, and
   taxonomy bumps fail with a precise message naming the unsupported version
   until the loader and contract are updated together.
4. Never delete a class entry to unblock a PR; record the reason instead.
