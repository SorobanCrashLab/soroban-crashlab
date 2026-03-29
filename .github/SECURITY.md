# Security Policy

## Supported Versions

Only the latest commit on `main` is actively maintained. There are no versioned releases at this time.

| Branch | Supported |
|--------|-----------|
| `main` | ✅ Yes    |
| older  | ❌ No     |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

To report a vulnerability, please use one of the following private channels:

- **GitHub private vulnerability reporting**: Use the [Security tab → "Report a vulnerability"](../../security/advisories/new) button in this repository. This is the preferred path.
- **Email**: If GitHub private reporting is unavailable, email the maintainers directly. Contact details are listed in [`FUNDING.json`](../FUNDING.json) or the repository profile.

### What to include

A useful report includes:

- A clear description of the vulnerability and its potential impact
- Steps to reproduce or a minimal proof-of-concept
- Affected component(s) (e.g., `crashlab-core`, `apps/web`, CI scripts)
- Any suggested mitigations or patches, if available

### Response expectations

| Step | Target timeline |
|------|----------------|
| Acknowledgement of report | 48 hours |
| Initial triage and severity assessment | 5 business days |
| Fix or mitigation plan communicated to reporter | 14 days |
| Public disclosure (coordinated with reporter) | 90 days from report, or sooner if fix is ready |

We follow a **coordinated disclosure** model. We ask reporters to keep details private until a fix is available or the 90-day window closes, whichever comes first. We will credit reporters in the advisory unless they prefer to remain anonymous.

## Scope

This policy covers:

- `contracts/crashlab-core` — Rust fuzzing and reproducibility crate
- `apps/web` — Next.js frontend dashboard
- CI/CD configuration under `.github/workflows`
- Scripts under `scripts/`

Out of scope: third-party dependencies (report those upstream), and issues that require physical access to infrastructure.

## Known Gaps and Accepted Risks

See the [Operational Security Assumptions](../MAINTAINER_WAVE_PLAYBOOK.md#operational-security-assumptions) section of the Maintainer Wave Playbook for a documented list of known gaps and accepted residual risks.
