---
name: "Security: Artifact Security - Malware Scanning, Signature Verification, Sandboxed Execution & Supply Chain Integrity"
description: "Implement comprehensive artifact security including malware scanning, cryptographic signature verification, sandboxed reproduction execution, and supply chain integrity checks"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Artifacts (crash bundles, corpus files, reproducers) are trusted blindly:
- No malware scanning on upload
- No signature verification for reproducer scripts
- Reproduction runs in privileged container (escape risk)
- No supply chain verification (SLSA, provenance)
- No quarantine for suspicious artifacts

## Current State

- `apps/web/src/lib/artifact-ingestion.ts` — Basic ingestion
- `apps/web/src/lib/artifact-fs-adapter.ts` — File storage
- `apps/web/src/lib/sandbox.rs` — Basic sandbox
- No scanning, no verification, no sandboxed execution

## Proposed Solution

**Multi-Layer Artifact Security** with defense in depth:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Artifact Security                                    [🔒 Quarantine: 3]    │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  UPLOAD PIPELINE                                                        │ │
│  │  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐  │ │
│  │  │ Upload  │──▶│ ClamAV  │──▶│ YARA    │──▶│ Sig     │──▶| Quarantine│  │ │
│  │  │         │   │ Scan    │   │ Rules   │   │ Verify  │   │ / Release │  │ │
│  │  └─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘  │ │
│  │       │            │            │            │            │             │ │
│  │       ▼            ▼            ▼            ▼            ▼             │ │
│  │  Chunked      Multi-engine   Custom rules  Cosign/     Policy:         │ │
│  │  upload       (ClamAV +      (packers,      Sigstore    - Malware→Q     │ │
│  │  + resumable  custom)        cryptominers)  verify      - YARA→Q        │ │
│  │                                                                      │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  REPRODUCTION SANDBOX                                                   │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │  gVisor / Kata Containers                                         │  │ │
│  │  │  ├── No host network                                              │  │ │
│  │  │  ├── Read-only rootfs                                             │  │ │
│  │  │  ├── CPU/memory limits (cgroups v2)                               │  │ │
│  │  │  ├── Seccomp profile (minimal syscalls)                           │  │ │
│  │  │  ├── No capability (CAP_DROP=ALL)                                 │  │ │
│  │  │  └── Ephemeral storage (tmpfs, no persist)                        │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  │  Reproducer Verification:  Sigstore cosign verify --certificate...     │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  SUPPLY CHAIN INTEGRITY                                                 │ │
│  │  SLSA Level 3:  ✓ Provenance  ✓ Reproducible  ✓ Signed  ✓ Verified    │ │
│  │  SBOM:  CycloneDX + SPDX  |  Vulnerability Scan:  Grype/Trivy          │ │
│  │  [Generate Attestation] [Verify Attestation] [View SBOM]               │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Requirements

### Functional

- [ ] **Malware Scanning**: 
  - ClamAV + custom YARA rules (packers, cryptominers, exploit kits)
  - Async: Upload → scan → quarantine/release
  - False positive handling: Review queue + allowlist
- [ ] **Signature Verification**: 
  - Reproducer scripts: Sigstore/cosign verification
  - Crash bundles: Signed by CrashLab core (Ed25519)
  - Policy: Unsigned → quarantine; Invalid sig → reject
- [ ] **Sandboxed Reproduction**: 
  - gVisor or Kata Containers (hardware-virtualized)
  - No network, read-only FS, minimal syscalls
  - Resource limits: CPU, memory, time, disk
  - Attestation: Reproduction result signed by sandbox
- [ ] **Supply Chain (SLSA)**: 
  - Provenance: Build info → SLSA attestation
  - SBOM: CycloneDX for all artifacts
  - Vulnerability scan: Grype/Trivy on reproducer deps
  - Verification: `slsa-verifier` on download
- [ ] **Quarantine Management**: 
  - UI: Review, release, delete, download (safe)
  - Auto-release: After manual review + 2 approvals
  - Retention: 90 days then auto-delete

### Non-Functional

- [ ] Scan latency: < 30s for 100MB artifact
- [ ] Sandbox overhead: < 20% reproduction time
- [ ] False positive rate: < 0.1%
- [ ] SLSA Level 3 compliance
- [ ] Zero host escapes in 1M reproductions

## Files to Modify / Create

