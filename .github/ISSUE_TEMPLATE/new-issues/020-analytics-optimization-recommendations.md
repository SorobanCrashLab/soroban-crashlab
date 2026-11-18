---
name: "Analytics: Resource Optimization Recommendations - AI-Powered Gas/Compute Optimization with Actionable Fixes"
description: "Build an AI-powered analyzer that identifies gas/compute inefficiencies in contracts, provides specific optimization recommendations with estimated savings, and integrates with IDE for inline suggestions"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Developers manually optimize gas. Need:
- Automated analysis: Contract bytecode + fuzzing traces → inefficiency patterns
- Specific recommendations: "Replace storage with transient", "Unroll loop", "Use bitset"
- Estimated savings: Gas reduction %, USD cost projection
- IDE integration: Inline annotations in VS Code / GitHub
- Learning system: Improves from accepted/rejected recommendations

## Current State

- `resource-fee-insight-utils.ts` — Basic gas analysis
- `scval_mutator.rs` — Mutation but not optimization
- No AI/ML, no IDE integration, no savings estimation

## Proposed Solution

**AI-Powered Optimization Advisor** with pattern detection + LLM reasoning:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Optimization Recommendations                           [🤖 AI Analysis]    │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Contract: TokenV2.soroban  |  Campaign: mainnet-fuzz  |  Runs: 50k    │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │  🔴 HIGH: Repeated Storage Reads                                │  │ │
│  │  │  Function: `balance_of` (line 45)                               │  │ │
│  │  │  Pattern: 3x `env.storage().get()` in loop                     │  │ │
│  │  │  Recommendation: Cache in local variable                       │  │ │
│  │  │  Estimated Savings: -1,200 gas/call (-15%) | $0.002/call       │  │ │
│  │  │  Confidence: 94%  |  [Apply Fix] [View in IDE] [Dismiss]       │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │  🟡 MEDIUM: Inefficient Loop                                     │  │ │
│  │  │  Function: `batch_transfer` (line 112)                          │  │ │
│  │  │  Pattern: `for i in 0..len { storage.set(i, ...) }`            │  │ │
│  │  │  Recommendation: Use `vec!` + batch write / SIMD               │  │ │
│  │  │  Estimated Savings: -45,000 gas/tx (-22%) | $0.08/tx           │  │ │
│  │  │  Confidence: 78%  |  [Apply Fix] [View in IDE] [Dismiss]       │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │  🟢 LOW: Unused Debug Events                                     │  │ │
│  │  │  Functions: 3 functions emit debug events in production        │  │ │
│  │  │  Recommendation: Remove or gate behind `cfg(debug_assertions)` │  │ │
│  │  │  Estimated Savings: -800 gas/call | $0.001/call                │  │ │
│  │  │  Confidence: 99%  |  [Apply Fix] [View in IDE] [Dismiss]       │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  [Export Report] [Configure AI] [Feedback: 👍 12 👎 3]                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Requirements

### Functional

- [ ] **Pattern Detection Engine**: 
  - Static: Bytecode analysis (wasm) → known anti-patterns
  - Dynamic: Fuzzing traces (host calls, storage access, compute) → runtime patterns
  - Combined: Correlate static + dynamic for higher confidence
- [ ] **Recommendation Generator**: 
  - Rule-based: 50+ known patterns (storage caching, loop unrolling, bitset, etc.)
  - LLM-enhanced: Natural language explanation + code diff
  - Savings estimation: Gas model + current network fees → USD
- [ ] **IDE Integration**: 
  - VS Code extension: Inline annotations (diagnostic + code action)
  - GitHub PR: Review comments on changed lines
  - Language Server Protocol (LSP) for other editors
- [ ] **Learning System**: 
  - Track accept/reject/dismiss → retrain ranking
  - Per-team preferences (conservative vs aggressive)
  - Feedback API: `POST /api/optimizations/feedback`
- [ ] **Batch Analysis**: Analyze entire campaign → prioritized report
- [ ] **Diff View**: Show before/after code with gas impact per change

### Non-Functional

- [ ] Analysis (10k traces) < 2min
- [ ] Recommendation precision > 80% (accepted / shown)
- [ ] Savings estimation accuracy ±20%
- [ ] VS Code extension: < 100ms latency for inline
- [ ] LLM costs: < $0.01 per recommendation (cache + batch)

## Files to Modify / Create

