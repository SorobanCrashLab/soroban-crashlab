# ADR-0001: Two-Tier Split Architecture

**Status:** Accepted
**Date:** 2026-07-20

## Context
Soroban CrashLab serves two distinct operational profiles:
1. **Fuzzing Execution (Headless/CI):** Requires memory-safe, high-performance, deterministic execution capable of compiling and running Soroban WASM bytecodes tightly coupled with the Stellar host environment.
2. **Analytics & Triage (Interactive UI):** Requires a highly responsive, visual, and easily composable interface for interacting with vast amounts of run history, crash taxonomies, and analytics data.

Attempting to build both within a single technology stack (e.g., exclusively in Rust via WebAssembly UI, or exclusively in Node.js executing WASM fuzzing) introduces severe compromises in either raw execution performance, safety, or frontend developer velocity.

## Decision
We adopted a strictly decoupled, two-tier architecture:
1. **Fuzzing Engine (`crashlab-core`)**: Built purely in Rust. It generates seeds, manages mutations, and simulates contract executions via the Soroban Host SDK. It exports standardized JSON artifacts (`CaseBundle`).
2. **Web Dashboard (`apps/web`)**: Built in Next.js 16 (React + TypeScript). It consumes the JSON outputs from `crashlab-core` via REST APIs (or local filesystem reads) to populate interactive triage boards and charts.

## Rationale
- **Performance & Safety:** Rust is strictly necessary for direct interoperability with the Stellar/Soroban Host environment and provides the zero-cost abstractions needed to execute millions of fuzz iterations per minute.
- **Frontend Velocity:** Next.js provides an unmatched ecosystem for rapid UI development, charting (Recharts), and styling (Tailwind CSS), significantly lowering the barrier to entry for UI/UX contributors.
- **Integration Flexibility:** Exposing fuzzing outcomes as portable JSON artifacts allows the Rust engine to run seamlessly in headless CI pipelines (e.g., GitHub Actions) without the Web UI, while the Web UI can be deployed separately (e.g., Vercel) and ingest artifacts dynamically.

## Consequences
- **Positive:** Maximum execution performance for fuzzing; frictionless, standard development experience for frontend contributors; high portability of the core fuzzer.
- **Negative:** Dual-stack complexity requires contributors to be familiar with both Rust and TypeScript if implementing full-stack features.
- **Mitigations:** We enforce strict JSON schemas for inter-process communication (IPC) and file artifacts to ensure stable contracts between the two tiers.

## Compliance & Verification
The boundary is enforced by directory structure (`contracts/` vs `apps/web/`). All data exchange is verified by serialization tests in Rust and Zod schema validations in TypeScript.
