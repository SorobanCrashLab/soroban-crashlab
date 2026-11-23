# Resource & Budget Flamechart Profiler — #2297

- Branch: `issue/076-frontend-resource-budget-profiler`
- Status: Phase 1 scaffold — metric normalization + flamechart/timeline base views.
- Closes #2297 (phases 2–4 as listed in the issue.)

Scope (from the issue): flamechart/icicle + timeline views aligned to trace
spans/phases; multi-metric overlays (budget, CPU, memory, ledger I/O) with
threshold markers; hotspot ranking by contract/function/host call; A/B
comparison mode with deltas (#019/#067); export/share and permission-aware
handling; performance scaling and a11y for large profiles.