```
apps/web/src/lib/artifact-security/
├── scanning/
│   ├── MalwareScanner.ts               # ClamAV + YARA orchestrator
│   ├── ClamAVClient.ts                 # ClamAV daemon client
│   ├── YARAEngine.ts                   # YARA rules (wasm or native)
│   ├── RuleManager.ts                  # Custom rules + updates
│   └── ScanResult.ts                   # Clean/Infected/Suspicious
├── verification/
│   ├── SignatureVerifier.ts            # Sigstore/cosign
│   ├── BundleSigner.ts                 # Core signs bundles
│   ├── ReproducerVerifier.ts           # Verify reproducer sigs
│   └── VerificationPolicy.ts           # Policies per artifact type
├── sandbox/
│   ├── SandboxManager.ts               # gVisor/Kata lifecycle
│   ├── SandboxProfile.ts               # Seccomp, caps, limits
│   ├── ReproductionExecutor.ts         # Run in sandbox + attest
│   ├── SandboxAttestation.ts           # Result signing
│   └── gVisorIntegration.ts            # runsc wrapper
├── supplychain/
│   ├── SLSAAttestation.ts              # Generate/verify SLSA
│   ├── SBOMGenerator.ts                # CycloneDX/SPDX
│   ├── VulnerabilityScanner.ts         # Grype/Trivy integration
│   ├── ProvenanceBuilder.ts            # Build provenance
│   └── VerificationPolicy.ts           # SLSA level requirements
├── quarantine/
│   ├── QuarantineManager.ts            # CRUD + workflow
│   ├── ReviewQueue.tsx                 # UI for review
│   ├── ApprovalWorkflow.ts             # 2-person release
│   └── RetentionPolicy.ts              # Auto-delete
└── hooks/
    ├── useArtifactSecurity.ts
    ├── useQuarantine.ts
    └── useSandbox.ts
```

**Core** (enhance sandbox):
```
contracts/crashlab-core/src/
├── sandbox/
│   ├── gvisor.rs                       # gVisor integration
│   ├── kata.rs                         # Kata Containers
│   ├── seccomp.rs                      # Profile generation
│   ├── attestation.rs                  # Result signing
│   └── resource_limits.rs              # cgroups v2
```

**Infrastructure** (new):
```
infrastructure/
├── sandbox/
│   ├── Dockerfile.gvisor               # gVisor runtime
│   ├── Dockerfile.kata                 # Kata Containers
│   ├── seccomp-profile.json            # Minimal syscalls
│   └── containerd-config.toml          # Runtime classes
├── scanning/
│   ├── clamav/
│   │   ├── Dockerfile
│   │   ├── freshclam.conf
│   │   └── clamd.conf
│   └── yara/
│       ├── rules/
│       │   ├── packers.yar
│       │   ├── cryptominers.yar
│       │   └── exploits.yar
│       └── Dockerfile
└── supplychain/
    ├── slsa-verifier/
    └── cosign/
```

## Acceptance Criteria

| Scenario | Target | Test |
|----------|--------|------|
| Malware scan (100MB) | < 30s | Benchmark |
| Sandbox reproduction | < 20% overhead | Benchmark |
| Signature verify | < 500ms | Benchmark |
| SLSA Level 3 attest | Valid | `slsa-verifier` |
| Quarantine review | < 5 min | UX test |
| Host escape attempt | Blocked | Penetration test |

## PR Guide

- Branch: `issue/023-artifact-security`
- Phase 1: Malware scanning + quarantine + signature verification
- Phase 2: gVisor/Kata sandbox + attestation
- Phase 3: SLSA provenance + SBOM + vulnerability scanning
- Phase 4: Quarantine workflow + review UI + retention
- **Dependencies**: `clamav.js` or gRPC, `yara-wasm`, `cosign`, `gvisor`, `slsa-framework`
- Update `docs/ARCHITECTURE.md` with artifact security architecture
- Update `SECURITY.md` with artifact handling procedures

## Related Issues

- Depends on: #022 (ABAC for quarantine access)
- Blocks: #024 (compliance reporting)
- Related: `artifact-ingestion.ts`, `artifact-fs-adapter.ts`, `sandbox.rs` (enhance)

## Contributor Notes

**Start here if:** You have experience with:
- Malware scanning (ClamAV, YARA)
- Container sandboxing (gVisor, Kata, Firecracker)
- Sigstore/cosign for supply chain security
- SLSA framework and attestations
- Seccomp profiles and Linux capabilities

**Key challenges:**
- gVisor vs Kata: Tradeoffs (compatibility vs. isolation)
- YARA rules: Maintenance, false positives
- Signature verification: Key management, rotation
- SLSA: Build system integration (GitHub Actions, etc.)

**Learning resources:**
- gVisor: https://gvisor.dev/
- Kata: https://katacontainers.io/
- Sigstore: https://www.sigstore.dev/
- SLSA: https://slsa.dev/
- YARA: https://virustotal.github.io/yara/

**Estimated effort:** 6-8 weeks
**Mentorship available:** Yes — Security engineer on team