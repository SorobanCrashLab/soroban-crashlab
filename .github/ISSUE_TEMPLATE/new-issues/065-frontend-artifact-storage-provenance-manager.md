---
name: "Frontend: Artifact Storage & Provenance Manager - Multi-Backend Browser, Integrity, Retention & Access Controls"
description: "Build a unified artifact storage management UI for browsing, verifying, retaining, and governing artifacts across local/S3/MinIO backends with provenance and integrity visibility"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Artifacts (bundles, logs, corpora, reports, reproducer outputs) are central to CrashLab but management capabilities are fragmented across ingestion APIs and storage drivers.

Gaps:
- No unified browser for artifacts across storage backends/drivers
- Limited visibility into provenance, checksums, signatures, and verification status (#023)
- No UI for retention policies, legal/compliance holds, and cleanup previews
- Difficult to trace artifact lineage (run/campaign/crash/reproducer/report relationships)
- Access controls/redaction for sensitive artifacts not consistently surfaced

## Proposed Solution

Implement an **Artifact Storage & Provenance Manager**:
- Multi-backend artifact browser with metadata search/filter and previews (#044)
- Provenance and integrity panels (hashes, signatures, SLSA/SBOM links, scan status)
- Retention policy management, hold controls, and safe deletion workflows
- Lineage graph and cross-links to runs/crashes/triage/reports
- Permission-aware access/download/redaction controls and audit logging

## Requirements

### Functional
- [ ] Artifact explorer: browse by backend, campaign, run, type, date, size, tags
- [ ] Rich metadata view: checksums, content type, provenance, creator/system, linked entities
- [ ] Integrity/security status: scan results, signature verification, quarantine state (#023)
- [ ] Preview/download actions with redaction-aware access and signed URL handling
- [ ] Retention policies per artifact class with simulation/dry-run and deletion queues
- [ ] Legal/compliance hold management and override governance
- [ ] Lineage visualization: artifact relationships and derivations
- [ ] Bulk operations (tag, retain, export metadata, delete request) with approvals/audit (#051)

### Non-Functional
- [ ] Scales to large artifact catalogs with server-side search/pagination
- [ ] Secure handling of downloads/previews (no secret leakage, content-type safety)
- [ ] All destructive/retention actions audited and permission-gated
- [ ] Clear indicators for degraded storage/integrity states

## Files to Modify / Create
```
apps/web/src/features/artifacts/storage-manager/
├── ArtifactExplorer.tsx
├── ArtifactMetadataPanel.tsx
├── IntegrityStatusPanel.tsx
├── ProvenanceLineage.tsx
├── RetentionPolicyManager.tsx
├── HoldsManager.tsx
└── hooks/useArtifactManager.ts

apps/web/src/app/integrations/artifacts/ (expand/refactor)
apps/web/src/app/api/artifacts/
├── browse/route.ts
├── metadata/route.ts
├── lineage/route.ts
├── retention/route.ts
└── holds/route.ts

docs/artifacts/storage-provenance-manager.md
```

## Acceptance Criteria
- Operators can discover, inspect, and govern artifacts across configured backends
- Integrity/provenance/security states are visible and actionable
- Retention/hold workflows are safe, auditable, and policy-driven
- Artifact lineage improves investigation and reproducibility workflows

## PR Guide
- Branch: `issue/065-frontend-artifact-storage-provenance`
- Phase 1: Explorer + metadata/provenance views
- Phase 2: Integrity/security status + preview/download controls
- Phase 3: Retention/holds + lineage + bulk actions
- Phase 4: Governance hardening, tests/docs

**Estimated effort:** 5-6 weeks (200 pts)