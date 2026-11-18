---
name: "Integration: OpenTelemetry Distributed Tracing - End-to-End Observability from CLI to Core to Web"
description: "Implement OpenTelemetry tracing across the entire stack: CLI commands, Rust core, Next.js API, database, Redis, and external calls with unified trace context propagation"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Current observability (`apps/web/src/lib/observability/`) has structured logging but no distributed tracing:
- No trace context propagation (CLI → API → Core → DB)
- No span attributes for fuzzing operations (campaign, run, seed)
- No integration with external tracers (Jaeger, Zipkin, Datadog, Honeycomb)
- No automatic instrumentation (Next.js, Prisma, Redis, HTTP)
- No trace-based debugging (find slow runs, failed replays)

## Current State

- `apps/web/src/lib/structured-logger.ts` — JSON logs
- `apps/web/src/lib/observability/` — Empty directory
- No OpenTelemetry SDK, no propagators, no exporters

## Proposed Solution

**Full-Stack OpenTelemetry Implementation** with zero-code instrumentation where possible:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Trace: fuzz-campaign-mainnet-2024-01-15                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  ████████████████████████████████████████████████████████████████████  │ │
│  │  │cli:fuzz start                    │  12ms  │  campaign=mainnet       │ │
│  │  │  └─▶ api:POST /campaigns         │  45ms  │  campaignId=cmp_abc    │ │
│  │  │     └─▶ db:INSERT campaigns      │  12ms  │                           │ │
│  │  │     └─▶ redis:SET campaign:lock  │  3ms   │                           │ │
│  │  │  └─▶ core:run_campaign           │  2.3s  │  seeds=10000            │ │
│  │  │     ├─▶ core:mutate_seed         │  1.8s  │  mutator=havoc (x5000)  │ │
│  │  │     ├─▶ core:execute_seed        │  450ms │  vm=cranelift           │ │
│  │  │     │  └─▶ wasm:instantiate      │  120ms │  module=contract.wasm   │ │
│  │  │     │  └─▶ host:call             │  330ms │  150 calls              │ │
│  │  │     └─▶ core:store_artifact      │  89ms  │  crashes=3              │ │
│  │  │        └─▶ s3:PUT crash_bundle   │  67ms  │  size=2.3MB             │ │
│  │  └─▶ api:GET /runs/run_xyz         │  23ms  │                           │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  [Service Map]  [Latency Heatmap]  [Error Rate]  [Export to Jaeger/Datadog]  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Requirements

### Functional

- [ ] **Trace Context Propagation**: W3C TraceContext + Baggage headers everywhere
- [ ] **CLI Instrumentation**: `cargo-fuzz` / CLI commands auto-create root span
- [ ] **Rust Core Instrumentation**: `opentelemetry` + `opentelemetry-semantic-conventions` crate
- [ ] **Next.js Auto-Instrumentation**: `@opentelemetry/auto-instrumentations-node` (HTTP, Prisma, Redis, DNS)
- [ ] **Custom Spans**: Fuzzing operations (mutate, execute, store) with semantic attributes
- [ ] **Semantic Attributes**: `campaign.id`, `run.id`, `seed.id`, `mutator.name`, `vm.type`, `artifact.size`
- [ ] **Exporters**: OTLP (gRPC/HTTP) → Jaeger, Zipkin, Datadog, Honeycomb, Grafempo Tempo
- [ ] **Sampling**: Tail-based (always sample errors), head-based (10% default), parent-based
- [ ] **Trace UI Integration**: Link from run detail → trace viewer (deep link to Jaeger/Datadog)

### Non-Functional

- [ ] Overhead < 3% CPU, < 5% memory (with sampling)
- [ ] Zero-code instrumentation for Next.js, Prisma, Redis, HTTP
- [ ] Rust core: Optional feature flag (`tracing` feature)
- [ ] Context propagation: Works across process boundaries (CLI → API → Core)
- [ ] Baggage: `campaign-id`, `run-id` propagated for correlation

