---
name: "Frontend: Issue Tracker Sync Hub - GitHub/Jira/Linear Linking, Bi-directional Status, and Evidence Sync"
description: "Deliver a unified issue tracker integration hub for linking crashes/runs/regressions to external issues with bi-directional status sync, evidence attachments, and mapping rules"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

CrashLab findings must be actionable in external trackers, but current linking is manual and fragmented (`issue-links` integration area, run issue utils).

Gaps:
- No unified UI for GitHub/Jira/Linear issue creation and linking
- No bi-directional sync (CrashLab triage state ↔ external issue status)
- Evidence (crash signature, repro steps, artifacts, run links) not consistently attached
- Duplicate issue detection/link suggestions missing
- Mapping rules per project/team/campaign not configurable

## Proposed Solution

Create an **Issue Tracker Sync Hub**:
- Provider connectors (GitHub Issues first-class, Jira/Linear extensible adapters)
- One-click "Create issue" from crash/run/regression with templated evidence payloads
- Link existing issues, detect likely duplicates, and manage multi-link relationships
- Bi-directional status sync with conflict resolution and audit trail
- Configurable field/state mapping and sync policies per workspace/campaign

## Requirements

### Functional
- [ ] Provider management: connect/disconnect, auth status, scopes/permissions checks (#054)
- [ ] Create issue flow from run/crash/regression/triage item with editable templates
- [ ] Link/unlink existing issues; search/select external issues; show backlink metadata
- [ ] Evidence sync: crash summary, signature, reproduction steps, environment, artifact links, screenshots/log excerpts
- [ ] Bi-directional sync: map CrashLab states to provider statuses and vice versa
- [ ] Conflict handling (both sides changed), sync history, retry failed syncs
- [ ] Duplicate detection suggestions using signature/cluster/title similarity (#021)
- [ ] Bulk link/create actions and automation rule integration (#049/#051)

### Non-Functional
- [ ] Provider API rate-limit handling with backoff and queueing
- [ ] Idempotent sync operations and webhook-driven updates where supported (#011)
- [ ] Secure token storage and least-privilege scopes (#025/#054)
- [ ] Comprehensive audit logs for link/sync actions

## Files to Modify / Create
```
apps/web/src/features/integrations/issue-tracker/
├── IssueTrackerHub.tsx
├── ProviderConnections.tsx
├── CreateIssueDialog.tsx
├── LinkIssueDialog.tsx
├── SyncMappingEditor.tsx
├── SyncHistory.tsx
├── EvidenceTemplateEditor.tsx
└── hooks/useIssueSync.ts

apps/web/src/app/integrations/issue-links/ (refactor/expand)
apps/web/src/app/api/integrations/issues/
├── providers/route.ts
├── link/route.ts
├── create/route.ts
├── sync/route.ts
└── mappings/route.ts

apps/web/src/lib/integrations/issue-trackers/
├── github.ts
├── jira.ts
├── linear.ts
└── syncEngine.ts
docs/integrations/issue-trackers.md
```

## Acceptance Criteria
- Users can create/link/sync issues across supported trackers from triage/run contexts
- Evidence-rich issue payloads generated consistently from templates
- Bi-directional sync reliable with conflict visibility and retries
- Duplicate suggestions reduce redundant issue creation

## PR Guide
- Branch: `issue/062-integration-issue-tracker-sync`
- Phase 1: Provider connections + link/create flows (GitHub)
- Phase 2: Evidence templates + sync engine + mappings
- Phase 3: Jira/Linear adapters + duplicate detection
- Phase 4: Bulk/automation integration, audit, tests/docs

**Estimated effort:** 5-6 weeks (200 pts)