# Cross-run Board Widgets Component

## Overview

The `CrossRunBoardWidgets` component provides a comprehensive dashboard view of fuzzing run statistics across all areas of the SorobanCrashLab system. It displays key metrics in an accessible, responsive widget layout with full support for loading states, error handling, and keyboard navigation.

## Features

### Core Functionality
- **Real-time Metrics**: Displays total runs, completed, failed, running, average duration, and average seeds
- **Success Rate Calculation**: Automatically calculates and displays success rates with trend indicators
- **Critical Issue Tracking**: Highlights critical severity issues across all runs
- **Responsive Layout**: Adapts from 1 column on mobile to 6 columns on extra-large screens

### Accessibility
- **Keyboard Navigation**: Full keyboard support with Enter/Space to expand widget details
- **ARIA Labels**: Comprehensive screen reader support with proper roles and descriptions
- **Focus Management**: Clear focus indicators and logical tab order
- **High Contrast**: WCAG AA compliant color schemes for both light and dark modes

### State Management
- **Loading States**: Animated skeleton screens during data fetching
- **Error Handling**: Graceful error display with retry functionality
- **Interactive Details**: Click or keyboard activation to show detailed descriptions

## Usage

### Basic Usage
```tsx
import CrossRunBoardWidgets from "./implement-cross-run-board-widgets-component";

function Dashboard() {
  return (
    <CrossRunBoardWidgets 
      runs={fuzzingRuns}
      dataState="success"
    />
  );
}
```

### With Loading State
```tsx
<CrossRunBoardWidgets 
  runs={[]}
  dataState="loading"
/>
```

### With Error Handling
```tsx
<CrossRunBoardWidgets 
  runs={[]}
  dataState="error"
  errorMessage="Failed to load run statistics"
  onRetry={() => refetchData()}
/>
```

### With Custom Styling
```tsx
<CrossRunBoardWidgets 
  runs={fuzzingRuns}
  dataState="success"
  className="my-custom-class"
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `runs` | `FuzzingRun[]` | `[]` | Array of fuzzing run data |
| `dataState` | `"loading" \| "error" \| "success"` | `"success"` | Current data loading state |
| `onRetry` | `() => void` | `undefined` | Callback for retry button in error state |
| `errorMessage` | `string` | `undefined` | Custom error message to display |
| `className` | `string` | `""` | Additional CSS classes |

## Widget Types

### 1. Total Runs
- **Metric**: Count of all fuzzing runs
- **Color**: Blue
- **Icon**: Bar chart
- **Description**: Total number of fuzzing runs across all areas

### 2. Completed Runs
- **Metric**: Count of successfully completed runs
- **Color**: Green
- **Icon**: Check circle
- **Trend**: Success rate percentage with up/down/neutral indicator
- **Description**: Completed runs with calculated success rate

### 3. Failed Runs
- **Metric**: Count of failed runs
- **Color**: Amber
- **Icon**: Warning circle
- **Trend**: Failure rate percentage with trend indicator
- **Description**: Failed runs with critical issue count if applicable

### 4. Running Runs
- **Metric**: Count of currently executing runs
- **Color**: Purple
- **Icon**: Play circle
- **Description**: Runs currently in progress

### 5. Average Duration
- **Metric**: Mean execution time in minutes
- **Color**: Blue
- **Icon**: Clock
- **Description**: Average run duration across all completed runs

### 6. Average Seeds
- **Metric**: Mean seed count with number formatting
- **Color**: Green
- **Icon**: Database
- **Description**: Average number of seeds generated per run

## Responsive Breakpoints

- **Mobile (default)**: 1 column grid
- **Small (sm:)**: 2 columns
- **Large (lg:)**: 3 columns
- **Extra Large (xl:)**: 6 columns

## Accessibility Features

### Keyboard Navigation
- **Tab**: Navigate between widgets
- **Enter/Space**: Expand widget to show detailed description
- **Escape**: Close expanded widget (handled by focus management)

### Screen Reader Support
- **Section Label**: "Cross-run statistics dashboard"
- **Widget Roles**: Each widget has `role="button"` for interactivity
- **Descriptions**: Detailed descriptions available via `aria-describedby`
- **Live Regions**: Loading and error states announced to screen readers

### Visual Accessibility
- **Color Contrast**: All color combinations meet WCAG AA standards (4.5:1 ratio)
- **Focus Indicators**: Clear 2px blue focus rings with proper offset
- **Dark Mode**: Full support with appropriate color adjustments
- **Icon Alternatives**: All icons have text alternatives or are marked `aria-hidden`

## Testing

The component includes comprehensive unit tests covering:

### Core Functionality Tests
- Empty data handling
- Single run calculations
- Mixed status distributions
- Large dataset performance
- Zero value edge cases
- Success rate boundary conditions

### Test Utilities
```typescript
import { computeWidgetMetrics, makeRun } from "./implement-cross-run-board-widgets-component.test";

