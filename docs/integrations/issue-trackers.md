# Issue Tracker Sync Hub (WIP)

Tracks issue #2283. This is an early scaffold, not a complete implementation.

`apps/web/src/features/runs/create-run-issue-link-page-page.tsx` (served at
`/integrations/issue-links`) already provides a basic manual issue-linking flow for a single
run. This scaffold is the broader multi-provider sync hub the issue asks for and does not
touch or replace that existing flow.

## Status

- [x] Provider adapter stubs for GitHub/Jira/Linear (all throw "not implemented")
- [x] `syncEngine.ts` (state-mapping and conflict-detection logic only)
- [x] `IssueTrackerHub`, `ProviderConnections`, `CreateIssueDialog`, `LinkIssueDialog`,
      `SyncMappingEditor`, `SyncHistory`, `EvidenceTemplateEditor` component stubs
- [x] `providers`, `link`, `create`, `sync`, `mappings` API route stubs (return `501`)
- [ ] Real GitHub/Jira/Linear API integration with auth and rate-limit handling
- [ ] Evidence payload generation from crash summary/signature/repro steps/artifacts
- [ ] Bi-directional sync with webhook-driven updates and retry queueing
- [ ] Duplicate detection via signature/cluster/title similarity
- [ ] Secure token storage and least-privilege scopes for provider connections
- [ ] Bulk link/create and automation rule integration
- [ ] Audit log integration for link/sync actions

## Code

- `apps/web/src/features/integrations/issue-tracker/`
- `apps/web/src/lib/integrations/issue-trackers/`
- `apps/web/src/app/api/integrations/issues/`

See the full requirements in issue #2283.
