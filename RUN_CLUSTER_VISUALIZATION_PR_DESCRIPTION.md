# [502] Add Run cluster visualization

## Overview
Implemented a sophisticated **Run Cluster Visualization** system that enables maintainers to analyze fuzzing runs through multiple lenses (Status, Area, Severity, Performance, and Failures). This component provides both high-level summaries and deep-dive visual analytics with a premium, responsive interface.

## Changes Made

### Core Component
- **Multi-Dimensional Clustering**: Implemented 5 clustering modes (Status, Area, Severity, Performance, Failure Signatures).
- **Interactive Views**: Added Grid and Bubble chart view modes with smooth transitions.
- **Enhanced Aesthetics**: 
  - Integrated modern gradients and glassmorphism.
  - Added micro-animations (floating bubbles, pulse effects, hover transitions).
  - Implemented responsive grid layouts (1-4 columns).
- **Robust State Management**: Added explicit `loading` (skeleton) and `error` states with retry functionality.

### Integration
- **Dashboard Integration**: Integrated into `page.tsx` with full support for filtered run sets and data fetching states.
- **Type Safety**: Exported `RunCluster` and `RunClusterVisualizationDataState` for consistent usage.

### Testing
- **New Test Suite**: Created `add-run-cluster-visualization.test.ts` with 6 comprehensive test scenarios.
- **CI Integration**: Added visualization tests to the main `package.json` test pipeline.
- **Validation**: Verified zero regression in existing Wave 4 flows.

## Features at a Glance
- **Failure De-duplication**: Group runs by unique crash signatures to identify the most frequent bugs.
- **Performance Analysis**: Automatically categorize runs as Fast, Normal, or Slow based on duration averages.
- **Visual Bubble Chart**: Dynamic representation of cluster sizes for quick density analysis.
- **Metric Insights**: Inline display of failure rates, average durations, and resource consumption.

## Validation Steps
1. Run `cd apps/web && npm run test` to verify all 6 new test cases pass.
2. Verify TypeScript compilation with `npx tsc --noEmit`.
3. Check the dashboard to ensure the visualization appears correctly under the filter controls.

## Closes
Closes #502
