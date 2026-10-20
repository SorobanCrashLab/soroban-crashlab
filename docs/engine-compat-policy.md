# Mutation Engine Compatibility Policy

Freezes the mutation stream behind an engine version (#1794).

## Engine version

- `ENGINE_VERSION` in `contracts/crashlab-core/src/engine_version.rs` tracks
  the crate version (`0.1.0`).
- Every `CaseBundle` and `CaseBundleDocument` carries `engine_version`.
- Every `RunMetadata::new` defaults to the current engine version.
- Legacy bundles without a version load as `engine_version="unknown"`.

## Drift classes

| Bundle vs current | Class | Replay |
|---|---|---|
| Equal | `None` | Allowed |
| Patch differs | `Patch` | Allowed |
| Minor differs | `Minor` | Allowed with warning (N-1 window) |
| Major differs or unknown | `Major` | Refused unless `--accept-engine-mismatch` |

Replay prints both versions and the drift class on refusal.

## What bumps the version

- Major: PRNG layout (`prng.rs`), mutator ordering, taxonomy re-bucketing,
  seed-stream changes. Requires re-baseline and upgrade note.
- Minor: opt-in mutators with identical default streams, additive fields.
- Patch: docs, perf, non-stream fixes.

## Golden stream test

`prng.rs::golden_v1_stream_for_fixed_seed_is_byte_frozen` pins the v1 stream
for seed 42. Change the stream without bumping the version and CI fails.

## Compatibility window

Readers keep N-1 bundle schemas (`SUPPORTED_BUNDLE_SCHEMAS`). A bundle from
engine N replays on N and N+1 with the same class and signature hash.
Older bundles may load but carry no guarantee: re-export with current engine.
