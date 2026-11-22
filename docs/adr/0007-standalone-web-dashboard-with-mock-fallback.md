# ADR-0007: Standalone Web Dashboard with Mock Fallback

**Status:** Accepted
**Date:** 2026-07-20

## Context
The Soroban CrashLab web dashboard (`apps/web`) is a complex Next.js application with 37+ pages encompassing analytics, run comparisons, and triage boards. 
Frontend engineers contributing to the project, or users wishing to evaluate the UI, should not be forced to install the Rust toolchain, compile Soroban smart contracts, and run local Stellar networks just to see data render on the screen.

## Decision
We architected the entire Next.js dashboard with a "Standalone First" philosophy. 
All data-fetching hooks, API routes, and UI components are wired to gracefully fall back to comprehensive, in-memory mock datasets (`mockRuns.ts`, `fixtures/`) if the Rust `crashlab-core` backend or actual artifact storage is unreachable.

## Rationale
- Greatly lowers the barrier to entry for open-source frontend contributions.
- Allows the UI/UX design iteration loop to proceed entirely independently of the backend Rust engine's development cycle.
- Provides an immediate "wow factor" during user onboarding: cloning the repo and running `npm run dev` yields a fully populated, interactive dashboard instantly.

## Consequences
- **Positive:** Exceptional developer experience for UI work. Fast evaluation for new users.
- **Negative:** Maintaining the parity between the mock data schema and the actual Rust-generated JSON schemas (`CaseBundle`) requires vigilance. If they drift, the UI might work in mock mode but break in production.
- **Mitigations:** We enforce strict TypeScript types (`src/app/types.ts`) that mirror the Rust structs. Both the mock data and the real API responses must satisfy these types.

## Compliance & Verification
Automated UI tests (Playwright in `apps/web/e2e`) explicitly run against the mock data mode to ensure all 37 routes render without crashing and properly handle the fallback state.
