# Contract Storage Layout Explorer

The storage explorer (issue #2327) turns opaque key/value storage into navigable, typed views
so investigators can understand state-dependent bugs.

## Views

- **Keyspace tree** — hierarchical view by namespace and key segments, with subtree key counts,
  reads, writes and byte totals. Intermediate nodes report the number of leaf entries in their
  subtree.
- **Heatmap** — keys ranked by reads, writes, size or churn, with `cold`/`warm`/`hot`/`critical`
  levels derived from the maximum. Ties break by key so output is deterministic.
- **Access patterns** — hot keys, reads after writes, writes to unknown keys and expired TTLs,
  each with a severity.
- **Snapshot diff** — added, removed, modified and unchanged keys between two snapshots,
  sorted by key.
- **Text summary** — a non-visual `role="status"` summary for screen readers and exports.

## Schema-aware decoding

`decodeValue` returns `{ type, value, confidence }`. A schema hint yields confidence `0.95`;
booleans `1`; integers `0.9`; hex/address `0.8`/`0.85`; structured JSON `0.6`; anything else is
`unknown` with confidence `0.2`. Low-confidence entries are shown explicitly rather than guessed.

## Redaction and permissions

Entries marked `sensitive` are masked (`***`) with confidence `0` until a user with permission
reveals them. Redaction is deterministic and idempotent.

## Routes and API

- Page: `/contracts/[id]/storage`
- API: `/api/contracts/storage` — `GET` lists snapshots or analyses one; `POST` ingests a snapshot
  and returns a deterministic diff.

The model in `apps/web/src/features/storage-explorer/model.ts` is pure and has unit tests covering
decoding, tree aggregation, heatmap ranking, anomaly detection, diffing and redaction.
