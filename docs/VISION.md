# Product Vision

Soroban CrashLab is an adversarial input generation and crash detection framework for Soroban smart contracts on the Stellar network. It fills the gap between manual unit testing and production monitoring by automatically discovering edge cases, converting them into reproducible regression tests, and surfacing them through a triage dashboard.

## Target audience

- **Smart contract developers** running CrashLab in CI or locally to catch bugs before deployment
- **Security auditors** using CrashLab to generate adversarial test suites during reviews
- **Maintainers** operating CrashLab as a continuous fuzzing service across multiple contracts

## Problem statement

Smart contracts handle real assets. A single edge case can lead to loss of funds or unauthorized token minting. Traditional testing is written by the same developer who wrote the code and tends to miss the same assumptions. CrashLab solves this by treating every input as adversarial and automating the discovery-to-regression pipeline.

## 90% done criteria

The project reaches 90% done when all six roadmap milestones (P0–P5) are complete and the following criteria are met:

| Criterion | Evidence |
|-----------|----------|
| Core fuzzing engine generates, mutates, and classifies seeds deterministically | P0 Foundation complete |
| Auth matrix testing catches authorization bugs across all three Soroban auth modes | AuthMatrixRunner integrated and tested |
| Rust backend exports run data that the dashboard can consume | P1 Data bridge complete |
| Dashboard provides run history, failure triage, analytics, and settings | P2 Product UI complete |
| Integrations with Sentry, Prometheus, webhooks, and issue trackers work | P3 Integrations complete |
| Hardening measures (sandbox, timeouts, flaky detection, CLI polish) are in place | P4 Hardening complete |
| Documentation covers setup, contribution, API, env vars, and roadmap | P5 Documentation complete |
| A new contributor can clone, build, and run the full stack in under 20 minutes | Local setup checklist in CONTRIBUTING.md |
| All roadmap issues are closed | Milestone dashboard shows 0 open |

## What 90% done is not

- It is not a feature-complete v1.0 product. New capabilities (e.g. multi-contract campaigns, advanced shrinking, ML-guided mutation) belong in a post-90% backlog.
- It is not a production SLA. 90% done means the foundation is solid and the project is useful, not that it is under 24/7 support.

## Non-goals

- Replacing existing smart contract testing frameworks (e.g. Soroban SDK testutils). CrashLab targets what they miss.
- Supporting non-Soroban runtimes. The runner trait is extensible by design, but first-class support is limited to Soroban on Stellar.
- Providing a hosted SaaS. Deployment is self-hosted via Docker and Vercel.

## How to use this document

- **Contributors** use the criteria above to understand whether a change pushes toward or away from 90%.
- **Maintainers** reference the criteria during release planning and roadmap prioritization.
- **Evaluators** use the evidence column to verify progress without requiring deep code familiarity.

For the detailed milestone breakdown see [`ROADMAP.md`](ROADMAP.md).
