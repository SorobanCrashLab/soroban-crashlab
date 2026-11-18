---
name: "Security: Secrets Management & Rotation - Vault Integration, Encrypted Storage, Automatic Rotation & Leak Detection"
description: "Implement enterprise secrets management with Vault integration, encrypted at-rest storage, automatic key rotation, and runtime leak detection for API keys, webhook secrets, and tokens"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Secrets (webhook signing keys, API tokens, OAuth credentials, integration secrets) are stored insecurely:
- No centralized secrets manager integration
- Manual rotation with downtime risk
- No leak detection in logs/artifacts
- No per-tenant secret isolation
- Secrets may appear in error messages or traces

## Proposed Solution

**Unified Secrets Management** with Vault/KMS integration:

- **Vault Integration**: HashiCorp Vault / AWS KMS / GCP Secret Manager abstraction layer
- **Encrypted Storage**: Envelope encryption for secrets at rest (AES-256-GCM)
- **Automatic Rotation**: Zero-downtime rotation for webhook keys, API tokens, OAuth secrets
- **Leak Detection**: Runtime scanning of logs, traces, error payloads, and artifacts for secret patterns
- **Secret Scoping**: Per-tenant, per-integration secret isolation with RBAC (#022)

## Requirements

### Functional
- [ ] Secrets provider abstraction (Vault, AWS KMS, GCP SM, env fallback)
- [ ] Envelope encryption for local/DB-stored secrets
- [ ] Automatic rotation workflows with overlap windows and rollback
- [ ] Secret versioning and rotation history
- [ ] Leak detection scanner for logs, traces, webhook payloads, exported artifacts
- [ ] Redaction middleware integrated with structured logging and error reporting
- [ ] UI for secret lifecycle (create, rotate, revoke, audit) with masked values

### Non-Functional
- [ ] Secret retrieval latency < 50ms (cached)
- [ ] Zero plaintext secrets in logs/traces/artifacts
- [ ] Rotation without service interruption
- [ ] Audit trail for all secret access

## Files to Modify / Create
```
apps/web/src/lib/security/secrets/
├── SecretManager.ts
├── providers/
│   ├── VaultProvider.ts
│   ├── KMSProvider.ts
│   ├── GCPSecretManagerProvider.ts
│   └── EnvFallbackProvider.ts
├── encryption/
│   ├── EnvelopeEncryption.ts
│   ├── KeyRotation.ts
│   └── KeyStore.ts
├── leak-detection/
│   ├── SecretScanner.ts
│   ├── PatternRegistry.ts
│   ├── LogRedactor.ts
│   └── TraceRedactor.ts
├── rotation/
│   ├── RotationScheduler.ts
│   ├── RotationWorkflow.ts
│   └── RollbackManager.ts
└── ui/
    ├── SecretsDashboard.tsx
    └── RotationHistory.tsx

apps/web/src/app/api/secrets/
├── route.ts
├── rotate/route.ts
└── audit/route.ts
```

## Acceptance Criteria
- Secrets retrievable from Vault/KMS with fallback
- Automatic rotation completes with zero downtime
- Leak scanner catches injected test secrets in logs/traces
- All secret access audited

## PR Guide
- Branch: `issue/025-security-secrets-management`
- Phase 1: Provider abstraction + encryption
- Phase 2: Rotation workflows + versioning
- Phase 3: Leak detection + redaction
- Phase 4: UI + audit integration

**Estimated effort:** 4-5 weeks