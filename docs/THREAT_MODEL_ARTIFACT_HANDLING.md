# Threat Model: Artifact Handling

**Version**: 1.0  
**Last Updated**: 2026-04-23  
**Status**: Draft  
**Owner**: Security Team

## Executive Summary

This document provides a comprehensive threat model for artifact handling in Soroban CrashLab, covering input ingestion, artifact storage, and report export. It identifies trust boundaries, threat actors, attack vectors, mitigations, and residual risks across the fuzzing lifecycle.

## Table of Contents

1. [System Overview](#system-overview)
2. [Trust Boundaries](#trust-boundaries)
3. [Assets](#assets)
4. [Threat Actors](#threat-actors)
5. [Attack Surface](#attack-surface)
6. [Threat Scenarios](#threat-scenarios)
7. [Mitigations](#mitigations)
8. [Residual Risks](#residual-risks)
9. [Testing Strategy](#testing-strategy)
10. [Incident Response](#incident-response)

---

## System Overview

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Soroban CrashLab                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────┐ │
│  │ Input        │─────▶│ Fuzzing      │─────▶│ Artifact │ │
│  │ Ingestion    │      │ Engine       │      │ Storage  │ │
│  └──────────────┘      └──────────────┘      └──────────┘ │
│         │                     │                     │      │
│         │                     │                     │      │
│         ▼                     ▼                     ▼      │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────┐ │
│  │ Seed         │      │ Crash        │      │ Report   │ │
│  │ Validation   │      │ Detection    │      │ Export   │ │
│  └──────────────┘      └──────────────┘      └──────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Input Ingestion**: External seeds → `CaseSeed` validation → Fuzzing engine
2. **Artifact Storage**: Crash bundles → Filesystem → JSON persistence
3. **Report Export**: Bundles → Sanitization → JSON/Markdown/Rust fixtures

---

## Trust Boundaries

### TB-1: External Input Boundary
**Location**: `CaseSeed` construction from external sources  
**Trust Level**: Zero trust - all input is adversarial  
**Enforcement**: `SeedSchema::validate()` before use

### TB-2: Filesystem Boundary
**Location**: Artifact write operations  
**Trust Level**: Operator-controlled, but filenames may be attacker-influenced  
**Enforcement**: Signature hash for filenames, explicit permissions

### TB-3: Export Boundary
**Location**: Report generation for external sharing  
**Trust Level**: Public - may contain sensitive data  
**Enforcement**: Sanitization functions before export

### TB-4: RPC Boundary
**Location**: Soroban RPC calls during simulation  
**Trust Level**: External service - may be malicious or compromised  
**Enforcement**: Retry logic, envelope capture, redaction

---

## Assets

### Critical Assets

| Asset | Confidentiality | Integrity | Availability | Impact if Compromised |
|-------|----------------|-----------|--------------|----------------------|
| **Seed Corpus** | Medium | High | High | Loss of fuzzing progress, inability to reproduce crashes |
| **Crash Bundles** | High | Critical | High | Loss of vulnerability evidence, inability to fix bugs |
| **RPC Credentials** | Critical | N/A | N/A | Unauthorized RPC access, quota exhaustion |
| **Filesystem** | Medium | High | Critical | Data loss, denial of service, privilege escalation |
| **Exported Reports** | High | Medium | Low | Information disclosure, reputation damage |

### Data Classification

- **Public**: Sanitized reports, documentation
- **Internal**: Raw crash bundles, seed corpus, logs
- **Confidential**: RPC credentials, API keys, private keys in payloads
- **Restricted**: Production deployment configurations

---

## Threat Actors

### TA-1: Malicious Fuzzing Input Provider
**Motivation**: Cause denial of service, escape sandbox, exfiltrate data  
**Capabilities**: Craft malicious seeds, exploit parser vulnerabilities  
**Access**: Can submit seeds via file, network, or generator

### TA-2: Compromised RPC Endpoint
**Motivation**: Inject false results, steal credentials, track usage  
**Capabilities**: Control RPC responses, log requests, perform timing attacks  
**Access**: Network-level man-in-the-middle or compromised service

### TA-3: Local Attacker with Filesystem Access
**Motivation**: Read sensitive artifacts, modify corpus, plant backdoors  
**Capabilities**: Read/write filesystem, modify permissions  
**Access**: Local user account on fuzzing host

### TA-4: Supply Chain Attacker
**Motivation**: Inject malicious code, steal secrets, establish persistence  
**Capabilities**: Compromise dependencies, modify build artifacts  
**Access**: Dependency repositories, CI/CD pipeline

### TA-5: Insider Threat
**Motivation**: Exfiltrate vulnerabilities, sabotage fuzzing, leak credentials  
**Capabilities**: Full system access, knowledge of internals  
**Access**: Developer or operator account

---

## Attack Surface

### AS-1: Seed Input Parsing
**Entry Points**:
- `CaseSeed` deserialization from JSON
- Corpus import via `import_corpus_json`
- Bundle loading via `load_case_bundle_json`

**Attack Vectors**:
- Oversized payloads (> 64 bytes default)
- Null bytes in payload
- Invalid UTF-8 in JSON
- Integer overflow in seed ID
- Malformed JSON structure

### AS-2: Filename Generation
**Entry Points**:
- Bundle persistence to filesystem
- Corpus export to files
- Report generation

**Attack Vectors**:
- Path traversal (`../../../etc/passwd`)
- Null byte injection (`file.json\0.txt`)
- Special characters (`file; rm -rf /`)
- Symlink attacks
- Race conditions (TOCTOU)

### AS-3: Artifact Deserialization
**Entry Points**:
- `load_case_bundle_json`
- `import_corpus_json`
- `load_run_checkpoint_json`
- `load_regression_suite_json`

**Attack Vectors**:
- Schema version confusion
- Type confusion attacks
- Recursive structures (stack overflow)
- Memory exhaustion
- Deserialization gadgets

### AS-4: Report Export
**Entry Points**:
- `export_scenario_json`
- `export_crash_report_markdown`
- `export_rust_regression_fixture`
- `save_sanitized_case_bundle_json`

**Attack Vectors**:
- Information disclosure (secrets in payloads)
- Code injection in Rust fixtures
- Markdown injection
- XSS in web dashboard
- Path disclosure

### AS-5: RPC Communication
**Entry Points**:
- `run_simulation_with_timeout`
- RPC envelope capture
- Retry logic

**Attack Vectors**:
- Credential leakage in logs
- Man-in-the-middle attacks
- Response injection
- Timing attacks
- Quota exhaustion

---

## Threat Scenarios

### T-1: Malicious Seed Causes Path Traversal

**STRIDE Category**: Tampering, Information Disclosure  
**Severity**: High  
**Likelihood**: Medium

**Scenario**:
Attacker crafts a seed with payload containing path separators. If the integrator naively uses `seed.id` or `seed.payload` in a filename without sanitization, the fuzzer writes artifacts outside the intended directory.

**Attack Chain**:
1. Attacker submits seed: `CaseSeed { id: 1, payload: b"../../etc/cron.d/backdoor" }`
2. Integrator constructs filename: `format!("crashes/{}.json", String::from_utf8_lossy(&seed.payload))`
3. Bundle is written to `/etc/cron.d/backdoor.json`
4. Attacker gains code execution via cron job

**Existing Mitigations**:
- ✅ `compute_signature_hash` provides safe filename generation
- ✅ Documentation warns against using raw payload in paths
- ❌ No built-in path sanitization function

**Residual Risk**: **Medium** - Integrators may not follow guidance

**Recommended Mitigations**:
- Provide `sanitize_filename()` utility function
- Add runtime assertion that output paths stay within base directory
- Add integration test demonstrating safe artifact storage

---

### T-2: Oversized Payload Causes Memory Exhaustion

**STRIDE Category**: Denial of Service  
**Severity**: Medium  
**Likelihood**: High

**Scenario**:
Attacker submits seed with multi-megabyte payload. If validation is skipped, the fuzzer allocates excessive memory, causing OOM or slowdown.

**Attack Chain**:
1. Attacker submits: `CaseSeed { id: 1, payload: vec![0; 100_000_000] }`
2. Integrator skips validation
3. Fuzzer attempts to mutate 100MB payload
4. System runs out of memory or thrashes

**Existing Mitigations**:
- ✅ `SeedSchema` validates payload length (default 1-64 bytes)
- ✅ Validation errors returned without panic
- ❌ Validation is not automatic - integrator must call it

**Residual Risk**: **Medium** - Validation can be skipped

**Recommended Mitigations**:
- Add `CaseSeed::validated()` constructor that enforces validation
- Add fuzzing test for oversized payloads
- Document memory limits in README

---

### T-3: Null Byte in Payload Causes Truncation

**STRIDE Category**: Tampering  
**Severity**: Low  
**Likelihood**: Low

**Scenario**:
Payload contains null byte (`0x00`). If passed to C API or used in C-style string context, payload is truncated, causing incorrect classification or replay mismatch.

**Attack Chain**:
1. Attacker submits: `CaseSeed { id: 1, payload: b"valid\0malicious" }`
2. Payload is passed to C API expecting null-terminated string
3. C API only sees `"valid"`, ignoring `"malicious"`
4. Crash signature differs between capture and replay

**Existing Mitigations**:
- ✅ Documented as known gap in README and MAINTAINER_WAVE_PLAYBOOK
- ❌ No validation for null bytes

**Residual Risk**: **Low** - Rare in practice, documented

**Recommended Mitigations**:
- Add optional `SeedSchema::forbid_null_bytes` flag
- Add test case for null byte handling
- Document C API integration risks

---

### T-4: Unsupported Schema Version Causes Confusion

**STRIDE Category**: Tampering, Denial of Service  
**Severity**: Low  
**Likelihood**: Medium

**Scenario**:
Attacker provides bundle with future schema version. If not validated, deserializer may misinterpret fields or panic.

**Attack Chain**:
1. Attacker crafts: `{"schema": 999, "seed": {...}, ...}`
2. Integrator calls `load_case_bundle_json`
3. Deserializer fails with unclear error or misinterprets fields

**Existing Mitigations**:
- ✅ Schema version validated against `SUPPORTED_BUNDLE_SCHEMAS`
- ✅ Clear error message: `UnsupportedSchema { found: 999 }`
- ✅ Backward compatibility for schema v1

**Residual Risk**: **Very Low** - Well mitigated

**Recommended Mitigations**:
- None - current mitigation is sufficient

---

### T-5: RPC Credentials Leaked in Logs

**STRIDE Category**: Information Disclosure  
**Severity**: Critical  
**Likelihood**: Medium

**Scenario**:
RPC request contains authentication token. If logged or captured without redaction, credentials are exposed in artifacts or dashboards.

**Attack Chain**:
1. Fuzzer makes RPC call with `Authorization: Bearer <token>`
2. `RpcEnvelopeCapture` stores full request including auth header
3. Bundle is exported with `save_case_bundle_json`
4. Attacker reads bundle file and extracts token

**Existing Mitigations**:
- ✅ `RpcRequestEnvelope` redacts `auth` field in params
- ✅ Test verifies redaction: `assert_eq!(loaded_envelope.request.params["auth"], "[REDACTED]")`
- ❌ No redaction for HTTP headers (Authorization, API-Key, etc.)

**Residual Risk**: **Medium** - Headers not redacted

**Recommended Mitigations**:
- Add `redact_sensitive_headers()` function
- Redact `Authorization`, `X-API-Key`, `Cookie` headers
- Add test for header redaction
- Document which fields are redacted

---

### T-6: Exported Report Contains Secrets

**STRIDE Category**: Information Disclosure  
**Severity**: High  
**Likelihood**: High

**Scenario**:
Crash payload contains private key, API token, or password. If exported without sanitization, secrets are leaked in public reports.

**Attack Chain**:
1. Fuzzer discovers crash with payload: `b"sk_live_abc123..."`
2. Integrator exports with `export_scenario_json`
3. Report is shared publicly or committed to Git
4. Attacker extracts secret from hex-encoded payload

**Existing Mitigations**:
- ✅ `sanitize_payload_fragments` scrubs secret-like patterns
- ✅ `save_sanitized_case_bundle_json` for safe export
- ✅ Documentation recommends sanitization before sharing
- ❌ Raw export functions don't enforce sanitization

**Residual Risk**: **High** - Easy to use wrong export function

**Recommended Mitigations**:
- Rename raw export to `export_scenario_json_unsafe`
- Make sanitized export the default
- Add CI check for secret patterns in test fixtures
- Add pre-commit hook to detect secrets

---

### T-7: Symlink Attack During Artifact Write

**STRIDE Category**: Tampering, Elevation of Privilege  
**Severity**: High  
**Likelihood**: Low

**Scenario**:
Attacker creates symlink in artifact directory pointing to sensitive file. Fuzzer overwrites symlink target instead of creating new file.

**Attack Chain**:
1. Attacker creates: `ln -s /etc/passwd crashes/bundle_123.json`
2. Fuzzer writes bundle to `crashes/bundle_123.json`
3. `/etc/passwd` is overwritten
4. System becomes unusable or attacker gains access

**Existing Mitigations**:
- ❌ No symlink detection
- ❌ No atomic file creation
- ❌ No O_NOFOLLOW equivalent in Rust std

**Residual Risk**: **Medium** - Requires local access

**Recommended Mitigations**:
- Use `OpenOptions::new().create_new(true)` to fail if file exists
- Check if path is symlink before writing
- Use dedicated artifact directory with restrictive permissions (0o700)
- Document symlink attack risk

---

### T-8: Race Condition in Checkpoint Resume

**STRIDE Category**: Tampering, Denial of Service  
**Severity**: Medium  
**Likelihood**: Low

**Scenario**:
Two fuzzer instances resume from same checkpoint simultaneously. Both read `next_seed_index`, process same seeds, causing duplicate work or corrupted state.

**Attack Chain**:
1. Fuzzer A reads checkpoint: `next_seed_index: 100`
2. Fuzzer B reads checkpoint: `next_seed_index: 100`
3. Both process seeds 100-110
4. Both write checkpoint with `next_seed_index: 110`
5. Seeds 100-110 are processed twice, wasting resources

**Existing Mitigations**:
- ✅ `WorkerPartition` splits seeds deterministically by worker ID
- ❌ No file locking on checkpoint
- ❌ No atomic checkpoint update

**Residual Risk**: **Low** - Mitigated by worker partitioning

**Recommended Mitigations**:
- Document that checkpoints are per-worker
- Add example of multi-worker setup with separate checkpoint files
- Consider advisory file locking for single-worker case

---

### T-9: Malicious Rust Fixture Injection

**STRIDE Category**: Tampering, Elevation of Privilege  
**Severity**: Critical  
**Likelihood**: Low

**Scenario**:
Attacker crafts bundle that generates malicious Rust code when exported as fixture. If test name or payload is not sanitized, arbitrary code is injected.

**Attack Chain**:
1. Attacker submits seed with payload: `b"}; std::process::Command::new(\"rm\").arg(\"-rf\").arg(\"/\").spawn(); {"`
2. Integrator exports: `export_rust_regression_fixture(&bundle, "test_crash")`
3. Generated fixture contains: `payload: vec![...]; std::process::Command::new("rm")...`
4. Running tests executes malicious code

**Existing Mitigations**:
- ✅ Test name validated with `is_valid_rust_ident`
- ✅ Payload is hex-encoded as `0xAB, 0xCD` literals
- ✅ No string interpolation of payload
- ✅ Test verifies invalid test names are rejected

**Residual Risk**: **Very Low** - Well mitigated

**Recommended Mitigations**:
- None - current mitigation is sufficient
- Consider adding fuzzing test for fixture generation

---

### T-10: Storage Exhaustion Attack

**STRIDE Category**: Denial of Service  
**Severity**: Medium  
**Likelihood**: Medium

**Scenario**:
Attacker triggers many unique crashes, filling disk with artifacts. Fuzzer cannot write new bundles, causing data loss or system failure.

**Attack Chain**:
1. Attacker submits 1 million unique seeds
2. Each triggers unique crash (different signature_hash)
3. Fuzzer writes 1 million bundles to disk
4. Disk fills up (ENOSPC)
5. Fuzzer cannot write new artifacts or checkpoints

**Existing Mitigations**:
- ✅ `RetentionPolicy` limits stored artifacts
- ✅ `max_failure_bundles` caps bundle count
- ❌ No disk space monitoring
- ❌ I/O errors not handled gracefully

**Residual Risk**: **Medium** - Requires monitoring

**Recommended Mitigations**:
- Add disk space check before writing artifacts
- Fail gracefully on ENOSPC with clear error message
- Document retention policy configuration
- Add metric for artifact storage usage

---

## Mitigations

### Implemented Mitigations

| ID | Mitigation | Component | Effectiveness | Test Coverage |
|----|-----------|-----------|---------------|---------------|
| M-1 | Seed payload length validation | `SeedSchema` | High | ✅ Unit tests |
| M-2 | Signature hash for filenames | `compute_signature_hash` | High | ✅ Unit tests |
| M-3 | Schema version validation | `CaseBundleDocument` | High | ✅ Unit tests |
| M-4 | RPC auth parameter redaction | `RpcRequestEnvelope` | Medium | ✅ Unit tests |
| M-5 | Payload sanitization | `sanitize_payload_fragments` | Medium | ✅ Unit tests |
| M-6 | Rust identifier validation | `is_valid_rust_ident` | High | ✅ Unit tests |
| M-7 | Worker partitioning | `WorkerPartition` | High | ✅ Unit tests |
| M-8 | Retention policy | `RetentionPolicy` | Medium | ✅ Unit tests |
| M-9 | Deterministic ordering | `sort_seeds_deterministic` | Medium | ✅ Unit tests |
| M-10 | Environment fingerprinting | `EnvironmentFingerprint` | Low | ✅ Unit tests |

### Recommended Mitigations

| ID | Mitigation | Priority | Effort | Impact |
|----|-----------|----------|--------|--------|
| R-1 | Add `sanitize_filename()` utility | High | Low | High |
| R-2 | Add `CaseSeed::validated()` constructor | High | Low | High |
| R-3 | Redact HTTP headers in RPC capture | High | Medium | High |
| R-4 | Make sanitized export the default | High | Low | High |
| R-5 | Add disk space monitoring | Medium | Medium | Medium |
| R-6 | Add symlink detection | Medium | Medium | Medium |
| R-7 | Add null byte validation option | Low | Low | Low |
| R-8 | Add file locking for checkpoints | Low | Medium | Low |
| R-9 | Add CI secret scanning | High | Low | High |
| R-10 | Add pre-commit hook for secrets | Medium | Low | Medium |

---

## Residual Risks

### High Residual Risks

**RR-1: Integrator Skips Validation**  
**Risk**: Integrators may not call `SeedSchema::validate()` before using seeds  
**Impact**: Memory exhaustion, crashes, incorrect behavior  
**Mitigation**: Documentation, examples, consider making validation automatic  
**Acceptance Criteria**: Documented in CONTRIBUTING.md and README.md

**RR-2: Secrets in Exported Reports**  
**Risk**: Raw export functions don't enforce sanitization  
**Impact**: Credential leakage, compliance violations  
**Mitigation**: Rename unsafe functions, make sanitized export default  
**Acceptance Criteria**: Requires code changes (R-4)

### Medium Residual Risks

**RR-3: Path Traversal in Integrator Code**  
**Risk**: No built-in filename sanitization  
**Impact**: Arbitrary file write, privilege escalation  
**Mitigation**: Provide utility function, add examples  
**Acceptance Criteria**: Requires code changes (R-1)

**RR-4: RPC Header Leakage**  
**Risk**: HTTP headers not redacted in RPC capture  
**Impact**: Credential leakage in artifacts  
**Mitigation**: Add header redaction  
**Acceptance Criteria**: Requires code changes (R-3)

**RR-5: Storage Exhaustion**  
**Risk**: No disk space monitoring  
**Impact**: Denial of service, data loss  
**Mitigation**: Add disk space checks  
**Acceptance Criteria**: Requires code changes (R-5)

### Low Residual Risks

**RR-6: Null Byte Truncation**  
**Risk**: Payloads with null bytes may be misinterpreted  
**Impact**: Incorrect classification, replay mismatch  
**Mitigation**: Document risk, add optional validation  
**Acceptance Criteria**: Documented as known gap

**RR-7: Symlink Attacks**  
**Risk**: No symlink detection during file write  
**Impact**: Arbitrary file overwrite  
**Mitigation**: Use restrictive permissions, add detection  
**Acceptance Criteria**: Documented in security guidance

---

## Testing Strategy

### Unit Tests

**Existing Coverage**:
- ✅ Seed validation (oversized, empty, invalid)
- ✅ Signature hash stability
- ✅ Schema version validation
- ✅ RPC auth redaction
- ✅ Payload sanitization
- ✅ Rust identifier validation
- ✅ Deterministic ordering

**Gaps**:
- ❌ Path traversal attempts
- ❌ Null byte handling
- ❌ Symlink detection
- ❌ Disk space exhaustion
- ❌ Concurrent checkpoint access

### Integration Tests

**Required Tests**:
1. End-to-end fuzzing with malicious seeds
2. Artifact storage with path traversal attempts
3. Export pipeline with secret-containing payloads
4. Multi-worker checkpoint resume
5. RPC capture with sensitive headers
6. Disk full scenario handling

### Fuzzing Tests

**Targets**:
- `load_case_bundle_json` (malformed JSON, schema confusion)
- `import_corpus_json` (oversized corpus, invalid seeds)
- `export_rust_regression_fixture` (code injection attempts)
- `sanitize_payload_fragments` (bypass attempts)

### Security Tests

**Required Tests**:
1. Secret scanning on test fixtures
2. Path traversal prevention
3. Symlink attack prevention
4. Memory exhaustion limits
5. Privilege escalation attempts

---

## Incident Response

### Detection

**Indicators of Compromise**:
- Unexpected files outside artifact directory
- Disk space exhaustion
- Memory exhaustion or OOM kills
- Secrets in exported reports
- Unauthorized RPC usage
- Modified checkpoints or corpus files

**Monitoring**:
- File integrity monitoring on artifact directory
- Disk space alerts (< 10% free)
- Memory usage alerts (> 80%)
- RPC quota monitoring
- Log analysis for path traversal attempts

### Response Procedures

**P1: Credential Leakage**
1. Rotate compromised credentials immediately
2. Audit all exported reports for secrets
3. Remove leaked secrets from Git history
4. Notify affected parties within 24 hours
5. Implement R-9 (CI secret scanning)

**P2: Arbitrary File Write**
1. Isolate affected system
2. Audit filesystem for unauthorized changes
3. Restore from backup if needed
4. Implement R-1 (filename sanitization)
5. Review all integrator code

**P3: Denial of Service**
1. Identify attack source (malicious seeds, storage exhaustion)
2. Implement rate limiting or input filtering
3. Clean up artifacts to free space
4. Implement R-5 (disk space monitoring)
5. Review retention policy

### Post-Incident

1. Root cause analysis within 48 hours
2. Update threat model with new scenarios
3. Implement additional mitigations
4. Update documentation and training
5. Notify users if public disclosure needed

---

## Appendix A: STRIDE Analysis

| Threat | Spoofing | Tampering | Repudiation | Info Disclosure | DoS | Elevation |
|--------|----------|-----------|-------------|-----------------|-----|-----------|
| Malicious Seeds | - | ✅ T-1, T-3 | - | - | ✅ T-2, T-10 | - |
| Artifact Storage | - | ✅ T-7, T-8 | - | ✅ T-6 | ✅ T-10 | ✅ T-7 |
| RPC Communication | - | - | - | ✅ T-5 | - | - |
| Report Export | - | ✅ T-9 | - | ✅ T-6 | - | ✅ T-9 |
| Schema Handling | - | ✅ T-4 | - | - | ✅ T-4 | - |

---

## Appendix B: References

- [OWASP Threat Modeling](https://owasp.org/www-community/Threat_Modeling)
- [Microsoft STRIDE](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats)
- [CWE-22: Path Traversal](https://cwe.mitre.org/data/definitions/22.html)
- [CWE-400: Resource Exhaustion](https://cwe.mitre.org/data/definitions/400.html)
- [CWE-532: Information Exposure Through Log Files](https://cwe.mitre.org/data/definitions/532.html)

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-23 | Security Team | Initial draft |

---

**Next Review Date**: 2026-07-23 (3 months)
