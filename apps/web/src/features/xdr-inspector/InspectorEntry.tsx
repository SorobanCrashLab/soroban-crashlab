'use client';
import dynamic from 'next/dynamic';
import InspectorBoundary from './InspectorBoundary';
const Inspector = dynamic(() => import('./XdrScValInspector'), {
  ssr: false,
  loading: () => <p role="status">Loading payload inspector...</p>,
});
export default function InspectorEntry({ context }: { context?: string }) {
  return (
    <InspectorBoundary>
      <Inspector context={context} />
    </InspectorBoundary>
  );
}
