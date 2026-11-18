---
name: "Integration: Generic Webhook Framework - Plugin Architecture for Custom Integrations with Transform Pipeline & Testing Harness"
description: "Build an extensible webhook framework allowing users to create custom integrations via plugins with visual transform pipeline, local testing harness, and marketplace sharing"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Current webhook system is hardcoded for specific providers (Slack, PagerDuty, GitHub). Users cannot:
- Add custom webhook endpoints (e.g., custom internal tools, Datadog, Opsgenie, Teams)
- Transform payloads without code changes
- Test webhooks locally before deploying
- Share integration configs with team

## Current State

- `apps/web/src/lib/webhook-manager.ts` — Generic but limited
- `apps/web/src/app/api/webhooks/` — CRUD only
- No plugin system, no transform pipeline, no testing

## Proposed Solution

**Extensible Webhook Plugin Platform** with visual builder and testing:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Custom Integrations                                        [+ New Plugin]   │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Plugin: "Datadog Events"                    │ 🟢 Enabled  │ [Test]      │ │
│  │  Trigger: crash.created, run.completed, dlq.growth                      │ │
│  │  Transform:                                                             │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │ │
│  │  │  INPUT: CrashLab Event                                          │    │ │
│  │  │  ▼                                                              │    │ │
│  │  │  [JQ Filter] .payload | {title: .crash.type, tags: [.campaign]} │    │ │
│  │  │  ▼                                                              │    │ │
│  │  │  [Template] {{.title}} - {{.payload.run_id}}                   │    │ │
│  │  │  ▼                                                              │    │ │
│  │  │  OUTPUT: Datadog Event API                                      │    │ │
│  │  └─────────────────────────────────────────────────────────────────┘    │ │
│  │  Endpoint: https://api.datadoghq.com/api/v1/events                      │ │
│  │  Auth: API Key ({{secrets.DATADOG_API_KEY}})                           │ │
│  │  [Edit] [Clone] [Export JSON] [Share] [Disable]                        │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  🧪 Test Harness                                                        │ │
│  │  Sample Event: [crash.created ▼]  [Load Sample]  [Paste JSON]          │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │ │
│  │  │  RESULT: 202 Accepted                                           │   │ │
│  │  │  Request: POST https://api.datadoghq.com/...                   │   │ │
│  │  │  Body: {"title": "Reentrancy", "tags": ["mainnet-fuzz"], ...}  │   │ │
│  │  │  Latency: 145ms                                                 │   │ │
│  │  └─────────────────────────────────────────────────────────────────┘   │ │
│  │  [Run Test] [Save as Regression Test]                                  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Requirements

### Functional

- [ ] **Plugin Architecture**: `registerWebhookPlugin({ id, name, version, schema, transform, deliver })`
- [ ] **Visual Transform Pipeline**: Node-based editor (JQ, JSONata, Handlebars, custom JS)
- [ ] **Trigger System**: Event types (crash.*, run.*, campaign.*, dlq.*) with filter expressions
- [ ] **Secret Management**: Reference Vault/1Password/Env vars in config (`{{secrets.KEY}}`)
- [ ] **Testing Harness**: Run plugin against sample events, see request/response, save as test case
- [ ] **Regression Tests**: CI runs saved tests on plugin changes
- [ ] **Marketplace**: Community plugins (reviewed, versioned, installable)
- [ ] **Local Development**: `crashlab webhook dev` — hot-reload plugin, proxy to local endpoint
- [ ] **Schema Validation**: JSON Schema for plugin config + transform output

### Non-Functional

- [ ] Plugin sandbox: Web Worker (isolated, no DOM, limited APIs)
- [ ] Transform latency < 10ms per plugin
- [ ] Hot reload < 500ms
- [ ] Marketplace: Security scan (static analysis) on publish
- [ ] Bundle: Core < 30KB, plugins code-split

## Files to Modify / Create

