# State & Ledger Timeline Inspector

Issue: [#2292](https://github.com/SorobanCrashLab/soroban-crashlab/issues/2292)

## Overview

The run-scoped inspector turns state artifacts and ledger footprints into an ordered set of checkpoints and causal mutations. It provides a timeline, deterministic nested key diffs, browser-local key watchlists, mutation filters, trace/log references, and baseline-versus-candidate run comparison.

## Data contract

The API endpoint is `GET /api/runs/:id/state`. JSON trace, bundle, and log artifacts may expose either `snapshots` / `stateSnapshots` and `mutations` / `stateChanges` / `events` at the document root or under `data`. Snapshot entries may be supplied as `entries`, `state`, `storage`, or `values`. Mutation keys accept `key`, `id`, `ledgerKey`, or `storageKey`; before/after values accept common old/new aliases.

When artifacts do not contain snapshots, the API derives an explicitly partial timeline from the run's ledger footprint. It does not represent missing data as an unchanged state. Artifact references that cannot be decoded as JSON are skipped rather than interpreted as state.

## Safety and determinism

- Sensitive-looking fields (credentials, private keys, tokens, seeds, payloads and signatures) are redacted server-side before the response is serialized.
- Snapshot keys, nested diff paths and mutation ordering use canonical lexical ordering.
- Nested diff traversal is depth-limited and output is capped to avoid unbounded response rendering.
- Watchlists are browser-local and scoped by run id; no server-side secret or user data is persisted.
- The API is registered as a session-authenticated read route requiring the `runs:read` scope.

## Limitations and extension points

The current inspector reads JSON state documents stored as run artifacts and the existing ledger footprint fixtures. Binary XDR decoding, role-based reveal of redacted values, background-worker diffing, and true windowed virtualization remain follow-up work. The diff table bounds the initial render and incrementally reveals additional rows. Trace and log links are only emitted when artifact mutations carry corresponding node or log identifiers.
