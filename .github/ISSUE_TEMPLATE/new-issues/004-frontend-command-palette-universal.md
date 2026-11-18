---
name: "Frontend: Command Palette - Universal Action Search with Fuzzy Matching, Keyboard Shortcuts & Extensible Plugin API"
description: "Replace ad-hoc keyboard shortcuts with a centralized, extensible command palette (⌘K) supporting fuzzy search, nested commands, context-aware suggestions, and plugin architecture"
labels: ["wave4", "complexity:high", "area:web", "type:feature"]
---

## Problem Statement

Keyboard navigation is fragmented across the app:
- `apps/web/src/app/command-palette-*.ts` — basic static entries only
- No fuzzy search (exact match only)
- No nested/hierarchical commands
- No context awareness (shows irrelevant commands)
- No plugin system for features to register commands
- Shortcuts undocumented, undiscoverable, conflicting

## Current State

- `CommandPalette.tsx` — basic implementation
- `command-palette-static-entries.ts` — hardcoded list
- `command-palette-runs-provider.ts` — runs-only dynamic entries
- No unified registry, no scoring, no extensibility

## Proposed Solution

**Universal Command Palette** with:

```
┌─────────────────────────────────────────────────────────────┐
│  ⌘K  Command Palette                                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  > run:compare _                    ▼                  │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │  🔍 Runs                                                  │  │
│  │  ▸ run:compare          Compare two runs…        ⌘⇧C  │  │
│  │  ▸ run:open             Open run…                ⌘O   │  │
│  │  ▸ run:replay           Replay run…              ⌘R   │  │
│  │  ▸ run:export           Export run CSV…          ⌘E   │  │
│  │                                                         │  │
│  │  🏷️  Triage                                               │  │
│  │  ▸ triage:tag           Add tag…                 ⌘T   │  │
│  │  ▸ triage:note          Add note…                ⌘N   │  │
│  │  ▸ triage:link-issue    Link GitHub issue…       ⌘L   │  │
│  │                                                         │  │
│  │  ⚙️  Settings                                             │  │
│  │  ▸ settings:theme       Toggle theme             ⌘⇧T  │  │
│  │  ▸ settings:keybindings Customize shortcuts…            │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Architecture**: Central registry + fuzzy matcher (Fuse.js) + plugin API + keyboard recorder

## Requirements

### Functional

- [ ] **Global shortcut**: ⌘K (Mac) / Ctrl+K (Win/Linux) opens palette anywhere
- [ ] **Fuzzy search**: Fuse.js with weighted scoring (name > description > keywords)
- [ ] **Nested commands**: `run:compare` → submenu with recent runs
- [ ] **Context awareness**: Show run commands only on run pages; campaign commands on campaign pages
- [ ] **Plugin API**: `registerCommand({ id, label, description, shortcut, category, when, execute })`
- [ ] **Shortcut recorder**: Settings page to customize/rebind any shortcut
- [ ] **Command history**: Recent/frequent commands at top (persisted to localStorage)
- [ ] **Async execution**: Commands can return Promises; show loading state
- [ ] **Arguments**: Commands can prompt for input (text, select, multi-select) before execute

### Non-Functional

- [ ] Open latency < 50ms (pre-mounted, lazy-hydrated)
- [ ] Search latency < 16ms for 500 commands (60fps typing)
- [ ] Bundle size < 10KB gzip (core) + plugins code-split
- [ ] Zero conflicts with existing shortcuts (detector in dev)
- [ ] Accessible: Full keyboard nav, screen reader announcements, ARIA combobox
- [ ] Works in SSR (Next.js) — no `window` in initial render

## Files to Modify / Create

```
apps/web/src/features/command-palette/
├── CommandPalette.tsx                  # Main component (portal-mounted)
├── CommandPalette.test.tsx
├── registry/
│   ├── CommandRegistry.ts              # Central command store
│   ├── CommandRegistry.test.ts
│   ├── plugins.ts                      # Plugin registration API
│   └── builtins.ts                     # Core app commands
├── matching/
│   ├── FuzzyMatcher.ts                 # Fuse.js wrapper + scoring
│   ├── FuzzyMatcher.test.ts
│   └── scoring.ts                      # Custom scoring functions
├── ui/
│   ├── CommandList.tsx                 # Virtualized list (react-virtual)
│   ├── CommandItem.tsx                 # Single command row
│   ├── CategoryHeader.tsx              # Group header
│   ├── ArgumentPrompt.tsx              # Input prompts for args
│   └── LoadingOverlay.tsx
├── shortcuts/
│   ├── ShortcutRecorder.tsx            # Settings UI for rebinding
│   ├── ShortcutDetector.ts             # Dev-mode conflict detection
│   ├── KeyChordParser.ts               # Parse "⌘⇧C" → {meta, shift, key}
│   └── shortcuts.ts                    # Default shortcuts map
├── context/
│   ├── ContextProvider.tsx             # Page/context awareness
│   ├── useCommandContext.ts            # Hook for context detection
│   └── contexts.ts                     # Context definitions
├── history/
│   ├── CommandHistory.ts               # localStorage + scoring
│   └── useCommandHistory.ts
└── hooks/
    ├── useCommandPalette.ts            # Main hook (open, search, execute)
    └── useCommandRegistration.ts       # For plugins to register
```

## Acceptance Criteria

| Metric | Target | Test |
|--------|--------|------|
| Open latency (cold) | < 100ms | Performance mark |
| Open latency (warm) | < 50ms | Performance mark |
| Search (500 cmds) | < 16ms/keystroke | Benchmark |
| Shortcut conflict detection | 100% in dev | Unit test |
| Accessibility score | 100% (axe-core) | CI: `pnpm test:e2e a11y.spec.ts` |
| Plugin registration | < 1ms | Benchmark |

## PR Guide

- Branch: `issue/004-command-palette-universal`
- Phase 1: Core registry + fuzzy matching + basic UI
- Phase 2: Plugin API + context awareness
- Phase 3: Shortcut recorder + history + settings integration
- Phase 4: Built-in commands migration (runs, triage, settings, analytics)
- **Dependencies**: `fuse.js`, `@floating-ui/react` (maintainer approval)
- Update `docs/ARCHITECTURE.md` with command palette architecture

## Related Issues

- Blocks: #005 (keyboard shortcuts customization), #012 (accessibility overhaul)
- Related: #001 (virtualized table needs command palette integration)
- Depends on: Settings page restructuring

## Contributor Notes

**Start here if:** You have experience with:
- Fuse.js or similar fuzzy search libraries
- React portal + floating UI patterns
- Keyboard event handling (key chords, modifiers)
- Plugin/extension architectures (VS Code, Figma patterns)

**Key challenges:**
- SSR compatibility: Command registry must work server-side
- Shortcut conflicts: Detect in dev, warn in console
- Context detection: URL-based + RBAC-based
- Performance: 500+ commands with virtualized list

**Learning resources:**
- Fuse.js: https://fusejs.io/
- Floating UI: https://floating-ui.com/
- VS Code Command Palette UX: https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette

**Estimated effort:** 3-4 weeks
**Mentorship available:** Yes