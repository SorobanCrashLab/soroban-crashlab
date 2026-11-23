# ADR-0013: Browser-worker XDR inspection

**Status:** Proposed
**Date:** 2026-11-22

## Context

Issue #2293 introduces decoding, mutation, structural comparison and export of adversarial Soroban payloads. XDR integers, optional values and union discriminators must survive an edit without lossy JavaScript conversions. A 5 MiB payload must not run a synchronous decoder on the UI thread. Run/trace and artifact screens currently expose context rather than a universal authorized XDR-content endpoint.

## Decision

Use the pinned official Stellar codec in a dedicated, same-origin module worker. A versioned typed JSON document preserves wire unions, enum names, integer parts, option presence, arrays and opaque bytes. The adapter reads the SDK's public schema API; browser-minified class names are never treated as type identifiers. SDK layout and round trips are checked, failing closed on unknown metadata.

The worker owns complete payloads and indexes. React receives at most 50 tree rows, a 1 KiB raw window and a 64 KiB subtree editor per query. Decode, edit, schema validation, diff, JSON parsing and export happen in that worker. Requests are serialized; edits are transactional. A timeout or cancellation terminates the worker rather than continuing an expensive operation on the main thread.

Use supplied ScSpecEntry records for function-argument and struct annotations/constraints, or explicit path metadata. Unsupported contract-spec semantics keep the generic wire representation. No contract source or payload content is evaluated. Navigation passes context identifiers and JSON-pointer paths, never payload bytes. Artifact exports continue through their existing permission flow; the inspector does not create a second content-fetch path.

Exports default to leaf-redacted JSON/evidence. Redacted documents are explicitly ineligible for exact re-import. Exact wire encodings and executable SDK fixture snippets require the user to disable redaction. No local/session storage, server upload or remote decoding service is involved.

## Consequences

- Typed edits can be independently reconstructed with the official SDK.
- Large payloads have bounded UI messages and DOM size; full codec work stays off-thread.
- Limits (5 MiB wire input, 100,000 nodes, 64 node levels) trade exhaustive expansion of hostile inputs for a raw read-only fallback.
- The metadata adapter is coupled to the pinned SDK and must be re-tested on codec upgrades. Public schema normalization is confined to the adapter.
- Browsers without workers fail explicitly. There is no synchronous fallback.
- Authorized run/artifact producers can supply initial payloads to the reusable inspector; existing demo routes require a local import. Automatic RPC/ABI discovery is outside this boundary.

## Compliance & Verification

Codec-vector and worker-engine tests cover wide integers, Unicode/invalid UTF-8, nested ledger keys, malicious lengths/depth, exact fields, atomic failures, real ScSpecEntry constraints, deterministic diffs, redaction and a 5 MiB wire payload. Browser tests exercise the bundled worker, navigation, keyboard controls and exports. Verification results belong in the PR; this ADR does not assert unobserved timings or passing checks.
