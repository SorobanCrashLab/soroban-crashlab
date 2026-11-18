---
name: "Integration: GitHub Actions Native Integration - Workflow Dispatch, Artifact Ingestion, Status Reporting & PR Annotation"
description: "Build first-class GitHub Actions integration with workflow_dispatch triggering, automatic artifact ingestion, run status reporting to Checks API, and intelligent PR annotations for crash findings"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Current GitHub integration (`apps/web/src/app/integrations/github-actions/`) is basic:
- Only webhook receiver for workflow events
- No workflow_dispatch to trigger fuzzing from GitHub
- No artifact ingestion from Actions uploads
- No Checks API reporting (run status in PR)
- No PR annotations for crashes (inline code pointers)

## Current State

- `apps/web/src/app/integrations/github-actions/` — webhook receiver only
- `apps/web/src/lib/github-webhook-verify.ts` — verification
- `apps/web/src/lib/github-oauth-state.ts` — OAuth
- No Actions-specific features

## Proposed Solution

**Native GitHub Actions Integration** with bidirectional workflow:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  GitHub Actions Integration                                            [⚙️] │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Repository: acme/contracts                                             │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │  🔧 Workflow Dispatch                                             │  │ │
│  │  │  Trigger fuzzing from Actions:                                    │  │ │
│  │  │  ```yaml                                                          │  │ │
│  │  │  - uses: sorobancrashlab/fuzz-action@v1                           │  │ │
│  │  │    with:                                                          │  │ │
│  │  │      campaign: "pr-validation"                                    │  │ │
│  │  │      target: "contracts/**/*.rs"                                  │  │ │
│  │  │      artifact: "fuzz-corpus.zip"                                  │  │ │
│  │  │  ```                                                               │  │ │
│  │  │  [Install Action]  [View Workflow Runs]                          │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │  📥 Artifact Ingestion                                           │  │ │
│  │  │  Auto-ingest:  ✓ corpus.zip  ✓ crash bundles  ✓ coverage.json  │  │ │
│  │  │  Last ingest: 2 min ago  |  47 MB  |  1,234 seeds              │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │  ✅ Checks API Reporting                                          │  │ │
│  │  │  Run status → GitHub Checks:  🟢 Queued  🟡 Running  🔴 Failed   │  │ │
│  │  │  Annotations:  3 crashes linked to source lines                  │  │ │
│  │  │  [View in PR #234]  [View in Actions]                            │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Requirements

### Functional

- [ ] **GitHub Action**: Published to Marketplace (`sorobancrashlab/fuzz-action`)
  - Inputs: campaign, target paths, artifact names, API token
  - Outputs: run_id, dashboard_url, crash_count
  - Supports: `workflow_dispatch`, `pull_request`, `schedule`
- [ ] **Workflow Dispatch API**: `POST /api/integrations/github/actions/dispatch` → triggers campaign
- [ ] **Artifact Ingestion**: Auto-download from Actions `actions/upload-artifact` → corpus/crash bundles
- [ ] **Checks API**: Create check run per fuzzing campaign; update status (queued→running→completed)
- [ ] **PR Annotations**: For each crash, create annotation on PR with:
  - File:line from reproducer
  - Crash type, signature, gas used
  - Link to CrashLab run detail
- [ ] **Status Badge**: Dynamic SVG badge for README (crash rate, last run status)
- [ ] **Repository Linking**: OAuth App + Installation → multi-repo support
- [ ] **Secret Management**: Store `CRASHLAB_API_TOKEN` in GitHub Secrets; auto-rotate

### Non-Functional

- [ ] Action execution overhead < 5s (excluding fuzzing time)
- [ ] Artifact download: Resumable, handles 500MB+ files
- [ ] Checks API: Update latency < 2s (GitHub rate limits respected)
- [ ] PR annotations: Batch create (max 50 per request), update on re-run
- [ ] OAuth: PKCE flow, minimal scopes (`repo`, `workflow`, `checks`)

## Files to Modify / Create

```
apps/web/src/integrations/github-actions/
├── action/
│   ├── action.yml                      # GitHub Action metadata
│   ├── entrypoint.ts                   # Main entry (Node.js)
│   ├── inputs.ts                       # Input validation (Zod)
│   ├── outputs.ts                      # Output setting
│   ├── artifactDownloader.ts           # Resumable download
│   ├── checkReporter.ts                # Checks API client
│   ├── annotationCreator.ts            # PR annotations
│   └── badgeGenerator.ts               # Dynamic SVG
├── api/
│   ├── dispatch/route.ts               # Workflow dispatch endpoint
│   ├── artifacts/route.ts              # Artifact ingestion webhook
│   ├── checks/route.ts                 # Checks API proxy
│   └── annotations/route.ts            # Annotation management
├── oauth/
│   ├── GitHubAppClient.ts              # App authentication (JWT)
│   ├── InstallationManager.ts          # Multi-repo installations
│   ├── SecretRotator.ts                # Auto-rotate tokens
│   └── Scopes.ts                       # Minimal scope definitions
├── webhooks/
│   ├── WorkflowRunHandler.ts           # workflow_run events
│   ├── WorkflowJobHandler.ts           # workflow_job events
│   └── ArtifactHandler.ts              # artifact events
└── ui/
    ├── GitHubActionsSetup.tsx          # Setup wizard
    ├── RepositoryLinker.tsx            # Link repos
    ├── ActionInstaller.tsx             # One-click install
    └── PRAnnotationViewer.tsx          # View annotations in CrashLab
```

**GitHub Action Repository** (new, separate repo or subdirectory):
```
.github-actions/fuzz-action/
├── action.yml
├── package.json
├── src/
│   ├── main.ts
│   ├── inputs.ts
│   ├── crashlab-client.ts
│   └── github-client.ts
├── dist/                               # Compiled (ncc)
└── README.md
```

## Acceptance Criteria

| Scenario | Target | Test |
|----------|--------|------|
| Action triggers campaign | Run created in < 10s | E2E |
| Artifact ingest (100MB) | < 60s | Benchmark |
| Checks API update | < 2s latency | Integration |
| PR annotations (10 crashes) | All appear on PR | E2E |
| Badge SVG | Valid, cached | Unit |
| OAuth install flow | < 3 clicks | UX test |

## PR Guide

- Branch: `issue/012-github-actions-native-integration`
- Phase 1: GitHub Action + workflow dispatch + artifact ingest
- Phase 2: Checks API + PR annotations + badges
- Phase 3: OAuth App + multi-repo + secret rotation
- Phase 4: UI setup wizard + marketplace publishing
- **Dependencies**: `@octokit/rest`, `@actions/core`, `@actions/github`, `ncc`
- Update `docs/INTEGRATIONS.md` with GitHub Actions guide
- Publish action to Marketplace (maintainer task)

## Related Issues

- Depends on: #002 (SSE for real-time status in Action), #011 (webhook reliability for artifact events)
- Blocks: #018 (scheduled PR annotation summaries)
- Related: `apps/web/src/app/integrations/github-actions/` (enhance)

## Contributor Notes

**Start here if:** You have experience with:
- GitHub Actions development (TypeScript, `@actions/*`)
- GitHub API (Checks, Annotations, OAuth Apps)
- Artifact handling (large files, resumable downloads)
- OAuth 2.0 / GitHub Apps (JWT, installations)

**Key challenges:**
- Action distribution: `ncc` compile → single file → Marketplace
- Rate limits: Checks API (5000/hr), Annotations (50/batch)
- Large artifacts: GitHub uploads → download via signed URLs (expire)
- Multi-repo: Installation tokens vs. OAuth tokens

**Learning resources:**
- Creating Actions: https://docs.github.com/en/actions/creating-actions
- Checks API: https://docs.github.com/en/rest/checks/runs
- Annotations: https://docs.github.com/en/rest/checks/runs#create-a-check-run
- GitHub Apps: https://docs.github.com/en/apps/creating-github-apps

**Estimated effort:** 4-5 weeks
**Mentorship available:** Yes