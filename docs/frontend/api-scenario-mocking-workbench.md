# API & Scenario Mocking Simulation Workbench

The **Scenario Mocking Workbench** (`/dev/mock-scenarios`) provides deterministic frontend development and QA against virtualized REST, SSE, and Soroban RPC backends.

## Key Capabilities

- **Scenario Runtime (`apps/web/src/lib/mocks/scenario-runtime.ts`)**: Deterministic PRNG-backed latency/fault injection, wildcard path matching, rule conflict detection, and production safety guardrails (`isMockRuntimeAllowed`).
- **Rule & Stream Editors**: Author REST/RPC response templates, SSE event sequences, and fault injection (timeouts, 5xx, rate limits, partial data).
- **Record & Redact**: Sanitize captured payloads with automatic sensitive-key redaction before saving reusable fixtures.
- **Contract Validation**: Validate mock payloads against JSON/OpenAPI/TypeScript contracts.
