# Frontend: Plugin & Extension Runtime (#2322)

## Overview

Secure sandboxed UI extensions for the CrashLab frontend, enabling custom
workflows and visualizations without compromising core security.

## Architecture

### Extension Manifest
- Schema: metadata, entrypoints, slots, capabilities, permissions, config
- Capability-based model: UI slots, data scopes, actions, network access
- Versioning/compatibility checks against app API version

### Sandboxed Runtime
- iframe/module sandbox with strict CSP and message bridge
- Typed host bridge APIs: read-only data queries, gated actions
- No direct DOM/storage/token access outside granted capabilities
- Resource limits: CPU, memory, network, timeout enforcement per extension

### Extension Points
- Dashboard widgets
- Run detail tabs
- Command palette actions
- Inspectors

### Registry & Governance
- Browse, install, configure, enable/disable, update, remove
- Health status and crash isolation (disable-on-failure)
- Audit logging for installs, config, permission grants, and actions

---

# Frontend: Dependency & Impact Graph Explorer (#2319)

## Overview

Multi-layer graph visualizing contract/service/config relationships and
blast-radius for failures and changes.

## Features
- Graph ingestion from runs, traces, manifests, deploy metadata, configs
- Impact analysis: upstream/downstream traversal, blast-radius scoring
- Temporal overlays: health evolution, snapshot diffing
- Node/edge detail panels with evidence links
- Permission-aware redaction of sensitive metadata
- Scales to 50k+ nodes with level-of-detail rendering

---

# Frontend: Semantic Search & Evidence Assistant (#2320)

## Overview

Hybrid keyword + semantic/vector retrieval across runs, crashes, traces,
logs, issues, runbooks, and docs.

## Features
- Unified search with scope selectors and faceted filters
- Citation-first assistant: grounded summaries, inline citations
- "Find similar" from crash/trace/log context
- Strict guardrails: read-only by default, permission-filtered retrieval
- Saved searches, shareable links, relevance feedback

---

# Frontend: Adaptive Dashboard Layout Engine (#2321)

## Overview

Grid-based drag/resize layout with widget composition and personalized
workspaces for different personas (maintainer, triager, operator, security).

## Features
- Drag-drop/resize grid with responsive breakpoints and density modes
- Widget catalog: runs, clusters, coverage, CI gates, incidents, costs
- Cross-widget state sync: global time range, filters, selection broadcast
- Saved personal/team dashboards with versioning and share links
- Role-aware starter templates and presets
- Accessible keyboard/form-based layout editor alternatives
- Resilient: isolated error boundaries per widget
