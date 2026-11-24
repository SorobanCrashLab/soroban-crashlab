# Artifact Storage & Provenance Manager

Tracks issue #2342. `/integrations/artifacts` now leads with a unified manager for artifacts on every backend. The existing upload widget stays below it. Operators can discover artifacts, verify their integrity and provenance, trace lineage, and govern retention, holds and deletion.

## What operators can do

| Area | Capability |
| --- | --- |
| Explorer | Server-side search and filters (backend, type, campaign, run, tag, sensitivity, integrity, date range, size, text), facets, cursor pagination, backend health cards |
| Metadata | Location, content type, size, creator, SHA-256, tags, linked run/campaign/crash/report, holds and pending deletions |
| Integrity & security (#023) | Checksum (re-verify on demand), signature, malware scan, quarantine and provenance checks folded into a trust level: `trusted` / `warning` / `blocked` |
| Preview & download | Redacted, 64 KB-capped text preview. Active content (HTML, SVG, JS) is always shown as escaped text. Downloads are issued only when allowed, through `/api/artifacts/[id]` for local files or a 5-minute SigV4 presigned URL for S3/MinIO |
| Provenance & lineage | Builder, SLSA level, source commit, attestation and SBOM links. A layered lineage graph (ancestors, descendants, owning entities) with a list alternative |
| Retention | Policy per artifact class (max age, delete/archive, keep-newest-N per campaign, enable). A dry-run simulation with holds and keep-minimum applied |
| Holds | Legal / compliance / investigation holds scoped to artifacts, a campaign or a run. Legal holds never expire and need a 20+ character justification to release |
| Bulk | Tag, export metadata (CSV/JSON), request deletion |

## Governance rules

- **Holds win.** An artifact under any active hold is never eligible in a retention simulation, cannot be queued for deletion, and blocks approval of a request queued before the hold was placed. Holds are re-checked at decision time.
- **Two-person deletion.** A request (analyst or above) must be approved by a *different* maintainer and then executed. Executing a request deletes real files through the artifact repository and removes demo entries from the catalog.
- **Audited.** Tags, policy changes, holds, deletion requests, decisions and executions all go to the manager's own audit trail and to the append-only audit log (`artifact.*` actions, #1431).
- **Permission-aware.** Anonymous viewers never see restricted artifacts. Analysts see that they exist, so retention and lineage stay explainable, but with name, key, bucket, creator, tags and findings masked. Only maintainers can download them, manage policies or holds, or approve deletions.

| Capability | anonymous | analyst | maintainer |
| --- | --- | --- | --- |
| Browse public/internal metadata | ✓ | ✓ | ✓ |
| See restricted artifacts | — | masked | ✓ |
| Preview / download (non-restricted, not blocked) | — | ✓ | ✓ |
| Tag, request deletion | — | ✓ | ✓ |
| Policies, holds, approve/execute deletion | — | — | ✓ |

## API

| Route | Purpose |
| --- | --- |
| `GET /api/artifacts/browse` | Filtered, paginated listing with facets and backend health. Cursors are bound to the filter set, so a mismatched cursor returns `400` |
| `GET /api/artifacts/metadata?id=[&verify=1][&preview=1]` | Metadata, integrity, access decision, signed download link, holds, deletion requests, preview |
| `POST /api/artifacts/metadata` | Bulk tag `{ action: 'tag', ids, add, remove }` |
| `GET /api/artifacts/lineage?id=&depth=1..4` | Lineage graph, capped at 60 nodes |
| `GET/POST /api/artifacts/retention` | Policies, simulation, queue, audit; `update-policy`, `request-deletion`, `decide`, `execute` |
| `GET/POST /api/artifacts/holds` | Holds with coverage; `create`, `release` |

The routes are registered in `lib/route-catalog.ts` **before** `/api/artifacts/[id]`, which would otherwise match them.

## Data sources

- **Real artifacts**: files in the existing artifact repository (`/api/artifacts`) appear as `local:<id>` with `source: 'storage'`. Their integrity starts as unknown. The first re-verification records a SHA-256 baseline, and later verifications detect changed bytes, which marks the artifact `blocked`.
- **Demo catalog**: a deterministic set of about 180 artifacts across local/S3/MinIO with realistic lineage and integrity states, flagged `source: 'demo'` and badged in the UI. Demo entries never offer downloads.
- **Backends**: local is always available. S3 vs MinIO follows the existing driver contract (`CRASHLAB_STORAGE_DRIVER=s3`, `CRASHLAB_S3_*`), and an endpoint that isn't AWS counts as MinIO. Unconfigured backends show `unavailable`. A backend with more than 5% integrity-blocked artifacts shows `degraded`.

## Module map

| Path | Responsibility |
| --- | --- |
| `apps/web/src/features/artifacts/storage-manager/lib/model.ts` | shared types |
| `.../lib/catalog.ts` | repository mapping and demo catalog |
| `.../lib/query.ts` | browse query, facets, bound cursors |
| `.../lib/integrity.ts` | trust assessment, preview safety, access decision |
| `.../lib/governance.ts` | retention simulation, holds, two-person deletion, tags, CSV |
| `.../lib/lineage.ts` | lineage graph and layout |
| `.../lib/permissions.ts` | role capabilities and projection |
| `.../lib/server.ts` | store, backend health, signed URLs, audit (server-only) |
| `.../ArtifactExplorer.tsx`, `ArtifactMetadataPanel.tsx`, `IntegrityStatusPanel.tsx`, `ProvenanceLineage.tsx`, `RetentionPolicyManager.tsx`, `HoldsManager.tsx`, `ArtifactStorageManager.tsx` | UI |
| `.../hooks/useArtifactManager.ts` | client data layer |

## Known gaps

- Governance state (policies, holds, queue, tags on real files) is process-local, like `reports-store`. A durable adapter can replace `ArtifactManagerStore` without changing the routes.
- `archive` is modelled in policies and simulations. Archive execution (moving objects to a cold tier) needs a storage-tier API and is follow-up work.
- Scan, signature and SLSA data for real uploads are not populated yet. Wiring `lib/artifact-security` scanners into the upload path will fill them.

## Tests

`apps/web/src/features/artifacts/storage-manager/lib/storage-manager.test.ts` and `apps/web/src/app/api/artifacts/storage-manager-routes.test.ts`. The route tests run the full governed deletion flow against real bytes in a mocked repository.
