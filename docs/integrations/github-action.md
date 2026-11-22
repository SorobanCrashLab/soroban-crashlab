# GitHub Action: CrashLab regression gate

`SorobanCrashLab/soroban-crashlab/action` is a composite action that installs a
pinned CrashLab CLI, replays your committed regression fixtures, and classifies
new failure signatures against a baseline. New signatures fail the check with
`::error` annotations; known failures and newly fixed fixtures are reported as
warnings/notices so the gate stays honest.

It is dependency-free at runtime: the classification step uses Node built-ins,
so it runs in any repository without cloning the monorepo.

## Quickstart

```yaml
name: regression
on: pull_request

permissions:
  contents: read

jobs:
  crashlab:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: CrashLab regression gate
        uses: SorobanCrashLab/soroban-crashlab/action@v1
        with:
          fixtures: fixtures/regression_suite.json
          baseline: crashlab-baseline.json
          fail-on: new-signatures
          version: v0.1.0
          expected-sha256: <sha256 of crashlab-v0.1.0-<target>.tar.gz>
```

## Inputs

| Input | Default | Description |
|---|---|---|
| `fixtures` | `crashlab-core/fixtures/regression_suite.json` | Suite JSON, or a directory of fixture JSON. |
| `baseline` | `crashlab-core/regression-baseline.json` | Known failures to tolerate. |
| `fail-on` | `new-signatures` | `new-signatures`, `any`, or `never`. |
| `version` | `v0.1.0` | CLI release tag to install. |
| `expected-sha256` | *(empty)* | SHA-256 of the release archive. Required unless building from source. |
| `build-from-source` | `false` | Build the CLI from the checked-out workspace instead of downloading. |
| `source-dir` | `contracts` | Cargo workspace used when building from source. |
| `expected-schema` | `1` | Report schema the action supports; guards against version skew. |
| `report` | `$RUNNER_TEMP/...` | Where to write the report JSON. |
| `working-directory` | `.` | Directory the fixture and baseline paths resolve against. |

## Outputs

`total`, `passed`, `failed`, `new-signatures`, `blocking`, and `report`.

## Baseline format

```json
{
  "schema": 1,
  "knownFailures": [
    { "fixture": "seed-7-invoker", "signature": "empty-input", "reason": "#1234" }
  ]
}
```

`fixture` is `seed-<seed_id>-<mode>`; `signature` is the failure class the
fixture is expected to keep failing with. A failing fixture that matches a
baseline entry is *recurring* (non-blocking); one that does not is *new*
(blocking). A baseline entry that now passes is *fixed* — remove it.

## Versioning and compatibility

Action tags track the CLI's report schema. The classify step asserts
`report.schema` matches `expected-schema` and fails early with a clear message
if a newer CLI emits a shape the action does not understand, so a mistyped
`version` cannot silently pass the gate.

## Security

The download path refuses to run without a pinned `expected-sha256`, and the
archive is verified before extraction. Prefer the checksum-pinned download in
downstream repositories; `build-from-source: true` is intended for this
repository's own dogfood self-test, where the source is already trusted.

## Limitations

- The default runner needs outbound network access to download the CLI (or a
  Rust toolchain when building from source).
- Only Linux and macOS runners are supported for the download path.
- Posting a sticky PR comment or check run is not wired into the composite
  action; the action surfaces findings through annotations, step outputs and
  the job summary. Consume `blocking` in your own follow-up step if you need a
  comment.
