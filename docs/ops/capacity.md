# Capacity and cost model for campaigns

Campaigns compete for the same workers, RPC budget and storage. This page
covers how CrashLab bounds that use: quotas, scheduling windows and
priorities, utilization reporting and cost attribution. It also covers how to
size a deployment and choose its limits.

> **Scope.** Every limit applies to one scope. Until tenancy (per-org and
> per-project scopes) lands, there is a single `global` scope. The code takes a
> scope id everywhere, so per-org quotas plug in without changing the model.

With nothing configured, every quota is unlimited and every window is open, so
behaviour is exactly as it was before quotas existed.

## Campaign classes and priority

| Class | From preset | Priority | Default seeds | Resource units / seed | Windowable |
|---|---|---|---|---|---|
| `interactive` | `smoke` | 1 (highest) | 1,000 | 1 | no |
| `nightly` | `nightly` | 2 | 100,000 | 2 | yes |
| `deep` | `deep` | 3 (lowest) | 10,000,000 | 4 | yes |

A campaign's class is its `campaignClass` field, or else follows from its
`preset`, or else defaults to `interactive`. Schedules default to `nightly`.

**Headroom.** Lower-priority classes may not use the top of any limit:
`nightly` leaves 10% free and `deep` leaves 25% free. A deep campaign can
therefore never starve interactive or nightly work. With a 1,000,000
seeds/day quota, deep campaigns stop at 750,000, nightly at 900,000, and
interactive campaigns can use all of it.

## Quotas

| Variable | Limits | Error when exceeded |
|---|---|---|
| `CRASHLAB_QUOTA_CONCURRENT_WORKERS` | Workers held by running campaigns | `429 QUOTA_EXCEEDED`, `Retry-After: 60` |
| `CRASHLAB_QUOTA_SEEDS_PER_DAY` | Seeds per UTC day | `429 QUOTA_EXCEEDED`, `Retry-After` until 00:00 UTC |
| `CRASHLAB_QUOTA_RPC_CALLS_PER_DAY` | RPC calls per UTC day | `429 QUOTA_EXCEEDED`, `Retry-After` until 00:00 UTC |
| `CRASHLAB_QUOTA_STORAGE_GB` | Artifact storage | `429 QUOTA_EXCEEDED`; nothing new is admitted until retention frees space |

A `429` body names the limit that was hit:

```json
{ "error": "Quota exceeded for concurrent_workers: 6 used + 4 requested > 8 allowed.",
  "code": "QUOTA_EXCEEDED",
  "quota": { "resource": "concurrent_workers", "limit": 8, "used": 6, "requested": 4 } }
```

Quotas are enforced in two places:

