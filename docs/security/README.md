# Security documentation

| Document | What it covers |
|---|---|
| [Threat model v2](threat-model-v2.md) | Assets, trust boundaries, attacker profiles, entry points, abuse cases with mitigations and test/issue traceability, STRIDE, non-goals |
| [Artifact handling threat model (v1)](../THREAT_MODEL_ARTIFACT_HANDLING.md) | Detailed artifact-handling threats T-1…T-11 and their tests |
| [Security guide](../SECURITY.md) | Severity classification and the contributor security model |
| [Security policy](../../.github/SECURITY.md) | How to report a vulnerability |

Traceability check: `node scripts/check-threat-model.mjs` (CI: `.github/workflows/threat-model.yml`).
