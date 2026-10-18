# Playbook: campaign wedge

A campaign stops making progress but does not exit. Default severity
**SEV3** (SEV2 if it blocks the nightly or a release).

## Symptoms

- `progress:` lines stop in the campaign log; `seeds/sec` drops to 0.
- Run stays `running` in the dashboard far past its usual duration.
- Health snapshot stops advancing (`crashlab runs status <id>` shows an old timestamp).
- Nightly job hits its timeout instead of finishing.

## Verify

```bash
cd contracts/crashlab-core
cargo run --release --bin crashlab -- runs list            # find the run
cargo run --release --bin crashlab -- runs status <run-id>  # last health snapshot, status
ls -l "${CRASHLAB_STATE_DIR:-.crashlab}"/runs/<run-id>/    # checkpoint + heartbeat ages
```

Classify the wedge (these map to the sandbox classes in W5-A11, #1791):

| Looks like | Likely class |
|---|---|
| CPU pinned, no progress | one seed in an expensive/infinite path (host metering not bounding it) |
| Memory climbing | allocation blow-up in a seed |
| Idle, waiting | RPC endpoint or lock (stale run-dir lock, unresponsive RPC) |

## Mitigate

1. Cancel cooperatively: `crashlab run cancel <run-id>`; it seals partial
   results at the next budget slice (ADR 0008).
2. No response within a few minutes: stop the process; the last checkpoint
   is kept.
3. Find the seed: the checkpoint's `next_seed_index` is the first unfinished
   seed; replay it alone with `crashlab replay seed` on a bundle, or re-run
   from that index with a tiny budget.
4. Resume past it: `crashlab run start --resume --run-id <id> …`.
5. RPC waits: switch to host mode or another endpoint; check
   [reproducibility caveats](../../reproducibility-contract.md) before comparing results.

## Verify recovery

The resumed run makes progress and reaches a terminal state; the next
nightly finishes inside its timeout.

## Post-incident

Attach the wedging seed as a fixture so the regression suite covers it;
note it on #1791 if it is a sandbox gap.