- **At creation:** `POST /api/campaigns` derives the request (`workers`, or the
  form's `parallelism`; `seeds`, or the class default; `rpcCalls`) and rejects
  it before the campaign exists.
- **Mid-run:** runners report cumulative progress to
  `POST /api/capacity/usage` (token scope `runs:write`). The response
  `{ "throttle": { "throttle": true, "code": "QUOTA_EXCEEDED", "retryAfterSeconds": … } }`
  tells a campaign to pause once the scope has used its class's share for
  the day. In-process, the engine applies the same rule through
  `crashlab run start --seed-quota <remaining>` (`QuotaGuard` in
  `contracts/crashlab-core/src/capacity.rs`, whose clones share one pool
  across the workers of a process).

Each admitted campaign holds a **lease** on its workers and planned seeds. The
lease ends when the runner reports `finished`. A runner that stops reporting
loses its lease after 1 h (interactive), 8 h (nightly) or 24 h (deep), so a
crashed worker cannot hold capacity forever. Finishing early refunds the
unused seed reservation.

### Admin override

A maintainer can admit a campaign past a quota or a closed window by sending
`X-CrashLab-Quota-Override: <reason>` (1–200 characters). The override is
written to the audit log as `quota.override`, with the actor, the reason and
what was bypassed. Non-maintainers get `403 QUOTA_OVERRIDE_FORBIDDEN`.

## Scheduling windows

`CRASHLAB_SCHEDULING_WINDOWS` confines classes to UTC windows, for example:

```
CRASHLAB_SCHEDULING_WINDOWS=deep=00:00-06:00,nightly=20:00-08:00
```

- Windows are `[start, end)` and may wrap past midnight. A class without a
  window is always open, and `interactive` cannot be windowed.
- Creating a campaign outside its window returns
  `403 SCHEDULING_WINDOW_CLOSED` with `Retry-After` set to when it opens.
- The schedules tick **defers** a due schedule whose window is closed. It
  fires once, as a collapsed catch-up, when the window opens. The tick reports
  deferred schedules in `deferred`, and orders the runs it creates by priority.
- A running campaign whose window closes is told to pause on its next usage
  report (`SCHEDULING_WINDOW_CLOSED`).

## Utilization and cost

`GET /api/capacity?windowHours=24` reports, for the scope:

- limits, and each class's share of them after headroom;
- current usage: active workers, seeds and RPC calls today, and storage;
- **utilization**: `busy-worker-hours / capacity-worker-hours` over the
  window, where capacity is `CRASHLAB_QUOTA_CONCURRENT_WORKERS × hours`
  (`null` without a worker limit);
- **cost attribution**: `seeds × resource units` for each project and class.
  Campaigns set `project` (default `default`). Resource units are a relative
  weight derived from preset intensity, until measured per-seed resource units
  replace them.

The ledger is held in memory on each server instance, like the other mock-mode
stores. A durable, cross-instance ledger is required before multi-instance
deployments rely on quotas.

## Sizing a deployment

Throughput is set by the runner, not the engine. On a 4-core laptop
(i5-7300U), one worker using the mock runner processes about 385,000 seeds/s
(smoke) to 520,000 seeds/s (deep). That is the engine's overhead ceiling.
Host and RPC runners are slower by orders of magnitude, so measure your own
runner:

```bash
cd contracts
CRASHLAB_RUNNER=<your runner> cargo run --release --bin crashlab -- \
  run start --preset nightly --seeds 20000 --progress-interval 1000
# read seeds/sec from the "progress:" lines
```

Then size with:

```
workers needed     = target seeds per minute ÷ (60 × measured seeds/s per worker)
seeds/day quota    ≈ workers × measured seeds/s × 86,400 × planned busy fraction
RPC calls/day      ≈ seeds/day × RPC calls per seed (RPC runner), capped by your provider's limit
```

Keep the worker quota at or below the cores you can dedicate, minus one for
the web app and scheduler. Set the RPC quota below the RPC provider's daily
limit so that CrashLab fails a campaign cleanly before the provider starts
rejecting calls.

## Setting quotas

1. Start with `CRASHLAB_QUOTA_CONCURRENT_WORKERS` equal to your dedicated
   cores. It is the quota that prevents noisy-neighbour failures.
2. Watch `GET /api/capacity` for a week. Set the seeds/day quota about 20%
   above the busiest observed day, so normal growth fits but a runaway deep
   campaign does not.
3. Add windows only once deep campaigns visibly slow interactive work. Start
   with `deep` in your quietest 6 hours.

## Alert thresholds

Poll `GET /api/capacity` from your monitoring and alert on:

| Signal | Warn | Page |
|---|---|---|
| `usage.seedsToday / limits.seedsPerDay` | ≥ 80% | ≥ 95% |
| `usage.activeWorkers / limits.concurrentWorkers` | ≥ 80% for 30 min | at 100% for 2 h (interactive is being refused) |
| `utilization.utilization` (24 h) | ≥ 0.85 (add capacity) | — |
| `usage.storageBytes / limits.storageBytes` | ≥ 80% | ≥ 95% (new campaigns will be refused) |
| `quota.override` audit entries | any (review) | — |

A sustained 24 h utilization below 0.3 means the worker quota, and the
deployment, can shrink.
