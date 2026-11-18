---
name: "Analytics: Crash Signature Intelligence - ML-Powered Clustering, Novelty Detection & Root Cause Classification"
description: "Build an ML-powered crash analysis system that clusters crashes by root cause, detects novel crash types, classifies exploitability, and provides actionable triage guidance"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Crash triage is manual. Need:
- Automatic clustering: Group crashes by root cause (not just signature hash)
- Novelty detection: Flag truly new crash types vs. variations
- Exploitability classification: Benign vs. exploitable (reentrancy, overflow, access control)
- Triage guidance: "This looks like reentrancy → check external calls before state changes"
- Learning from triage decisions → improves over time

## Current State

- `failure_clustering.ts` — Basic clustering (signature hash)
- `failure_fingerprint.ts` — Fingerprinting
- `signature_hash.rs` — Hash-based signatures
- No ML, no novelty detection, no exploitability classification

## Proposed Solution

**Crash Intelligence Platform** with ML clustering + security classification:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Crash Intelligence                                    [🧠 ML Analysis]     │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  CLUSTERS (Auto-discovered)                                             │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │  🔴 CLUSTER-001: Reentrancy (47 crashes, 12 signatures)          │  │ │
│  │  │  Root Cause: External call before state update                    │  │ │
│  │  │  Exploitability: CRITICAL — Funds drainable                       │  │ │
│  │  │  Triage: "Add reentrancy guard / use checks-effects-interactions" │  │ │
│  │  │  Samples: run_abc@0:12, run_def@0:45, run_ghi@1:23              │  │ │
│  │  │  [View All] [Export] [Mark Benign] [Create Rule]                 │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │  🟡 CLUSTER-042: Integer Overflow (23 crashes, 8 signatures)     │  │ │
│  │  │  Root Cause: Unchecked arithmetic in `mint` function              │  │ │
│  │  │  Exploitability: HIGH — Supply manipulation                       │  │ │
│  │  │  Triage: "Use `checked_add` / `saturating_add`"                  │  │ │
│  │  │  [View All] [Export] [Create Rule]                               │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │  🟢 CLUSTER-107: Assertion Failure (156 crashes, 3 signatures)   │  │ │
│  │  │  Root Cause: Invariant violation in `withdraw`                    │  │ │
│  │  │  Exploitability: LOW — Denial of service only                    │  │ │
│  │  │  Triage: "Review invariant logic / add proper error handling"    │  │ │
│  │  │  [View All] [Mark Benign]                                        │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  NOVELTY DETECTION                                                      │ │
│  │  🆕 NEW: CLUSTER-203 (first seen 2h ago) — "Storage collision in map"  │ │
│  │  Similarity to known: 0.23 (threshold: 0.7)                            │ │
│  │  [Investigate] [Add to Training] [False Positive]                      │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Requirements

### Functional

- [ ] **ML Clustering**: 
  - Embedding: Crash traces → vector (CodeBERT / custom encoder)
  - Clustering: HDBSCAN / OPTICS (density-based, no K required)
  - Incremental: New crashes → assign to cluster or create new
- [ ] **Novelty Detection**: 
  - Autoencoder / Isolation Forest on embeddings
  - Threshold: Configurable (default 0.7 cosine similarity)
  - Alert on novel clusters (Slack, PD, webhook)
- [ ] **Exploitability Classification**: 
  - Multi-label: Reentrancy, Overflow, AccessControl, DoS, LogicError, InfoLeak
  - Training data: Labeled crashes (historical triage + public vulns)
  - Confidence scores + explanation (SHAP values)
- [ ] **Root Cause Analysis**: 
  - Trace pattern mining: Host call sequences, storage access patterns
  - Map to CWE/SWC categories
  - Generate remediation guidance
- [ ] **Triage Integration**: 
  - Inline in crash detail: Cluster badge, exploitability, guidance
  - Bulk actions: "Mark cluster benign", "Create suppression rule"
  - Feedback loop: Triage decisions → retrain
- [ ] **Cluster Management**: 
  - Merge/split clusters manually
  - Naming: Auto (top pattern) + manual override
  - Export: Cluster report (Markdown/PDF)

### Non-Functional

- [ ] Clustering (10k crashes) < 30s (incremental < 1s)
- [ ] Novelty detection < 100ms per crash
- [ ] Classification accuracy > 90% (on labeled test set)
- [ ] Model updates: Daily batch retrain
- [ ] Explainability: SHAP values for each classification

## Files to Modify / Create

