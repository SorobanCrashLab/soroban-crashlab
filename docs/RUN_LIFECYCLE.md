# Run Lifecycle: start → checkpoint → resume → cancel

`crashlab run start` is the entry point for fuzz campaigns. It launches the
campaign engine in `run_control.rs`, executes seeds through a
`ContractRunner`, reports progress from `health.rs`, and honours cancel markers
written by `crashlab run cancel`.

Design rationale lives in [ADR-0008](adr/0008-run-lifecycle-and-checkpoint-recovery.md).
This document is the operator-facing reference for the CLI.

## Quick start

```bash
# Fast feedback campaign against the mock runner.
crashlab run start --preset smoke

# Real campaign against a Soroban host, checkpointing every 500 seeds.
CRASHLAB_RUNNER=host crashlab run start \
  --preset nightly \
  --seeds 100000 \
  --checkpoint-interval 500 \
  --output ./campaign-state \
  --run-id 42
```

## Options

| Flag | Default | Meaning |
|---|---|---|
| `--preset <smoke\|nightly\|deep>` | `$CRASHLAB_PRESET`, else `nightly` | Campaign profile. Fixes mutation intensity, base seed, and the default budget. |
| `--budget <n>` | preset budget | Mutation attempt cap. Attempts beyond the cap are counted as skipped, not failed. |
| `--seeds <n>` | `--budget` | Seeds to schedule. |
| `--workers <n>` | `1` | Total workers in the campaign. |
| `--worker <i>` | `0` | This worker's index. Must satisfy `0 <= worker < workers`. |
| `--output <dir>` | `$CRASHLAB_STATE_DIR`, else `.crashlab` | State root. Checkpoints and cancel markers live here. |
| `--checkpoint-interval <n>` | `1000` | Seeds between checkpoint writes. |
| `--progress-interval <n>` | `100` | Seeds between progress lines. |
| `--run-id <n>` | `1` | Run identifier, used by `crashlab run cancel <id>`. |
| `--resume` | off | Continue from the existing checkpoint instead of starting over. |
| `--help` | — | Print usage and exit 0. |

Both `--flag value` and `--flag=value` are accepted. Unknown options, non-numeric
values, a zero `--workers`, a `--worker` outside range, and zero intervals are
all rejected with a usage error and a non-zero exit.

### Presets

`smoke`, `nightly`, and `deep` come from `campaign_presets.rs` and are fixed so
CI and operators get predictable behaviour. Each preset pins a deterministic
`base_seed`, so replaying a campaign with the same preset reproduces the same
mutation stream. Payload width scales with the preset's mutation intensity.

## Start

```bash
crashlab run start --preset smoke --seeds 8 --budget 8
```

The run id is printed at startup along with the resolved state directory and
checkpoint path, so you always know what to pass to `run cancel`.

Seeds are derived deterministically from the preset's `base_seed` mixed with the
global seed index. Every worker in a partitioned campaign therefore agrees on
the schedule, and a worker can be restarted without changing the seed stream.

## Progress

Progress is reported from `health.rs`'s `HealthMonitor`:

```
progress: seeds/sec=149.59 cases=8 failures=8 unique=8 budget_remaining=0 elapsed=0.1s
```

- `seeds/sec` — throughput from the monitor
- `failures` — seeds that produced a crash signature
- `unique` — distinct `signature_hash` values seen
- `budget_remaining` — mutation attempts left in the campaign budget

On exit the run prints a budget line, an optional runner-error count, a health
summary, and the terminal state:

```
run 7 completed: seeds_processed=8 elapsed=0.1s
```

Runner errors are counted and reported but do **not** abort the campaign — one
bad seed should not abandon hours of work. Genuine internal faults (for example
a checkpoint that cannot be written) do stop the run.

## Checkpoint

Checkpoints are written to `<output>/runs/<run-id>/checkpoint.json`:

```json
{
  "schema": 1,
  "campaign_id": "nightly-w0",
  "next_seed_index": 500,
  "total_seeds": 100000
}
```

Writes go to a temporary file and are then renamed, so a reader never observes a
partial checkpoint (ADR-0008). A final checkpoint is always flushed on exit,
whether the campaign completed, was cancelled, or failed.

`campaign_id` is `<preset>-w<worker-index>`. It is what makes a resume safe: a
checkpoint written by a different campaign is rejected rather than silently
applied to the wrong schedule.

## Resume

```bash
crashlab run start --preset smoke --seeds 8 --budget 8 --resume
```

Resume re-reads the checkpoint and continues from `next_seed_index`, so
completed seeds are not re-executed. The checkpoint is validated first, and the
run is refused if:

- `campaign_id` does not match (different preset or worker)
- `total_seeds` does not match the requested schedule
- `next_seed_index` is past the end of the schedule

Resuming a campaign that already finished is a no-op and reports
`seeds_processed=0`. Resuming without an existing checkpoint is an error.

Partitioned campaigns use `drive_run_partitioned_from_checkpoint`, which advances
past seed indices owned by other workers so a restarted worker does not rescan
the earlier part of the global timeline.

## Cancel

Cancellation is cooperative. `run_control.rs` checks a `CancelSignal` between
seeds, so the engine finishes the seed in flight, flushes a final checkpoint,
and exits.

```bash
# In another shell, while the campaign runs:
crashlab run cancel 42
```

This writes a marker at `<output>/runs/42/cancel`. The running campaign observes
it and stops at the next seed boundary:

```
run 42 cancelled at seed Some(500): seeds_processed=500
```

A cancelled campaign exits `0` — cancellation is a normal outcome, not a CLI
failure. The final checkpoint records how far the run got, so it can be
resumed later with `--resume`.

## Choosing a runner

`CRASHLAB_RUNNER` selects the `ContractRunner` used for seed execution:

- `mock` (or unset) — deterministic in-process runner, no network
- `host` — Soroban SDK testutils host; requires the `host-runner` feature

The campaign engine, checkpointing, and progress reporting are identical for
both, which is why the integration tests can assert checkpoint and resume
behaviour against the mock runner without a live host.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Campaign completed or was cancelled |
| `1` | Usage error, runner creation failure, invalid resume, or an internal run failure |