// Create test data
const testRun = makeRun({ 
  status: "completed", 
  duration: 300000, 
  severity: "high" 
});

// Test metrics calculation
const metrics = computeWidgetMetrics([testRun]);
```

### Running Tests
```bash
# Run all tests
npm run test

# Run specific test file
npx tsc src/app/implement-cross-run-board-widgets-component.test.ts --module commonjs --target es2020 --outDir build/test-tmp --esModuleInterop && node build/test-tmp/implement-cross-run-board-widgets-component.test.js
```

## Performance Considerations

### Optimization Strategies
- **useMemo**: Expensive metric calculations are memoized
- **useCallback**: Event handlers are memoized to prevent unnecessary re-renders
- **Efficient Filtering**: Single-pass filtering for all status counts
- **Number Formatting**: Locale-aware formatting for large numbers

### Memory Usage
- **Lightweight State**: Minimal component state (only focused widget ID)
- **No Data Duplication**: Metrics computed from props, not stored
- **Event Cleanup**: Proper cleanup of event listeners and timeouts

## Integration with SorobanCrashLab

### Dashboard Integration
The component is integrated into the main dashboard (`page.tsx`) as a maintainer-only feature:

```tsx
{isMaintainer && (
  <div className="w-full mb-12">
    <CrossRunBoardWidgets 
      runs={runs}
      dataState={dataState}
      onRetry={() => setFetchAttempt(prev => prev + 1)}
      errorMessage="Failed to load cross-run statistics. Please try again."
    />
    <CrossRunBoardCustomWidgets runs={runs} />
  </div>
)}
```

### Data Flow
1. **Data Source**: Receives `FuzzingRun[]` from parent component
2. **State Management**: Uses parent's `dataState` for loading/error states
3. **Error Recovery**: Calls parent's retry function on error
4. **Metrics Calculation**: Computes all metrics client-side from run data

### Styling Integration
- **Tailwind CSS**: Uses project's Tailwind configuration
- **Dark Mode**: Respects system dark mode preference
- **Color Palette**: Consistent with project's design system
- **Spacing**: Follows project's spacing conventions

## Browser Support

- **Modern Browsers**: Chrome 88+, Firefox 85+, Safari 14+, Edge 88+
- **Mobile**: iOS Safari 14+, Chrome Mobile 88+
- **Accessibility**: NVDA, JAWS, VoiceOver screen readers
- **Keyboard**: Full keyboard navigation support

## Future Enhancements

### Potential Improvements
1. **Real-time Updates**: WebSocket integration for live metrics
2. **Historical Trends**: Time-series data visualization
3. **Custom Metrics**: User-defined metric calculations
4. **Export Functionality**: CSV/JSON export of widget data
5. **Drill-down Navigation**: Click widgets to filter main table
6. **Comparison Mode**: Side-by-side metric comparisons

### Performance Optimizations
1. **Virtual Scrolling**: For large datasets (1000+ runs)
2. **Web Workers**: Background metric calculations
3. **Caching**: Memoized calculations with cache invalidation
4. **Lazy Loading**: Progressive metric loading for complex calculations