```
apps/web/src/features/analytics/optimization/
├── OptimizationAdvisor.tsx             # Main dashboard
├── OptimizationAdvisor.test.tsx
├── patterns/
│   ├── PatternDetector.ts              # Static + dynamic patterns
│   ├── StaticAnalyzer.ts               # Wasm bytecode → patterns
│   ├── DynamicAnalyzer.ts              # Traces → runtime patterns
│   ├── PatternCatalog.ts               # 50+ known patterns
│   └── PatternMatcher.ts               # Match + confidence
├── recommendations/
│   ├── RecommendationEngine.ts         # Generate + rank
│   ├── RuleBasedGenerator.ts           # Deterministic rules
│   ├── LLMGenerator.ts                 # LLM-enhanced (OpenAI/Anthropic)
│   ├── SavingsEstimator.ts             # Gas model + fee oracle
│   ├── DiffGenerator.ts                # Before/after code diff
│   └── useRecommendations.ts
├── ide/
│   ├── VSCodeExtension/                # Separate package
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── extension.ts
│   │   │   ├── diagnosticProvider.ts
│   │   │   ├── codeActionProvider.ts
│   │   │   └── hoverProvider.ts
│   │   └── README.md
│   ├── GitHubPRIntegration.ts          # PR review comments
│   └── LSPServer.ts                    # Generic LSP
├── learning/
│   ├── FeedbackCollector.ts            # Accept/reject/dismiss
│   ├── RankingModel.ts                 # Lightweight ML (TF.js or ONNX)
│   ├── PreferenceStore.ts              # Per-team config
│   └── FeedbackAPI.ts
└── hooks/
    ├── useOptimizationAdvisor.ts
    ├── usePatternDetection.ts
    └── useRecommendations.ts
```

**Core** (new):
```
contracts/crashlab-core/src/
├── optimization/
│   ├── pattern_detection.rs            # Static wasm analysis
│   ├── trace_analysis.rs               # Dynamic trace patterns
│   ├── pattern_catalog.rs              # Known patterns
│   ├── gas_model.rs                    # Gas cost model
│   └── recommendation.rs               # Rule-based generator
```

**API** (new):
```
apps/web/src/app/api/optimizations/
├── analyze/route.ts                    # POST contract + traces → recommendations
├── feedback/route.ts                   # POST feedback
├── patterns/route.ts                   # GET pattern catalog
└── savings/route.ts                    # GET fee oracle + estimation
```

## Acceptance Criteria

| Scenario | Target | Test |
|----------|--------|------|
| Analyze campaign (50k runs) | < 2min | Benchmark |
| Recommendation precision | > 80% | A/B test |
| Savings estimation accuracy | ±20% | Validation |
| VS Code inline latency | < 100ms | Perf test |
| LLM cost per recommendation | < $0.01 | Cost tracking |

## PR Guide

- Branch: `issue/020-optimization-recommendations`
- Phase 1: Pattern detection (static + dynamic) + rule-based recommendations
- Phase 2: Savings estimation + diff view + dashboard
- Phase 3: LLM enhancement + learning system
- Phase 4: VS Code extension + GitHub PR integration
- **Dependencies**: `wasmparser` (static analysis), LLM API (configurable), `vscode-languageserver`
- Consider ONNX/TF.js for client-side ranking model
- Update `docs/ARCHITECTURE.md` with optimization architecture

## Related Issues

- Depends on: #006 (comparison for before/after), #019 (perf regression baseline)
- Blocks: #021 (automated PR with fixes)
- Related: `resource-fee-insight-utils.ts`, `scval_mutator.rs` (enhance)

## Contributor Notes

**Start here if:** You have experience with:
- Wasm static analysis (`wasmparser`, `walrus`)
- Dynamic trace analysis (pattern mining)
- Gas cost modeling (EVM/Soroban)
- LLM prompt engineering for code tasks
- VS Code extension development (LSP, diagnostics)

**Key challenges:**
- Pattern catalog: Comprehensive but not noisy
- Dynamic analysis: Trace volume → sampling + streaming
- LLM: Hallucination control (ground in patterns)
- Savings model: Network fee volatility

**Learning resources:**
- Wasm analysis: https://github.com/bytecodealliance/wasm-tools
- Soroban gas: https://developers.stellar.org/docs/smart-contracts/fees
- VS Code diagnostics: https://code.visualstudio.com/api/language-extensions/language-server-extension-guide
- Pattern mining: https://en.wikipedia.org/wiki/Sequential_pattern_mining

**Estimated effort:** 6-8 weeks
**Mentorship available:** Yes