---
name: "Security: Advanced RBAC - Attribute-Based Access Control (ABAC) with Policy Engine, Resource-Level Permissions & Audit Trail"
description: "Replace role-based access with attribute-based access control supporting dynamic policies, resource-level permissions, time-based access, and comprehensive audit logging"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Current RBAC (`apps/web/src/lib/rbac.ts`) is role-based only:
- Fixed roles (admin, maintainer, viewer) — no granularity
- No resource-level permissions (can't restrict to specific campaigns)
- No dynamic policies (time-based, IP-based, risk-based)
- Limited audit trail (no decision logging)
- No policy-as-code / GitOps for permissions

## Current State

- `apps/web/src/lib/rbac.ts` — Basic RBAC
- `apps/web/src/lib/permissions.ts` — Permissions definitions
- `apps/web/src/app/api/auth/` — Authentication
- No ABAC, no policy engine, no comprehensive audit

## Proposed Solution

**Attribute-Based Access Control (ABAC)** with Cedar/OPA policy engine:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Access Control                                      [📝 Policy Editor]     │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  POLICIES (Cedar)                                                       │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │  permit (principal, action, resource) when {                      │  │ │
│  │  │    principal.team == resource.campaign.team                       │  │ │
│  │  │    && action in [View, Triag]                                     │  │ │
│  │  │    && context.time between "09:00" and "18:00"                   │  │ │
│  │  │    && context.ip in "10.0.0.0/8"                                 │  │ │
│  │  │  };                                                               │  │ │
│  │  │                                                                   │  │ │
│  │  │  permit (principal, action, resource) when {                      │  │ │
│  │  │    principal.role == "admin"                                     │  │ │
│  │  │  };                                                               │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  │  [Validate] [Test] [Deploy] [Version History]                          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  RESOURCE PERMISSIONS                                                   │ │
│  │  Campaign: mainnet-fuzz                                                │ │
│  │  ├── Team: security      →  [Admin, Triager, Viewer]  [Time: 24/7]     │ │
│  │  ├── Team: dev           →  [Triager, Viewer]          [Time: Business]│ │
│  │  ├── User: alice         →  [Admin]                    [Expires: 30d]  │ │
│  │  └── Public              →  [Viewer]                   [IP: Allowlist] │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  AUDIT LOG                                                              │ │
│  │  2024-01-15 14:32  alice  GRANTED  triage.run  run_abc123  (policy:1)  │ │
│  │  2024-01-15 14:31  bob    DENIED   admin.campaign  mainnet-fuzz        │ │
│  │  2024-01-15 14:30  carol  GRANTED  view.run  run_def456  (policy:2)    │ │
│  │  [Export] [Filter] [Stream to SIEM]                                    │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Requirements

### Functional

- [ ] **Policy Engine**: Cedar (AWS) or OPA/Rego — evaluate `permit(principal, action, resource, context)`
- [ ] **Attribute Model**: 
  - Principal: user, team, role, groups, risk_score
  - Resource: campaign, run, artifact, type, owner, tags, sensitivity
  - Context: time, IP, location, device, MFA_verified, request_id
- [ ] **Policy Authoring**: 
  - Visual editor (Blocks) + Cedar syntax
  - Policy testing: Dry-run against sample requests
  - Version control: GitOps (policies in repo, auto-deploy)
- [ ] **Resource-Level Permissions**: Per-campaign, per-run, per-artifact
- [ ] **Dynamic Conditions**: Time windows, IP allowlists, geo-fencing, risk-based
- [ ] **Audit Trail**: Every decision (allow/deny) logged with full context
- [ ] **SIEM Integration**: Stream audit logs to Splunk, Datadog, Elastic
- [ ] **Break-glass**: Emergency access with approval workflow + full audit

### Non-Functional

- [ ] Authorization latency < 10ms (p99)
- [ ] Policy evaluation: 10,000 req/s
- [ ] Audit log: Immutable, tamper-evident (append-only)
- [ ] Policy deployment: < 30s (hot reload)
- [ ] Availability: 99.99% (policy engine cached, fallback allow/deny)

## Files to Modify / Create

```
apps/web/src/lib/auth/
├── abac/
│   ├── PolicyEngine.ts                 # Cedar/OPA wrapper
│   ├── AttributeProvider.ts            # Resolve attributes for request
│   ├── AuthorizationService.ts         # permit() API
│   ├── PolicyCompiler.ts               # Cedar/OPA → WASM/JS
│   └── PolicyCache.ts                  # Hot-reload cache
├── policies/
│   ├── PolicyStore.ts                  # CRUD + versioning
│   ├── PolicyValidator.ts              # Syntax + semantic validation
│   ├── PolicyTester.ts                 # Dry-run test cases
│   ├── GitOpsSync.ts                   # Sync from repo
│   └── PolicyEditor.tsx                # Visual + code editor
├── resources/
│   ├── ResourceRegistry.ts             # Register resource types
│   ├── ResourceResolver.ts             # Load resource attributes
│   ├── CampaignResource.ts             # Campaign permissions
│   ├── RunResource.ts                  # Run permissions
│   └── ArtifactResource.ts             # Artifact permissions
├── audit/
│   ├── AuditLogger.ts                  # Structured audit events
│   ├── AuditStore.ts                   # Immutable storage (append-only)
│   ├── SIEMExporter.ts                 # Splunk/Datadog/Elastic
│   ├── AuditQuery.ts                   # Search + export
│   └── TamperEvidence.ts               # Hash chain / Merkle tree
├── breakglass/
│   ├── BreakGlassManager.ts            # Request + approval workflow
│   ├── ApprovalWorkflow.ts             # Multi-party approval
│   └── BreakGlassAudit.ts              # Enhanced logging
└── hooks/
    ├── useAuthorization.ts
    ├── usePolicyEditor.ts
    └── useAuditLog.ts
```

**Core** (policy evaluation):
```
contracts/crashlab-core/src/
├── abac/
│   ├── cedar_engine.rs                 # Cedar Rust SDK
│   ├── policy_eval.rs                  # Evaluation logic
│   └── attributes.rs                   # Attribute types
```

**Policy Repository** (new, GitOps):
```
policies/
├── main.cedar                          # Root policy
├── teams/
│   ├── security.cedar
│   ├── dev.cedar
│   └── maintainers.cedar
├── resources/
│   ├── campaigns.cedar
│   ├── runs.cedar
│   └── artifacts.cedar
└── tests/
    ├── test_cases.yaml                 # Dry-run test cases
    └── fixtures/
```

## Acceptance Criteria

| Scenario | Target | Test |
|----------|--------|------|
| Authorization decision | < 10ms p99 | Benchmark |
| Policy hot reload | < 30s | Integration |
| Audit log write | < 5ms | Benchmark |
| SIEM export | < 1s/1000 events | Benchmark |
| Break-glass approval | < 2min | E2E |
| Policy test (100 cases) | < 5s | Unit |

## PR Guide

- Branch: `issue/022-advanced-abac`
- Phase 1: Policy engine + attribute model + basic policies
- Phase 2: Resource permissions + dynamic conditions + visual editor
- Phase 3: Audit trail + SIEM + tamper evidence
- Phase 4: Break-glass + GitOps + policy testing
- **Dependencies**: `cedar-policy` (Rust/JS), `opa-wasm` (alternative)
- Update `docs/ARCHITECTURE.md` with ABAC architecture
- Update `SECURITY.md` with access control model

## Related Issues

- Depends on: #003 (collaborative triage needs resource permissions)
- Blocks: #023 (compliance reporting)
- Related: `rbac.ts`, `permissions.ts` (replace/enhance)

## Contributor Notes

**Start here if:** You have experience with:
- Cedar policy language (AWS) or OPA/Rego
- Attribute-based access control (ABAC) patterns
- Policy-as-code / GitOps workflows
- Audit logging / SIEM integration
- Immutable data structures (Merkle trees, hash chains)

**Key challenges:**
- Policy language choice: Cedar (AWS, newer) vs OPA (mature, Rego)
- Attribute resolution: Performance vs. freshness
- Audit immutability: Storage backend choice
- Break-glass: Security vs. usability

**Learning resources:**
- Cedar: https://www.cedarpolicy.com/
- OPA: https://www.openpolicyagent.org/
- ABAC patterns: https://csrc.nist.gov/projects/abac
- GitOps: https://www.gitops.tech/

**Estimated effort:** 5-6 weeks
**Mentorship available:** Yes