```
apps/web/src/integrations/webhook-framework/
├── framework/
│   ├── PluginRegistry.ts               # Core registry
│   ├── PluginSDK.ts                    # registerWebhookPlugin, useWebhookContext
│   ├── PluginSchema.ts                 # Zod schema for plugin manifest
│   ├── BuiltinPlugins.ts               # Slack, PD, GitHub as plugins
│   └── types.ts                        # PluginManifest, TransformStep, Trigger
├── transform/
│   ├── TransformPipeline.ts            # Execution engine
│   ├── TransformStep.ts                # Base class
│   ├── JQTransform.ts                  # JQ filter (jq-web WASM)
│   ├── JSONataTransform.ts             # JSONata
│   ├── HandlebarsTransform.ts          # Template
│   ├── CustomJSTransform.ts            # Sandboxed JS (Worker)
│   └── PipelineEditor.tsx              # Visual node editor (React Flow)
├── testing/
│   ├── TestHarness.ts                  # Run plugin with sample
│   ├── SampleEvents.ts                 # Built-in samples per trigger
│   ├── TestCaseManager.ts              # Save/load test cases
│   ├── RegressionRunner.ts             # CI integration
│   └── TestHarnessUI.tsx               # Test panel in plugin editor
├── marketplace/
│   ├── MarketplaceClient.ts            # Fetch/install plugins
│   ├── PluginValidator.ts              # Schema + security scan
│   ├── PluginInstaller.ts              # Sandbox + install
│   └── MarketplaceBrowser.tsx
├── dev/
│   ├── DevServer.ts                    # `crashlab webhook dev`
│   ├── HotReloader.ts                  # File watch + reload
│   ├── LocalProxy.ts                   # Forward to local endpoint
│   └── DevCLI.ts                       # CLI commands
└── ui/
    ├── PluginEditor.tsx                # Full editor (config + transform + test)
    ├── PluginList.tsx                  # Installed plugins
    ├── TriggerSelector.tsx             # Event type picker
    └── SecretReference.tsx             # Secret picker UI
```

**CLI** (new):
```
apps/web/src/cli/commands/webhook/
├── dev.ts                              # crashlab webhook dev
├── test.ts                             # crashlab webhook test
├── publish.ts                          # crashlab webhook publish
└── install.ts                          # crashlab webhook install
```

## Acceptance Criteria

| Scenario | Target | Test |
|----------|--------|------|
| Create custom plugin | < 5 min (UI) | UX test |
| Transform execution | < 10ms | Benchmark |
| Test harness run | < 2s | E2E |
| Hot reload | < 500ms | Dev test |
| Marketplace install | < 10s | E2E |
| Plugin sandbox escape | Impossible | Security audit |

## PR Guide

- Branch: `issue/015-webhook-plugin-framework`
- Phase 1: Plugin SDK + registry + transform pipeline (JQ, JSONata)
- Phase 2: Visual editor + testing harness + regression tests
- Phase 3: Marketplace + security scan + sandbox
- Phase 4: Dev CLI + local proxy + built-in plugins migration
- **Dependencies**: `reactflow` (pipeline editor), `jq-web` (WASM), `jsonata`, `handlebars`
- Update `docs/INTEGRATIONS.md` with plugin development guide

## Related Issues

- Depends on: #011 (webhook delivery reliability), #013 (Slack/PD as plugins)
- Blocks: #018 (scheduled custom webhooks)
- Related: `webhook-manager.ts` (refactor to plugin host)

## Contributor Notes

**Start here if:** You have experience with:
- Plugin/extension architectures (VS Code, Figma, Obsidian)
- Visual programming (React Flow, Node-RED, n8n)
- Sandboxed code execution (Web Workers, SES, QuickJS)
- JSON transformation (JQ, JSONata, jq-web WASM)

**Key challenges:**
- Sandbox: Web Worker vs iframe vs SES (Security vs API access)
- Transform pipeline: Type inference between steps
- Hot reload: Worker termination + recreation
- Marketplace security: Static analysis for malicious code

**Learning resources:**
- React Flow: https://reactflow.dev/
- jq-web: https://github.com/itchyny/jq-web
- JSONata: https://jsonata.org/
- VS Code Extension API: https://code.visualstudio.com/api

**Estimated effort:** 5-6 weeks
**Mentorship available:** Yes