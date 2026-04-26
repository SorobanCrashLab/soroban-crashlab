# Run Cluster Visualization Component

The `RunClusterVisualization` component provides a sophisticated, multi-dimensional view of fuzzing runs, allowing maintainers to identify patterns, bottlenecks, and recurring failures across large datasets.

## Features

### 1. Multi-Mode Clustering
Group runs by different attributes to uncover specific insights:
- **Status**: Group by 'running', 'completed', 'failed', or 'cancelled'.
- **Area**: Group by functional area (auth, state, budget, xdr).
- **Severity**: Group by maximum observed severity.
- **Performance**: Automatic grouping into 'Fast', 'Normal', and 'Slow' based on duration.
- **Failures**: Group failed runs by unique crash signatures for de-duplication.

### 2. Interactive View Modes
Visualize clusters using different graphical representations:
- **Grid View**: Comprehensive cards showing metrics and distributions.
- **Bubble Chart**: Dynamic, animated visual representation of cluster sizes.
- **Timeline**: Chronological view of run execution (optional).
- **Metrics**: Deep-dive into performance and resource consumption (optional).

### 3. Advanced Aesthetics
- **Gradients & Glassmorphism**: Modern, premium UI design.
- **Micro-animations**: Smooth transitions, hover effects, and floating bubble animations.
- **Responsive Layout**: Adapts from mobile grids to expansive dashboard views.
- **Dark Mode Support**: Fully optimized for dark themes with appropriate contrast.

### 4. Robust State Management
- **Loading States**: Integrated skeleton screens for data fetching.
- **Error Handling**: Graceful error displays with retry functionality.
- **Empty States**: Clear messaging when no data matches current filters.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `runs` | `FuzzingRun[]` | `[]` | Array of runs to visualize. Uses mock data if empty. |
| `dataState` | `"loading" \| "error" \| "success"` | `"success"` | Current data fetching state. |
| `onRetry` | `() => void` | `undefined` | Callback for error state retry. |
| `errorMessage` | `string` | `undefined` | Custom error message. |
| `onRunSelect` | `(runId: string) => void` | `undefined` | Callback when a run is clicked. |
| `showTimeline` | `boolean` | `true` | Whether to show the timeline tab. |
| `showMetrics` | `boolean` | `true` | Whether to show the metrics tab. |

## Usage Example

```tsx
import { RunClusterVisualization } from "./add-run-cluster-visualization";

const MyDashboard = () => {
  const { runs, status } = useFuzzingRuns();

  return (
    <RunClusterVisualization
      runs={runs}
      dataState={status === 'loading' ? 'loading' : 'success'}
      onRunSelect={(id) => console.log('Selected run:', id)}
    />
  );
};
```

## Testing

The component includes a comprehensive test suite in `add-run-cluster-visualization.test.ts` covering:
- Status clustering logic and failure rates.
- Area and severity grouping accuracy.
- Performance categorization (Fast/Normal/Slow thresholds).
- Failure signature de-duplication and metric aggregation.
- Mock data generation consistency.