## Files to Modify / Create

```
apps/web/src/lib/observability/
├── tracing/
│   ├── OtelSetup.ts                    # SDK initialization (Node)
│   ├── AutoInstrumentation.ts          # Register auto-instrumentations
│   ├── CustomSpans.ts                  # Helper for custom spans
│   ├── SemanticAttributes.ts           # Attribute keys + validators
│   ├── SamplingConfig.ts               # Sampler configuration
│   ├── ExporterConfig.ts               # OTLP + vendor exporters
│   └── ContextPropagation.ts           # W3C + Baggage helpers
├── rust/
│   ├── Cargo.toml                      # opentelemetry, opentelemetry-otlp, tracing-opentelemetry
│   ├── src/
│   │   ├── otel.rs                     # Rust SDK setup
│   │   ├── spans.rs                    # Custom span macros
│   │   ├── attributes.rs               # Semantic attributes
│   │   └── propagation.rs              # Context extraction/injection
│   └── build.rs                        # Feature gate
└── cli/
    ├── CliTracing.ts                   # CLI command wrapper
    └── TraceExporter.ts                # Stdout/OTLP for CLI

apps/web/src/app/api/
├── middleware.ts                       # Add trace headers to all responses
└── trace-test/route.ts                 # Debug endpoint

contracts/crashlab-core/
├── Cargo.toml                          # Add tracing, opentelemetry features
└── src/
    ├── telemetry.rs                    # Module
    ├── spans.rs                        # #[traced] macro
    └── attributes.rs                   # Semantic conventions
```

**Configuration** (new):
```
apps/web/otel-config.toml               # Exporter, sampling, resource
contracts/crashlab-core/otel-config.toml
```

## Acceptance Criteria

| Scenario | Target | Test |
|----------|--------|------|
| Trace CLI → API → Core | Context propagated | Integration |
| Auto-instrument Next.js | All routes traced | E2E |
| Rust core spans | Custom attributes present | Unit |
| Sampling (10%) | ~10% traces exported | Stats |
| Tail sampling errors | 100% error traces | Chaos test |
| Jaeger UI deep link | Opens correct trace | Manual |

## PR Guide

- Branch: `issue/014-opentelemetry-distributed-tracing`
- Phase 1: Node SDK + auto-instrumentation + OTLP exporter
- Phase 2: Custom spans + semantic attributes + sampling
- Phase 3: Rust core instrumentation + context propagation
- Phase 4: CLI integration + trace UI links + vendor configs
- **Dependencies**: `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/exporter-trace-otlp-grpc`, `opentelemetry` (Rust)
- Update `docs/ARCHITECTURE.md` with observability architecture

## Related Issues

- Depends on: None (foundational)
- Blocks: #018 (trace-based alerting), #019 (performance regression detection)
- Related: `apps/web/src/lib/observability/` (implement)

## Contributor Notes

**Start here if:** You have experience with:
- OpenTelemetry (JS and Rust SDKs)
- Distributed tracing concepts (spans, context, baggage, sampling)
- Semantic conventions (https://github.com/open-telemetry/opentelemetry-specification)
- Auto-instrumentation internals

**Key challenges:**
- Next.js 13+ App Router: Instrumentation hook placement
- Rust feature flags: Optional dependency, no overhead when disabled
- Context propagation: HTTP headers → gRPC → CLI env vars
- Sampling: Tail-based requires span processor with decision logic

**Learning resources:**
- OpenTelemetry JS: https://github.com/open-telemetry/opentelemetry-js
- OpenTelemetry Rust: https://github.com/open-telemetry/opentelemetry-rust
- Semantic conventions: https://github.com/open-telemetry/opentelemetry-specification/tree/main/semantic_conventions
- Next.js instrumentation: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

**Estimated effort:** 4-5 weeks
**Mentorship available:** Yes