```
apps/web/src/features/analytics/crash-intelligence/
├── CrashIntelligenceDashboard.tsx      # Main UI
├── CrashIntelligenceDashboard.test.tsx
├── ml/
│   ├── EmbeddingModel.ts               # Trace → vector (ONNX/TF.js)
│   ├── ClusteringEngine.ts             # HDBSCAN/OPTICS (WASM)
│   ├── NoveltyDetector.ts              # Autoencoder/IsolationForest
│   ├── ExploitabilityClassifier.ts     # Multi-label classifier
│   ├── RootCauseAnalyzer.ts            # Pattern mining → CWE
│   ├── ModelManager.ts                 # Load/update ONNX models
│   └── TrainingPipeline.ts             # Daily retrain (batch job)
├── clustering/
│   ├── ClusterManager.ts               # CRUD + merge/split
│   ├── ClusterAssigner.ts              # New crash → cluster
│   ├── ClusterNaming.ts                # Auto-generate names
│   └── ClusterExport.ts                # Reports
├── triage/
│   ├── TriageGuidance.ts               # Generate recommendations
│   ├── SuppressionRules.ts             # Auto-suppress known benign
│   ├── FeedbackCollector.ts            # Triage decisions → training
│   └── BulkActions.ts                  # Mark benign, create rule
├── ui/
│   ├── ClusterCard.tsx                 # Cluster summary
│   ├── ClusterDetail.tsx               # Crashes, guidance, samples
│   ├── NoveltyAlert.tsx                # New cluster notification
│   ├── ExploitabilityBadge.tsx         # Color-coded badge
│   └── GuidancePanel.tsx               # Triage recommendations
└── hooks/
    ├── useCrashIntelligence.ts
    ├── useClustering.ts
    └── useNoveltyDetection.ts
```

**Core** (new ML modules):
```
contracts/crashlab-core/src/
├── crash_intelligence/
│   ├── embeddings.rs                   # Trace encoder (or WASM)
│   ├── clustering.rs                   # HDBSCAN (port or WASM)
│   ├── novelty.rs                      # Isolation Forest
│   ├── classification.rs               # Exploitability classifier
│   ├── root_cause.rs                   # Pattern mining
│   └── training.rs                     # Batch training pipeline
```

**Training Infrastructure** (new):
```
ml-training/
├── Dockerfile
├── requirements.txt
├── train_embeddings.py                 # CodeBERT fine-tune
├── train_classifier.py                 # Exploitability
├── train_novelty.py                    # Autoencoder
├── data/
│   ├── labeled_crashes.jsonl           # Historical triage
│   └── public_vulns.jsonl              # SWC registry
└── export_onnx.py                      # PyTorch → ONNX
```

## Acceptance Criteria

| Scenario | Target | Test |
|----------|--------|------|
| Cluster 10k crashes | < 30s | Benchmark |
| Novelty detection | < 100ms/crash | Benchmark |
| Classification accuracy | > 90% F1 | Test set |
| Incremental assign | < 1s | Benchmark |
| Triage guidance relevance | > 80% accepted | A/B test |

## PR Guide

- Branch: `issue/021-crash-signature-intelligence`
- Phase 1: Embeddings + clustering + novelty (Core + Web)
- Phase 2: Exploitability classification + root cause analysis
- Phase 3: Triage integration + guidance + feedback loop
- Phase 4: Training pipeline + model management + UI
- **Dependencies**: `onnxruntime-web` / `@xenova/transformers`, `hdbscan` (WASM), `scikit-learn` (training)
- Consider WASM for all ML (shared Core/Web)
- Update `docs/ARCHITECTURE.md` with crash intelligence architecture

## Related Issues

- Depends on: #006 (comparison for cluster samples), #018 (regression detection)
- Blocks: #022 (automated triage rules)
- Related: `failure_clustering.ts`, `failure_fingerprint.ts`, `signature_hash.rs` (enhance)

## Contributor Notes

**Start here if:** You have experience with:
- ML for code (CodeBERT, GraphCodeBERT, custom encoders)
- Density-based clustering (HDBSCAN, OPTICS)
- Anomaly detection (Isolation Forest, Autoencoders)
- Multi-label classification
- ONNX/WASM for browser ML
- SHAP explainability

**Key challenges:**
- Embeddings: Trace → vector (sequential, variable length)
- Clustering: No ground truth K, density-based better
- Novelty: Threshold tuning (precision vs recall)
- Labels: Sparse → semi-supervised / active learning
- WASM ML: Model size vs. accuracy

**Learning resources:**
- CodeBERT: https://github.com/microsoft/CodeBERT
- HDBSCAN: https://hdbscan.readthedocs.io/
- ONNX Runtime Web: https://github.com/microsoft/onnxruntime-web
- SWC Registry: https://swcregistry.io/

**Estimated effort:** 8-10 weeks
**Mentorship available:** Yes — ML engineer on team