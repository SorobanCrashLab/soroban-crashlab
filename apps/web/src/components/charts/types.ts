export interface ChartPoint {
  x: number | string | Date;
  y: number;
  [key: string]: unknown;
}

export interface ChartSeries<TPoint extends ChartPoint = ChartPoint> {
  id: string;
  label: string;
  color?: string;
  data: readonly TPoint[];
}

export interface ChartAnnotation {
  id: string;
  x: number | string | Date;
  label: string;
  description?: string;
  color?: string;
}

export interface ChartThreshold {
  id: string;
  value: number;
  label: string;
  description?: string;
  color?: string;
}

export type ChartRange = {
  start: ChartPoint;
  end: ChartPoint;
};
