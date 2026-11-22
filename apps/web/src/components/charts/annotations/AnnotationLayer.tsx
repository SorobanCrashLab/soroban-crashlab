import type { ChartAnnotation } from '../types';

export interface AnnotationLayerProps {
  annotations: readonly ChartAnnotation[];
}

export function AnnotationLayer({ annotations }: AnnotationLayerProps) {
  return (
    <ul className="chart-annotation-list" aria-label="Chart annotations">
      {annotations.map((item) => (
        <li key={item.id}>
          <strong>{item.label}</strong>
          {item.description && <span>{item.description}</span>}
        </li>
      ))}
    </ul>
  );
}
