export interface HeatmapDataPoint {
  date: string;
  count: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  runs: number;
}

export const generateMockHeatmapData = (): HeatmapDataPoint[] => {
  const data: HeatmapDataPoint[] = [];
  const today = new Date();

  for (let i = 89; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const severities: Array<'low' | 'medium' | 'high' | 'critical'> = ['low', 'medium', 'high', 'critical'];
    const randomSeverity = severities[Math.floor(Math.random() * severities.length)];
    const runs = Math.floor(Math.random() * 50);
    const count = runs === 0 ? 0 : Math.floor(Math.random() * 10) + 1;

    data.push({
      date: dateStr,
      count,
      severity: runs > 30 ? 'critical' : randomSeverity,
      runs,
    });
  }

  return data;
};

export const getHeatmapColor = (count: number, severity: string): string => {
  if (count === 0) return '#f3f4f6';

  const severityMap: Record<string, string[]> = {
    low: ['#dbeafe', '#93c5fd', '#3b82f6', '#1e40af'],
    medium: ['#fed7aa', '#fdba74', '#f97316', '#c2410c'],
    high: ['#fecaca', '#f87171', '#dc2626', '#7f1d1d'],
    critical: ['#fca5a5', '#ef4444', '#991b1b', '#660000'],
  };

  const colors = severityMap[severity] || severityMap.low;
  if (count <= 1) return colors[0];
  if (count <= 3) return colors[1];
  if (count <= 5) return colors[2];
  return colors[3];
};

export type HeatmapMetric = 'runs' | 'crashes' | 'gas' | 'duration';

export interface HeatmapAnnotation {
  id: string;
  date: string;
  kind: 'deployment' | 'incident' | 'config';
  label: string;
}

export interface HeatmapCell extends HeatmapDataPoint {
  runIds?: string[];
  gas?: number;
  durationMs?: number;
  annotations?: HeatmapAnnotation[];
}

export const HEATMAP_METRICS: HeatmapMetric[] = ['runs', 'crashes', 'gas', 'duration'];

export function getHeatmapMetricValue(point: HeatmapCell, metric: HeatmapMetric): number {
  if (metric === 'crashes') return point.count;
  if (metric === 'gas') return point.gas ?? 0;
  if (metric === 'duration') return point.durationMs ?? 0;
  return point.runs;
}

export function aggregateHeatmapData(points: HeatmapCell[], metric: HeatmapMetric = 'runs'): HeatmapCell[] {
  const byDate = new Map<string, HeatmapCell>();
  for (const point of points) {
    if (!point.date) continue;
    const existing = byDate.get(point.date);
    if (!existing) {
      byDate.set(point.date, { ...point, runIds: [...(point.runIds ?? [])], annotations: [...(point.annotations ?? [])] });
      continue;
    }
    const count = existing.count + point.count;
    const runs = existing.runs + point.runs;
    const gas = (existing.gas ?? 0) + (point.gas ?? 0);
    const durationMs = (existing.durationMs ?? 0) + (point.durationMs ?? 0);
    byDate.set(point.date, {
      ...existing,
      count,
      runs,
      gas,
      durationMs,
      severity: count >= 20 ? 'critical' : count >= 10 ? 'high' : count >= 3 ? 'medium' : 'low',
      runIds: [...new Set([...(existing.runIds ?? []), ...(point.runIds ?? [])])],
      annotations: [...(existing.annotations ?? []), ...(point.annotations ?? [])],
    });
  }
  const result = Array.from(byDate.values());
  void metric;
  return result;
}

export function filterHeatmapAnnotations(
  annotations: HeatmapAnnotation[],
  kinds: HeatmapAnnotation['kind'][] = ['deployment', 'incident', 'config'],
): HeatmapAnnotation[] {
  const allowed = new Set(kinds);
  return annotations.filter((annotation) => allowed.has(annotation.kind));
}

export function heatmapToCsv(points: HeatmapCell[], metric: HeatmapMetric = 'runs'): string {
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = [['date', metric, 'severity', 'runIds', 'annotations']];
  for (const point of points) {
    rows.push([
      point.date,
      getHeatmapMetricValue(point, metric),
      point.severity,
      (point.runIds ?? []).join(';'),
      (point.annotations ?? []).map((annotation) => annotation.label).join(';'),
    ]);
  }
  return rows.map((row) => row.map(escape).join(',')).join('\n');
}

export function createHeatmapShareLink(baseUrl: string, date: string, metric: HeatmapMetric): string {
  const url = new URL(baseUrl);
  url.searchParams.set('date', date);
  url.searchParams.set('metric', metric);
  return url.toString();
}

export const getMonthWeeks = (year: number, month: number): Array<HeatmapDataPoint[]> => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const weeks: Array<HeatmapDataPoint[]> = [];
  let currentWeek: HeatmapDataPoint[] = [];

  const startingDayOfWeek = firstDay.getDay();
  for (let i = 0; i < startingDayOfWeek; i++) {
    currentWeek.push({
      date: '',
      count: 0,
      severity: 'low',
      runs: 0,
    });
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(year, month, day);
    const dateStr = date.toISOString().split('T')[0];

    currentWeek.push({
      date: dateStr,
      count: Math.floor(Math.random() * 5),
      severity: Math.random() > 0.7 ? 'critical' : 'low',
      runs: Math.floor(Math.random() * 50),
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push({
        date: '',
        count: 0,
        severity: 'low',
        runs: 0,
      });
    }
    weeks.push(currentWeek);
  }

  return weeks;
};
