# Artifact Preview Modal Component

## Overview

The `ArtifactPreviewModal` component provides a comprehensive modal interface for previewing artifact content in the SorobanCrashLab dashboard. It displays artifact metadata and type-specific content previews with full support for loading states, error handling, keyboard accessibility, and responsive design.

## Features

### Core Functionality
- **Multi-format Support**: Handles seed, log, trace, coverage, and bundle artifacts
- **Type-specific Previews**: Customized content rendering for each artifact type
- **Metadata Display**: Shows size, type, timestamps, hash, and run associations
- **Copy/Download Actions**: Built-in clipboard and file download functionality
- **Deterministic Content**: Generates consistent previews based on artifact ID

### State Management
- **Loading States**: Animated skeleton screens during content loading
- **Error Handling**: Graceful error display with retry functionality
- **Success States**: Full interactive preview with all features enabled
- **Data Validation**: Handles null/undefined artifacts and edge cases

### Accessibility Excellence
- **Keyboard Navigation**: Full Tab, Enter, Escape key support
- **Focus Management**: Proper focus trapping and restoration
- **Screen Reader Support**: ARIA labels, roles, and descriptions
- **WCAG AA Compliance**: High contrast colors and proper focus indicators

### Responsive Design
- **Mobile Optimized**: Adapts to small screens with touch-friendly controls
- **Desktop Enhanced**: Takes advantage of larger screens with expanded layout
- **Flexible Sizing**: Modal scales from mobile to 4K displays
- **Content Scrolling**: Handles large artifacts with proper overflow management

## Usage

### Basic Usage
```tsx
import ArtifactPreviewModal from "./implement-artifact-preview-modal-component";

function ArtifactList() {
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => {
        setSelectedArtifact(artifact);
        setIsOpen(true);
      }}>
        Preview Artifact
      </button>
      
      <ArtifactPreviewModal
        artifact={selectedArtifact}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
```

### With Loading State
```tsx
<ArtifactPreviewModal
  artifact={null}
  isOpen={true}
  onClose={handleClose}
  dataState="loading"
/>
```

### With Error Handling
```tsx
<ArtifactPreviewModal
  artifact={artifact}
  isOpen={true}
  onClose={handleClose}
  dataState="error"
  errorMessage="Failed to load artifact content"
  onRetry={handleRetry}
/>
```

