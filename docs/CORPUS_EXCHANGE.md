# Portable Corpus Exchange

Corpora are campaign-local by default. To share interesting seeds between
machines, teams, or CI jobs without zipping directories by hand, CrashLab uses a
**versioned, content-addressed archive format** with explicit, verified merge
semantics.

Implementation: `contracts/crashlab-core/src/corpus_archive.rs`.

## Archive format

A `CorpusArchive` is a JSON document with two parts:

```jsonc
{
  "manifest": {
    "schema": 1,                       // archive format version
    "engine_version": "0.1.0",         // engine that produced the archive
    "seed_count": 2,
    "entries": [                       // one entry per packed seed, sorted by (id, payload)
      {
        "content_hash": "6ceb…92ca",   // sha256(id ‖ payload_len ‖ payload)
        "id": 1,
        "payload_len": 3,
        "tags": ["team-a"]             // per-seed provenance tags
      }
    ],
    "provenance_tags": ["campaign-7"], // archive-level tags
    "coverage_notes": "auth + budget", // optional, free-form
    "manifest_hash": "4f4c…c6a8"       // sha256 over the canonical manifest; the archive id
  },
  "seeds": [ { "id": 1, "payload": [1, 2, 3] } /* … */ ]
}
```

* The **archive id** is `manifest_hash`, a SHA-256 over an order-stable encoding
  of the manifest (schema, engine version, count, every entry, archive tags and
  coverage notes). Two archives built from the same inputs on any machine are
  byte-identical.
* Seeds are **content-addressed** by `content_hash`. The hash covers the seed id
  and payload, so identical seeds exported from different hosts hash the same,
  while a payload that differs in a single byte produces a different hash.

## Integrity

`CorpusArchive::from_json` verifies the archive before it is used:

1. The schema version is one this build supports.
2. `seed_count` agrees with the entry list and the packed seeds.
3. Every entry's `content_hash`, `id` and `payload_len` match the packed seed.
4. `manifest_hash` matches the recomputed value.

Any mismatch — a flipped payload byte, an edited manifest field, an unsupported
schema — is rejected as a tamper error (W5-B10).

## Engine-version policy (W5-B02)

An archive records the engine version that produced it. On import, the policy
decides how a version mismatch is handled:

| Policy | `--engine` value | Behaviour on mismatch |
|---|---|---|
| `RequireExact` | `require` | Reject the import with an error. |
| `AllowCompatible` (default) | `skip` | Skip the archive; count its seeds as *version-skipped*. |
| `Ignore` | `ignore` | Merge regardless of engine version. |

## Merge semantics

Importing merges with **dedup by content hash**:

* A seed whose content hash is already present is a **duplicate**.
* When the same content arrives with different provenance tags, the tags are
  **unioned** rather than treated as a conflict.
* Otherwise the seed is **added**.

The import report prints `added`, `dup`, `provenance union(s)` and
`version-skipped` counts. `--dry-run` computes the report without mutating the
local corpus.

## CLI workflow

Export a local corpus to a shareable archive:

```sh
crashlab corpus export corpus.json --out auth-corpus.archive.json \
    --tag team-a --tag nightly --coverage "auth + budget edge cases"
```

Import (merging) an archive into a local corpus, previewing first:

```sh
crashlab corpus import auth-corpus.archive.json --into local.json --dry-run
crashlab corpus import auth-corpus.archive.json --into local.json --engine skip
```

A local corpus file is a JSON document with `seeds` and a `provenance` map
(`content_hash → tags`). A raw `Vec<CaseSeed>` array is also accepted as input
to `corpus export`.

## Provenance

Provenance tags recorded on export are preserved through round-trips and grow
through merges, so an imported seed always carries the union of the teams and
campaigns that contributed it. Fixture-level provenance (the tamper-evident
hash chain) is described in [ADR-0011](adr/0011-fixture-provenance-hash-chain.md).
