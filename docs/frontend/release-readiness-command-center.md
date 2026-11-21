# Release Readiness & Ops Command Center

The **Release Readiness & Ops Command Center** (`/releases` and `/releases/[id]`) unifies go/no-go gates, risk scorecards, canary rollout guardrails, and role-based approvals into an auditable decision surface.

## Architecture

- **Gate Matrix (`GateMatrix.tsx`)**: Evaluates required and optional release gates with time-bound waivers.
- **Risk Scorecards (`RiskScorecards.tsx`)**: Aggregates CI health, regressions, flake/stability, security, and data quality.
- **Rollout Tracker (`RolloutTracker.tsx`)**: Monitors staging/canary/production phases with one-click rollback triggers.
- **Approval Workflow (`ApprovalWorkflow.tsx`)**: Captures role-based sign-offs and immutable decision timestamps.