### With Custom Styling
```tsx
<ArtifactPreviewModal
  artifact={artifact}
  isOpen={true}
  onClose={handleClose}
  className="custom-modal-styles"
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `artifact` | `Artifact \| null` | - | The artifact to preview (can be null during loading) |
| `isOpen` | `boolean` | - | Whether the modal is currently open |
| `onClose` | `() => void` | - | Callback when modal should be closed |
| `dataState` | `"loading" \| "error" \| "success"` | `"success"` | Current data loading state |
| `onRetry` | `() => void` | `undefined` | Callback for retry button in error state |
| `errorMessage` | `string` | `undefined` | Custom error message to display |
| `className` | `string` | `""` | Additional CSS classes for the modal |

## Artifact Interface

```typescript
interface Artifact {
  id: string;                    // Unique identifier
  name: string;                  // Display name/filename
  type: "seed" | "log" | "trace" | "coverage" | "bundle";
  size: number;                  // Size in bytes
  updatedAt: string;             // ISO 8601 timestamp
  runId?: string;                // Associated fuzzing run ID
  content_hash?: string;         // Content hash for verification
}
```

## Artifact Types & Previews

### 1. Seed Artifacts (`type: "seed"`)
- **Format**: Hex dump with ASCII representation
- **Display**: 16-byte rows with address, hex values, and ASCII
- **Color**: Green text on dark background
- **Use Case**: Binary seed files for fuzzing input

### 2. Log Artifacts (`type: "log"`)
- **Format**: Timestamped log entries with levels
- **Display**: Multi-line log format with INFO/DEBUG/WARN/ERROR levels
- **Color**: White text on dark background
- **Use Case**: Fuzzer output logs and execution traces

### 3. Trace Artifacts (`type: "trace"`)
- **Format**: JSON execution trace with function calls
- **Display**: Formatted JSON with execution steps
- **Color**: Yellow text on dark background
- **Use Case**: Detailed execution flow analysis

### 4. Coverage Artifacts (`type: "coverage"`)
- **Format**: Coverage report with percentages
- **Display**: Structured report with line/branch/function coverage
- **Color**: Styled text with coverage metrics
- **Use Case**: Code coverage analysis results

### 5. Bundle Artifacts (`type: "bundle"`)
- **Format**: Hex dump (similar to seed)
- **Display**: 16-byte rows with address and hex values
- **Color**: Purple text on dark background
- **Use Case**: Compressed archives and bundled artifacts

## Utility Functions

### formatSize(bytes: number): string
Converts byte counts to human-readable format:
- `512` → `"512 B"`
- `2048` → `"2.0 KB"`
- `1572864` → `"1.5 MB"`

### formatDate(iso: string): string
Formats ISO 8601 timestamps using `Intl.DateTimeFormat`:
- `"2026-04-23T10:30:00Z"` → `"Apr 23, 2026, 10:30 AM"`
- Falls back to original string if parsing fails

### generatePreviewContent(artifact: Artifact): string
Generates deterministic content previews based on artifact ID:
- **Deterministic**: Same ID always produces same content
- **Type-specific**: Different formats for each artifact type
- **Realistic**: Generates plausible content for each type

## Accessibility Features

### Keyboard Navigation
- **Tab**: Navigate between interactive elements
- **Shift+Tab**: Navigate backwards
- **Escape**: Close modal and restore focus
- **Enter/Space**: Activate buttons and actions

### Focus Management
- **Focus Trap**: Keeps focus within modal when open
- **Focus Restoration**: Returns focus to trigger element on close
- **Initial Focus**: Automatically focuses close button when opened
- **Logical Order**: Tab order follows visual layout

### Screen Reader Support
- **Modal Role**: `role="dialog"` with `aria-modal="true"`
- **Labeling**: `aria-labelledby` references modal title
- **Descriptions**: Action buttons have descriptive `aria-label` attributes
- **Live Regions**: Status changes announced to screen readers

### Visual Accessibility
- **High Contrast**: All colors meet WCAG AA standards (4.5:1 ratio)
- **Focus Indicators**: Clear 2px blue focus rings with proper offset
- **Color Independence**: Information not conveyed by color alone
- **Text Scaling**: Supports browser zoom up to 200%

## Responsive Behavior

### Mobile (< 768px)
- **Full Width**: Modal takes full available width with padding
- **Stacked Layout**: Metadata and actions stack vertically
- **Touch Targets**: Minimum 44px touch targets for buttons
- **Scrollable Content**: Vertical scrolling for long content

### Tablet (768px - 1024px)
- **Constrained Width**: Modal uses max-width with margins
- **Grid Layout**: Metadata uses 1-column grid
- **Larger Text**: Improved readability on medium screens

### Desktop (> 1024px)
- **Optimal Width**: Modal uses max-width of 4xl (896px)
- **Grid Layout**: Metadata uses 2-column grid for efficiency
- **Enhanced Actions**: More space for action buttons
- **Better Typography**: Optimized text sizes and spacing

## State Management

### Loading State
```tsx
// Shows animated skeleton
dataState="loading"
```
- Displays skeleton placeholders for all content areas
- Maintains modal structure while content loads
- Accessible loading announcements

### Error State
```tsx
// Shows error message with retry
dataState="error"
errorMessage="Custom error message"
onRetry={handleRetry}
```
- Displays error icon and message
- Optional retry button if `onRetry` provided
- Maintains modal accessibility during error

### Success State
```tsx
// Shows full content with actions
dataState="success"
artifact={artifactData}
```
- Displays complete artifact preview
- All interactive features enabled
- Copy and download actions available

## Integration Examples

### With Artifact Explorer
```tsx
function ArtifactExplorer() {
  const [previewArtifact, setPreviewArtifact] = useState<Artifact | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [dataState, setDataState] = useState<'loading' | 'error' | 'success'>('success');

  const handlePreview = async (artifact: Artifact) => {
    setPreviewArtifact(artifact);
    setIsPreviewOpen(true);
    setDataState('loading');
    
    try {
      // Simulate loading artifact content
      await loadArtifactContent(artifact.id);
      setDataState('success');
    } catch (error) {
      setDataState('error');
    }
  };

  return (
    <>
      {/* Artifact list with preview buttons */}
      <ArtifactPreviewModal
        artifact={previewArtifact}
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        dataState={dataState}
        onRetry={() => handlePreview(previewArtifact!)}
      />
    </>
  );
}
```

### With Run Details
```tsx
function RunDetailPage({ runId }: { runId: string }) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);

  return (
    <div>
      <h1>Run {runId} Artifacts</h1>
      {artifacts.map(artifact => (
        <button
          key={artifact.id}
          onClick={() => setSelectedArtifact(artifact)}
          aria-label={`Preview artifact ${artifact.name}`}
        >
          {artifact.name}
        </button>
      ))}
      
      <ArtifactPreviewModal
        artifact={selectedArtifact}
        isOpen={selectedArtifact !== null}
        onClose={() => setSelectedArtifact(null)}
      />
    </div>
  );
}
```

## Testing

The component includes comprehensive unit tests covering:

### Core Functionality Tests
- Utility function validation (formatSize, formatDate)
- Content generation for all artifact types
- Deterministic behavior verification
- Edge case handling (empty IDs, invalid dates)

### Accessibility Tests
- Keyboard navigation behavior
- Focus management and restoration
- ARIA attribute validation
- Screen reader compatibility

### Integration Tests
- Modal open/close behavior
- State transitions (loading → success → error)
- Copy and download functionality
- Responsive layout adaptation

### Running Tests
```bash
# Run all tests
npm run test

