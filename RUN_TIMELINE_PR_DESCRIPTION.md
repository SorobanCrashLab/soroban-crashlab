# Run Timeline Implementation

Closes #507

## Summary

Implements the Run timeline feature for the SorobanCrashLab dashboard with explicit loading/error states, keyboard accessibility, and responsive layout behavior.

## Changes

### Component Enhancements (`add-run-timeline.tsx`)
- **Loading State**: Added skeleton UI that displays while data is being fetched
- **Error State**: Added error display with retry button for failed data loads
- **Empty State**: Added informative empty state when no runs have timeline data
- **Keyboard Accessibility**: 
  - Arrow Up/Down and Arrow Left/Right to navigate between runs
  - Home/End to jump to first/last run
  - Enter/Space to select a run
  - Escape to dismiss tooltips
- **ARIA Support**: Added proper roles, labels, and descriptions for screen readers
- **Responsive Layout**: Mobile-first design with breakpoints for tablet and desktop
- **Focus Management**: Visual focus indicators and proper focus handling

### Integration (`page.tsx`)
- Updated to pass `dataState` prop to timeline component
- Timeline now handles its own loading/error states independently

### Tests (`add-run-timeline.test.ts`)
- Unit tests for timeline run filtering
- Tests for time bounds calculation
- Tests for duration formatting
- Tests for status color mapping
- Tests for run positioning logic
- Tests for concurrent runs handling
- Tests for edge cases (empty timeline, minimum width)

## Validation Steps

### Primary Validation
```bash
cd apps/web && npm run build
```

### Test Validation
```bash
cd apps/web && npx tsc src/app/add-run-timeline.test.ts src/app/add-run-timeline.tsx src/app/types.ts --module commonjs --target es2020 --outDir build/test-tmp --esModuleInterop --jsx react && node build/test-tmp/add-run-timeline.test.js
```

Expected output: "All add-run-timeline tests passed!"

## Design Notes

### Tradeoffs
- **Skeleton vs Spinner**: Chose skeleton UI for loading state as it provides better visual continuity and perceived performance
- **Inline vs Modal Error**: Chose inline error display to keep users in context rather than disrupting with a modal
- **Keyboard Navigation**: Used arrow keys for navigation to match common timeline/list patterns

### Alternatives Considered
- Virtualized timeline for large datasets (deferred - current 10-run limit is sufficient)
- Drag-to-zoom functionality (deferred to follow-up task)
- Real-time updates via WebSocket (deferred - would require backend changes)

### Rollback Path
If issues arise, the component can be reverted to the previous version which simply returned `null` when no runs were available. The `dataState` prop is optional with a default of `'success'`, so existing usages will continue to work.

## Screenshots

### Loading State
Shows skeleton placeholders with animated pulse effect.

### Error State  
Shows error message with retry button.

### Success State
Shows timeline with run blocks, time markers, and hover tooltips.

### Empty State
Shows informative message when no runs have timeline data.

## Checklist

- [x] Run timeline is visible and functional in the dashboard
- [x] Loading state displays skeleton UI
- [x] Error state displays error message with retry option
- [x] Empty state displays when no timeline data available
- [x] Keyboard navigation works (Arrow keys, Home, End, Enter, Escape)
- [x] ARIA labels and roles are present
- [x] Responsive layout works on mobile, tablet, and desktop
- [x] Unit tests pass
- [x] Build passes
- [x] No regressions in adjacent Wave 4 flows
