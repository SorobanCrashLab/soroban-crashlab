# Campaign health snapshot schema (`health.jsonl`)

`crashlab runs status <id>` and the web dashboard's live run stream both read the
same file. This document is the contract between the campaign that writes it and
every reader.

## Location and lifetime

```
<state-dir>/runs/<run-id>/health.jsonl
```

* `<state-dir>` is `CRASHLAB_STATE_DIR`, defaulting to the same directory the
  cancel marker uses (see `default_state_dir`).
* The file is **append-only**. One line is one snapshot; a reader never needs to
  rewrite history to understand the present.
* A run with no snapshots has no file, which is not an error: it means the run
  has not started yet, or it ran before snapshots existed.
* Snapshots are written best-effort. A campaign must not fail because a status
  file could not be appended, so write failures are counted
  (`CampaignHealth::snapshot_write_failures`) rather than propagated.

## Line format

Each line is a complete, self-contained JSON object followed by `\n`. There is no
trailing comma and no wrapping array, so `tail -f health.jsonl` is a valid live
stream and a partial last line is the worst a kill can leave behind.

```json
{
  "schema_version": 1,
  "run_id": 41,
  "campaign_id": "campaign-41",
  "sequence": 3,
  "emitted_at": "2026-01-01T00:00:00+00:00",
  "terminal": "completed",
  "status": "healthy",
  "throughput": { "cases_per_second": 812.5, "total_cases": 400, "elapsed_secs": 0.49 },
  "failures": { "total_failures": 2, "unique_signatures": 2, "failure_rate": 0.005 },
  "failure_classes": { "auth": 1, "timeout": 1 },
  "queue": { "pending": 0, "in_progress": 1, "capacity": 400, "utilization": 0.0025 },
  "budget": { "total_seeds": 400, "processed_seeds": 400, "remaining_seeds": 0 }
}
```

### Field reference

| Field | Type | Notes |
| --- | --- | --- |
| `schema_version` | `u32` | Format version of this line. Currently `1`. |
| `run_id` | `u64` | Matches the run directory name. |
| `campaign_id` | `string?` | Present when the caller knows the campaign. |
| `sequence` | `u64` | 1-based order within this run's log. Monotonic, gaps mean lost lines. |
| `emitted_at` | `string` | RFC 3339 UTC timestamp of the snapshot. |
| `terminal` | `string?` | `completed` \| `cancelled` \| `failed`. Only on the final snapshot. |
| `status` | `string` | `healthy` \| `degraded` \| `unhealthy`, from the monitor's thresholds. |
| `throughput.cases_per_second` | `f64` | Seeds processed per second since the campaign started. |
| `throughput.total_cases` | `u64` | Seeds processed since the campaign started. |
| `throughput.elapsed_secs` | `f64` | Wall-clock seconds the campaign has been running. |
| `failures.total_failures` | `u64` | Failures observed so far. |
| `failures.unique_signatures` | `u64` | Distinct failure classes observed so far. |
| `failures.failure_rate` | `f64` | `total_failures / total_cases`, `0.0` when no seed finished yet. |
| `failure_classes` | `{string: u64}` | Failures per stable class label; omitted-as-empty for old lines. |
| `queue.pending` / `queue.in_progress` | `u64` | Queue depth, when the caller tracks in-flight work. |
| `queue.capacity` | `u64` | Requested seed count, used as the queue bound. |
| `queue.utilization` | `f64` | `(pending + in_progress) / capacity`, `0.0` when capacity is `0`. |
| `budget.total_seeds` | `u64` | Seeds the campaign was asked for. |
| `budget.processed_seeds` | `u64` | Seeds this worker finished. |
| `budget.remaining_seeds` | `u64` | `total_seeds - processed_seeds`, saturating at `0`. Authoritative "budget remaining". |

`failure_classes` labels come from `classify_failure_message`: the whole message
when it carries no `label: detail` prefix (for example `"auth"`), otherwise the
prefix (`"auth: missing entry"` → `"auth"`), falling back to `unknown` for empty
messages.

## Reader rules

Versioned on purpose: a reader that meets a schema it does not understand must
not guess.

1. **Skip unknown versions.** `read_latest_health_snapshot` accepts only
   `SUPPORTED_HEALTH_SNAPSHOT_SCHEMAS` (`[1]`) and skips lines outside it, so an
   older binary reads a newer line as "no snapshot" instead of misreporting it.
2. **Tolerate a half-written tail.** The newest line may be truncated by a kill.
   `read_latest_health_snapshot` walks lines backwards and returns the newest one
   that parses, so `crashlab runs status <id>` still reports the last good
   snapshot.
3. **Be strict about history.** `read_health_snapshots` fails on the first
   unreadable line: a caller asking for the whole timeline should hear about
   corruption rather than receive a silently short list.
4. **Missing file is not an error.** It reads as `None` / an empty list.

## Adding a field

Additive optional fields keep `schema_version` at `1` when they are
`#[serde(default)]` and readers can ignore them, which is how `failure_classes`
was introduced. Bump `schema_version`, register the version in
`SUPPORTED_HEALTH_SNAPSHOT_SCHEMAS`, and update this document when a change
alters the meaning of an existing field or removes one.