# Run specific test file
npx tsc src/app/implement-artifact-preview-modal-component.test.ts --module commonjs --target es2020 --outDir build/test-tmp --esModuleInterop && node build/test-tmp/implement-artifact-preview-modal-component.test.js
```

## Performance Considerations

### Optimization Strategies
- **Portal Rendering**: Uses React createPortal for optimal z-index handling
- **Conditional Rendering**: Only renders when `isOpen` is true
- **Memoized Callbacks**: Event handlers are memoized to prevent re-renders
- **Efficient Content Generation**: Deterministic algorithms avoid expensive operations

### Memory Management
- **Cleanup on Unmount**: Removes event listeners and clears timeouts
- **Blob URL Management**: Properly revokes object URLs after download
- **Focus Restoration**: Cleans up focus references on close

### Bundle Size Impact
- **Minimal Dependencies**: Uses only React and DOM APIs
- **Tree Shaking**: Exports individual utility functions
- **No External Libraries**: Self-contained implementation

## Browser Support

- **Modern Browsers**: Chrome 88+, Firefox 85+, Safari 14+, Edge 88+
- **Mobile Browsers**: iOS Safari 14+, Chrome Mobile 88+
- **Accessibility Tools**: NVDA, JAWS, VoiceOver screen readers
- **Keyboard Navigation**: Full support across all browsers

## Future Enhancements

### Potential Improvements
1. **Syntax Highlighting**: Code syntax highlighting for trace/log content
2. **Search Within Content**: Find functionality within artifact previews
3. **Multiple Artifacts**: Side-by-side comparison of multiple artifacts
4. **Export Options**: Additional export formats (PDF, HTML)
5. **Streaming Content**: Support for very large artifacts with streaming
6. **Collaborative Features**: Sharing and annotation capabilities

### Performance Optimizations
1. **Virtual Scrolling**: For extremely large artifact content
2. **Lazy Loading**: Progressive content loading for large files
3. **Caching**: Client-side caching of frequently accessed artifacts
4. **Web Workers**: Background processing for complex content generation

## Security Considerations

### Content Safety
- **XSS Prevention**: All content is properly escaped and sanitized
- **No Code Execution**: Preview content is display-only
- **Safe Downloads**: Generated content uses safe blob creation
- **Input Validation**: Artifact data is validated before processing

### Privacy Protection
- **No External Requests**: All processing happens client-side
- **Local Storage Only**: No data transmitted to external services
- **Secure Clipboard**: Uses modern Clipboard API with proper permissions