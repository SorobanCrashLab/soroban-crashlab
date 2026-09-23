# crashlab-core fuzz targets

These `cargo-fuzz` targets exercise parser and classifier boundaries with
libFuzzer input. Each target ignores inputs larger than 8 KiB so a malformed
case cannot create unbounded parser allocations. Targets are hermetic: they
use only in-memory values and perform no network or filesystem I/O.

## Prerequisites

Install the stable Rust toolchain and `cargo-fuzz`:

```bash
cargo install cargo-fuzz --locked
```

## Run locally

From `contracts/crashlab-core`:

```bash
cargo fuzz run --fuzz-dir fuzz classify_payload
cargo fuzz run --fuzz-dir fuzz load_bundle_document
cargo fuzz run --fuzz-dir fuzz import_corpus
cargo fuzz run --fuzz-dir fuzz parse_regression_group
```

Bound a local run as CI does with `--`:

```bash
cargo fuzz run --fuzz-dir fuzz load_bundle_document -- -max_total_time=60 -rss_limit_mb=512
```

Use `-runs=1` for a quick smoke check. libFuzzer writes generated corpus
inputs to `fuzz/corpus/<target>/` and crash artifacts to
`fuzz/artifacts/<target>/`.

## Promote a crash to a regression fixture

1. Copy the minimized input from `fuzz/artifacts/<target>/` into the matching
   `fuzz/fixtures/<target>/` directory.
2. Give the file a stable descriptive name and keep the original bytes intact.
3. Add a focused regression test in `src/` or `tests/` that loads the fixture
   and asserts the expected error or classification.
4. Run `cargo test --all-targets` and the affected fuzz target before opening
   the change.

Fixtures belong in the repository only after they have a deterministic
regression test; the fuzz target itself should continue to accept arbitrary
bytes without assuming valid input.