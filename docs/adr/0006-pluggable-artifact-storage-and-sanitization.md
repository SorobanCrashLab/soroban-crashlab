# ADR-0006: Pluggable Artifact Storage and Sanitization

**Status:** Accepted
**Date:** 2026-07-20

## Context
Soroban CrashLab generates physical output files (`CaseBundle` artifacts, replay JSONs, simulation logs). In a local development environment, these are written to the filesystem. In an enterprise or hosted CI environment, these need to be written to cloud object storage (S3, GCS, etc.). Furthermore, since these artifacts contain raw, mutated, adversarial fuzzing payloads, loading them into the web dashboard or re-executing them presents a security risk (e.g., path traversal attacks, XSS, payload injection).

## Decision
We adopted a two-pronged approach:
1. **Trait-Based Abstraction:** The storage layer is abstracted behind the `ArtifactStore` Rust trait (`artifact_storage.rs`), defining standard operations (`store_artifact`, `retrieve_artifact`, `list_artifacts`). We provide a `LocalArtifactStore` by default, but the architecture allows drop-in replacements for cloud providers without changing the core engine or web API logic.
2. **Defense-in-Depth Sanitization:** The `LocalArtifactStore` rigidly enforces deterministic naming conventions (`{artifact_id}.json`) and strictly rejects path traversal sequences (`..`, `/`, `\`). Furthermore, the `fixture_sanitize.rs` module strips potentially dangerous ANSI escape codes from logs and sanitizes payload strings before they are transmitted to the Next.js web application.

## Rationale
- Without an interface abstraction, migrating from a local hobbyist tool to an enterprise SaaS platform would require massive refactoring of the IO layer.
- Fuzzing engines are uniquely susceptible to self-poisoning (where an adversarial payload crafted to crash the smart contract ends up crashing the dashboard UI parsing the payload). Strict sanitization at the storage boundary prevents this.

## Consequences
- **Positive:** Highly extensible storage backend. Safe handling of hostile input data.
- **Negative:** Slightly increased complexity in the storage implementation due to trait boundaries and async requirements.
- **Mitigations:** The local filesystem implementation provides a seamless, zero-config default experience so new users aren't burdened with setting up S3 buckets just to test the tool.

## Compliance & Verification
The `THREAT_MODEL_ARTIFACT_HANDLING.md` document outlines the specific threat models addressed. The `LocalArtifactStore` is accompanied by comprehensive unit tests that attempt to inject path traversal characters into artifact IDs and assert they are explicitly rejected.
