# Security Policy and Vulnerability Disclosure

For the authoritative reporting instructions, see [`.github/SECURITY.md`](../.github/SECURITY.md).

This document provides developer-facing context: severity classification, safe handling of fuzz artifacts, and the security model contributors are expected to uphold.

---

## Supported Versions

Only the latest commit on `main` is actively maintained. There are no versioned releases at this time.

| Branch | Supported |
|--------|-----------|
| `main` | ✅ Yes    |
| older  | ❌ No     |

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Use one of the private channels below:

- **GitHub private vulnerability reporting** (preferred): [Security tab → "Report a vulnerability"](../../security/advisories/new)
- **Email**: Contact details are in [`FUNDING.json`](../FUNDING.json) or the repository profile.

### What to include

- Description of the vulnerability and potential impact
- Steps to reproduce or a minimal proof-of-concept
- Affected component (`crashlab-core`, `apps/web`, CI scripts, etc.)
- Suggested mitigations or patch, if available

### Response timeline

| Step | Target |
|------|--------|
| Acknowledgement | 48 hours |
| Initial triage and severity | 5 business days |
| Fix or mitigation plan to reporter | 14 days |
| Public disclosure (coordinated) | 90 days from report |

We follow **coordinated disclosure**. Reporters are credited in the advisory unless they prefer anonymity.

---

## Severity Classification

| Severity | Criteria | Examples |
|----------|----------|---------|
| **Critical** | Remote code execution, arbitrary contract execution, private key exposure | Fuzz payload escaping sandbox, auth bypass allowing unauthorized minting |
| **High** | Privilege escalation, data exfiltration, denial of service against production | Artifact path traversal, dashboard API auth bypass |
| **Medium** | Information disclosure, unintended state mutation, crash without exploit | Secret leakage in logs, non-deterministic replay producing wrong results |
| **Low** | Minor information leakage, hardening gaps, configuration weaknesses | Verbose error messages, missing rate limiting on non-critical endpoints |

---

## Scope

In scope:

- `contracts/crashlab-core` — Rust fuzzing and reproducibility crate
- `apps/web` — Next.js frontend dashboard and API routes
- `.github/workflows` — CI/CD pipeline configuration
- `scripts/` — Build and automation scripts

Out of scope:

- Vulnerabilities in third-party dependencies (report those upstream)
- Issues requiring physical infrastructure access
- Testnet-only issues with no mainnet impact path

---

## Security Model for Contributors

### Fuzz input is adversarial by design

All inputs flowing through the fuzzing engine are treated as fully adversarial. Do not add code paths that assume fuzz payloads are well-formed or safe.

- Payload length is validated against configurable bounds before processing.
- Artifact file names are derived from FNV-1a signature hashes — never from raw user input.
- Failure payloads are sanitized before any public export or sharing.

### Auth testing surface

The auth matrix runner executes seeds under all three Soroban auth modes. Any change that narrows this matrix — or that short-circuits auth checks for performance — must be reviewed for security impact before merging.

### Secret handling

- Never log or export raw environment variables, RPC keys, or contract signing keys.
- Environment fingerprint records include OS, CPU architecture, and tool versions only — not credentials.
- The `NEXT_PUBLIC_` prefix exposes values to the browser. Treat anything with that prefix as public.

### Dependency updates

Dependency bumps that fix a CVE are fast-tracked but still require:

1. A linked advisory or CVE reference in the PR description.
2. CI passing with the new version.
3. Review by one unconflicted maintainer.

See [CONTRIBUTING.md — Dependency updates](../CONTRIBUTING.md#dependency-updates) for the full checklist.

### Pre-commit secret scanning

Before committing, scan for accidentally included secrets:

```bash
# Using trufflehog (if available)
trufflehog filesystem . --only-verified

# Or a simple grep for common patterns
grep -rn "PRIVATE_KEY\|SECRET_KEY\|API_KEY\|password" --include="*.env*" --include="*.json" .
```

CI will reject commits containing detected secrets. See `.github/SECURITY.md` for the pre-commit expectations.

---

## Conflict of Interest

When a maintainer has a personal, employment, financial, sponsor, or close-collaboration relationship with a security report or fix, they must recuse before making assignment, severity, review, merge, disclosure, or credit decisions.

Full control path: [`.github/SECURITY.md — Maintainer Conflicts of Interest`](../.github/SECURITY.md#maintainer-conflicts-of-interest).

---

## Known Gaps and Accepted Risks

See the [Operational Security Assumptions](../MAINTAINER_WAVE_PLAYBOOK.md#operational-security-assumptions) section of the Maintainer Wave Playbook.

---

## Response Header Hardening

The dashboard (both Vercel and self-hosted Docker deployments) ships the following
security headers. They are defined in `vercel.json` (root and `apps/web/vercel.json`)
and in `apps/web/next.config.ts` so both deployment paths behave identically.

| Header | Value | Rationale |
|--------|-------|-----------|
| `X-Content-Type-Options` | `nosniff` | Prevents browsers from MIME-sniffing responses away from the declared `Content-Type`, reducing drive-by download risks. |
| `X-Frame-Options` | `SAMEORIGIN` | Legacy clickjacking protection for older clients that do not understand CSP `frame-ancestors`. |
| `Content-Security-Policy` | `… frame-ancestors 'self' …` | Modern clickjacking defense; `frame-ancestors 'self'` allows embedding only by same-origin pages. |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Enforces HTTPS for 2 years (63072000 s) across all subdomains and opts into browser preload lists, eliminating SSL-stripping downgrades on repeat visits. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Sends full URL on same-origin navigations, origin only on cross-origin, and nothing on downgrade (HTTPS→HTTP), preventing run IDs and filter state from leaking to third parties. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | Explicitly disables powerful browser features the dashboard never uses, shrinking the attack surface for compromised subresources. |
| `X-XSS-Protection` | **removed** | Deprecated; ignored by all modern browsers. Its presence misleads security reviewers into thinking XSS protection exists. Rely on CSP instead. |

Headers are snapshot-tested in `apps/web/src/app/security-headers.test.ts` to prevent regressions.

---

## Related Documents

| Document | Purpose |
|----------|---------|
| [`.github/SECURITY.md`](../.github/SECURITY.md) | Authoritative reporting policy and disclosure timelines |
| [`docs/THREAT_MODEL_ARTIFACT_HANDLING.md`](THREAT_MODEL_ARTIFACT_HANDLING.md) | STRIDE threat model for artifact ingestion and storage |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | Contributor security checklist and PR guidelines |
| [`MAINTAINER_WAVE_PLAYBOOK.md`](../MAINTAINER_WAVE_PLAYBOOK.md) | Operational security assumptions and known gaps |
