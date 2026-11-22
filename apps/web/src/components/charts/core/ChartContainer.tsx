'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { ChartAnnotation, ChartPoint, ChartRange, ChartSeries, ChartThreshold } from '../types';
import { DEFAULT_CHART_THEME, resolveSeriesColor } from '../ChartTheme';
import { ChartLegend } from './Legend';
import { ChartTooltip } from './Tooltip';
import { getSelectedRange, publishSyncedCursor, subscribeSyncedCursor } from './interactions';
import { buildLinePath, getDomain, numericX, scaleX, scaleY, type PlotBounds } from '../utils/scales';
import { downsampleMinMax } from '../utils/downsample';
import { chartDataToCsv, downloadChartPng, downloadChartSvg, downloadTextFile } from '../utils/export';

export type ChartKind = 'line' | 'area' | 'bar' | 'stacked-bar' | 'scatter';

export interface ChartContainerProps<TPoint extends ChartPoint = ChartPoint> {
  id?: string;
  title: string;
  description: string;
  series: readonly ChartSeries<TPoint>[];
  kind?: ChartKind;
  annotations?: readonly ChartAnnotation[];
  thresholds?: readonly ChartThreshold[];
  height?: number;
  maxPoints?: number;
  syncGroup?: string;
  onPointSelect?: (point: TPoint, seriesId: string) => void;
  onRangeSelect?: (range: ChartRange) => void;
  onDrillDown?: (point: TPoint | ChartRange) => void;
  className?: string;
  showDataTable?: boolean;
  yDomain?: { min: number; max: number };
  formatValue?: (value: number) => string;
}

const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 320;
const PLOT: PlotBounds = { left: 56, top: 16, width: 720, height: 250 };

function formatX(value: ChartPoint['x']): string {
  return value instanceof Date ? value.toLocaleString() : String(value);
}

export function ChartContainer<TPoint extends ChartPoint>({
  id: providedId,
  title,
  description,
  series,
  kind = 'line',
  annotations = [],
  thresholds = [],
  height = 320,
  maxPoints = 1200,
  syncGroup,
  onPointSelect,
  onRangeSelect,
  onDrillDown,
  className = '',
  showDataTable: initiallyShowTable = false,
  yDomain: yDomainOverride,
  formatValue = String,
}: ChartContainerProps<TPoint>) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hiddenSeries, setHiddenSeries] = useState<ReadonlySet<string>>(() => new Set());
  const [showDataTable, setShowDataTable] = useState(initiallyShowTable);
  const [focusIndex, setFocusIndex] = useState(0);
  const [brushStart, setBrushStart] = useState(0);
  const [brushEnd, setBrushEnd] = useState<number | null>(null);
  const [syncedX, setSyncedX] = useState<ChartPoint['x'] | null>(null);
  const [pointerX, setPointerX] = useState<ChartPoint['x'] | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{ point: TPoint; label: string } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const visibleSeries = useMemo(
    () => series.filter((item) => !hiddenSeries.has(item.id)),
    [hiddenSeries, series],
  );
  const sourcePointsBySeries = useMemo(
    () => visibleSeries.map((item) => ({
      series: item,
      points: downsampleMinMax(item.data, maxPoints),
    })),
    [maxPoints, visibleSeries],
  );
  const categories = useMemo(() => {
    const values: string[] = [];
    const seen = new Set<string>();
    for (const item of visibleSeries) {
      for (const point of item.data) {
        if (typeof point.x === 'string' && Number.isNaN(Date.parse(point.x)) && !seen.has(point.x)) {
          seen.add(point.x);
          values.push(point.x);
        }
      }
    }
    return new Map(values.map((value, index) => [value, index]));
  }, [visibleSeries]);
  const chartX = useCallback((value: ChartPoint['x']) =>
    typeof value === 'string' && Number.isNaN(Date.parse(value))
      ? categories.get(value) ?? 0
      : numericX(value), [categories]);
  const firstSource = sourcePointsBySeries[0];
  const lastIndex = Math.max(0, (firstSource?.points.length ?? 1) - 1);
  const rangeStart = Math.min(brushStart, brushEnd ?? lastIndex);
  const rangeEnd = Math.max(brushStart, brushEnd ?? lastIndex);
  const firstX = firstSource?.points[rangeStart] ? chartX(firstSource.points[rangeStart].x) : Number.NEGATIVE_INFINITY;
  const lastX = firstSource?.points[rangeEnd] ? chartX(firstSource.points[rangeEnd].x) : Number.POSITIVE_INFINITY;
  const pointsBySeries = useMemo(
    () => sourcePointsBySeries.map(({ series: item, points }) => ({
      series: item,
      points: points.filter((point) => {
        const x = chartX(point.x);
        return x >= firstX && x <= lastX;
      }),
    })),
    [chartX, firstX, lastX, sourcePointsBySeries],
  );
  const allPoints = useMemo(() => pointsBySeries.flatMap((item) => item.points), [pointsBySeries]);
  const xDomain = useMemo(() => getDomain(allPoints.map((point) => chartX(point.x))), [allPoints, chartX]);
  const yValues = useMemo(() => {
    const values = allPoints.map((point) => point.y);
    if (kind === 'stacked-bar') {
      const totals = new Map<string, number>();
      for (const point of allPoints) {
        const key = String(point.x);
        totals.set(key, (totals.get(key) ?? 0) + point.y);
      }
      for (const total of totals.values()) values.push(total);
    }
    return [...values, ...thresholds.map((item) => item.value)];
  }, [allPoints, kind, thresholds]);
  const yDomain = useMemo(
    () => getDomain(yValues, kind === 'bar' || kind === 'stacked-bar'),
    [kind, yValues],
  );
  const effectiveYDomain = yDomainOverride ?? yDomain;
  const tableRows = useMemo(() => {
    if (!showDataTable) return [];
    const valuesByX = new Map<string, Map<string, number>>();
    for (const item of visibleSeries) {
      for (const point of item.data) {
        const x = formatX(point.x);
        const row = valuesByX.get(x) ?? new Map<string, number>();
        row.set(item.id, point.y);
        valuesByX.set(x, row);
      }
    }
    return Array.from(valuesByX.entries()).slice(0, 500);
  }, [showDataTable, visibleSeries]);
  useEffect(() => {
    if (!syncGroup) return undefined;
    return subscribeSyncedCursor(syncGroup, id, setSyncedX);
  }, [id, syncGroup]);

  const toggleSeries = (seriesId: string) => {
    setHiddenSeries((current) => {
      const next = new Set(current);
      if (next.has(seriesId)) next.delete(seriesId);
      else next.add(seriesId);
      return next;
    });
  };

  const selectPoint = (point: TPoint, seriesId: string) => {
    onPointSelect?.(point, seriesId);
    onDrillDown?.(point);
    if (syncGroup) publishSyncedCursor({ group: syncGroup, x: point.x, sourceId: id });
  };

  const selectedPoint = firstSource?.points[Math.min(focusIndex, Math.max((firstSource?.points.length ?? 1) - 1, 0))];
  const selectedRange = firstSource && brushEnd !== null
    ? getSelectedRange(firstSource.points, brushStart, brushEnd)
    : null;

  const handleKeyboard = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!firstSource || firstSource.points.length === 0) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusIndex((index) => Math.min(firstSource.points.length - 1, index + 1));
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      setFocusIndex((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter' && selectedPoint) {
      event.preventDefault();
      selectPoint(selectedPoint, firstSource.series.id);
    }
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!firstSource || firstSource.points.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const svgX = ((event.clientX - bounds.left) / bounds.width) * VIEW_WIDTH;
    const targetX = xDomain.min + ((svgX - PLOT.left) / PLOT.width) * (xDomain.max - xDomain.min);
    let nearest = firstSource.points[0];
    for (const point of firstSource.points) {
      if (Math.abs(chartX(point.x) - targetX) < Math.abs(chartX(nearest.x) - targetX)) nearest = point;
    }
    setPointerX(nearest.x);
    setHoveredPoint({ point: nearest, label: firstSource.series.label });
    if (syncGroup) publishSyncedCursor({ group: syncGroup, x: nearest.x, sourceId: id });
  };

  const activeCursorX = pointerX ?? syncedX;
  const cursorX = activeCursorX === null ? null : scaleX(chartX(activeCursorX), xDomain, PLOT);

  const fileBase = id.replace(/[^A-Za-z0-9._-]/g, '_');
  const exportCsv = () => downloadTextFile(chartDataToCsv(visibleSeries), `${fileBase}.csv`, 'text/csv;charset=utf-8');
  const exportSvg = () => {
    if (svgRef.current) downloadChartSvg(svgRef.current, `${fileBase}.svg`);
  };
  const exportPng = () => {
    if (!svgRef.current) return;
    setExportError(null);
    void downloadChartPng(svgRef.current, `${fileBase}.png`).catch((error: unknown) => {
      setExportError(error instanceof Error ? error.message : 'Chart PNG export failed');
    });
  };
  const pan = (direction: -1 | 1) => {
    const length = Math.max(1, rangeEnd - rangeStart);
    const offset = Math.max(1, Math.floor(length * 0.1));
    const start = Math.max(0, Math.min(lastIndex - length, rangeStart + direction * offset));
    setBrushStart(start);
    setBrushEnd(Math.min(lastIndex, start + length));
  };

  return (
    <figure className={`chart-container ${className}`} style={{ '--chart-height': `${height}px` } as CSSProperties}>
      <figcaption className="chart-heading">
        <div>
          <h3 id={`${id}-title`} className="chart-title">{title}</h3>
          <p id={`${id}-description`} className="chart-description">{description}</p>
        </div>
        <div className="chart-actions" aria-label="Chart export and view options">
          <button type="button" onClick={() => setShowDataTable((visible) => !visible)} aria-pressed={showDataTable}>
            {showDataTable ? 'Hide data table' : 'Show data table'}
          </button>
          <button type="button" onClick={exportCsv}>Export CSV</button>
          <button type="button" onClick={exportSvg}>Export SVG</button>
          <button type="button" onClick={exportPng}>Export PNG</button>
        </div>
      </figcaption>

      <ChartLegend series={series} hiddenSeries={hiddenSeries} onToggle={toggleSeries} />

      <svg
        ref={svgRef}
        className="chart-plot"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="group"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        tabIndex={0}
        onKeyDown={handleKeyboard}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => { setPointerX(null); setHoveredPoint(null); }}
        onFocus={() => setFocusIndex(0)}
        style={{ width: '100%', height }}
      >
        {Array.from({ length: 5 }, (_, index) => {
          const y = PLOT.top + (PLOT.height * index) / 4;
          const value = effectiveYDomain.max - ((effectiveYDomain.max - effectiveYDomain.min) * index) / 4;
          return (
            <g key={`grid-${index}`}>
              <line x1={PLOT.left} x2={PLOT.left + PLOT.width} y1={y} y2={y} className="chart-grid-line" />
              <text x={PLOT.left - 8} y={y + 4} textAnchor="end" className="chart-axis-label">{formatValue(value)}</text>
            </g>
          );
        })}
        <line x1={PLOT.left} x2={PLOT.left} y1={PLOT.top} y2={PLOT.top + PLOT.height} className="chart-axis-line" />
        <line x1={PLOT.left} x2={PLOT.left + PLOT.width} y1={PLOT.top + PLOT.height} y2={PLOT.top + PLOT.height} className="chart-axis-line" />
        {pointsBySeries[0]?.points.length > 0 && (
          <>
            <text x={PLOT.left} y={PLOT.top + PLOT.height + 18} textAnchor="start" className="chart-axis-label">
              {formatX(pointsBySeries[0].points[0].x)}
            </text>
            <text x={PLOT.left + PLOT.width} y={PLOT.top + PLOT.height + 18} textAnchor="end" className="chart-axis-label">
              {formatX(pointsBySeries[0].points[pointsBySeries[0].points.length - 1].x)}
            </text>
          </>
        )}

        {pointsBySeries.map(({ series: item, points }, seriesIndex) => {
          const color = resolveSeriesColor(item.color, seriesIndex);
          if (kind === 'bar' || kind === 'stacked-bar') {
            const zeroY = scaleY(0, effectiveYDomain, PLOT);
            const barWidth = PLOT.width / Math.max(points.length, 1) /
              (kind === 'stacked-bar' ? 1 : Math.max(pointsBySeries.length, 1)) * 0.75;
            return points.map((point, pointIndex) => {
              const center = scaleX(chartX(point.x), xDomain, PLOT);
              const x = kind === 'stacked-bar'
                ? center
                : center - barWidth * (pointsBySeries.length / 2 - seriesIndex - 0.5);
              const baseValue = kind === 'stacked-bar'
                ? pointsBySeries.slice(0, seriesIndex).reduce(
                  (total, previous) => total + (previous.points.find((entry) => String(entry.x) === String(point.x))?.y ?? 0),
                  0,
                )
                : 0;
              const baseY = scaleY(baseValue, effectiveYDomain, PLOT);
              const valueY = scaleY(baseValue + point.y, effectiveYDomain, PLOT);
              return (
                <rect
                  key={`${item.id}-${pointIndex}`}
                  x={x - barWidth / 2}
                  y={Math.min(valueY, kind === 'stacked-bar' ? baseY : zeroY)}
                  width={Math.max(1, barWidth)}
                  height={Math.max(1, Math.abs((kind === 'stacked-bar' ? baseY : zeroY) - valueY))}
                  fill={color}
                  tabIndex={0}
                  role="button"
                  aria-label={`${item.label}: ${point.y} at ${formatX(point.x)}`}
                  onClick={() => selectPoint(point, item.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      selectPoint(point, item.id);
                    }
                  }}
                >
                  <title>{`${item.label}: ${formatValue(point.y)} at ${formatX(point.x)}`}</title>
                </rect>
              );
            });
          }
          if (kind === 'scatter') {
            return points.map((point, pointIndex) => (
              <circle
                key={`${item.id}-${pointIndex}`}
                cx={scaleX(chartX(point.x), xDomain, PLOT)}
                cy={scaleY(point.y, effectiveYDomain, PLOT)}
                r={4}
                fill={color}
                tabIndex={0}
                role="button"
                aria-label={`${item.label}: ${point.y} at ${formatX(point.x)}`}
                onClick={() => selectPoint(point, item.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectPoint(point, item.id);
                  }
                }}
              >
                <title>{`${item.label}: ${formatValue(point.y)} at ${formatX(point.x)}`}</title>
              </circle>
            ));
          }
          const path = buildLinePath(points.map((point) => ({ ...point, x: chartX(point.x) })), xDomain, effectiveYDomain, PLOT);
          const areaPath = `${path} L${PLOT.left + PLOT.width},${scaleY(0, effectiveYDomain, PLOT)} L${PLOT.left},${scaleY(0, effectiveYDomain, PLOT)} Z`;
          return (
            <g key={item.id}>
              {kind === 'area' && <path d={areaPath} fill={color} fillOpacity={0.16} />}
              <path d={path} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
              {points.map((point, pointIndex) => (
                <circle
                  key={`${item.id}-${pointIndex}`}
                  cx={scaleX(chartX(point.x), xDomain, PLOT)}
                  cy={scaleY(point.y, effectiveYDomain, PLOT)}
                  r={points.length > 200 ? 1.5 : 3}
                  fill={color}
                  tabIndex={points.length <= 200 ? 0 : undefined}
                  role={points.length <= 200 ? 'button' : undefined}
                  aria-label={points.length <= 200 ? `${item.label}: ${point.y} at ${formatX(point.x)}` : undefined}
                  onClick={points.length <= 200 ? () => selectPoint(point, item.id) : undefined}
                  onKeyDown={points.length <= 200 ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      selectPoint(point, item.id);
                    }
                  } : undefined}
                >
                  {points.length <= 200 && <title>{`${item.label}: ${formatValue(point.y)} at ${formatX(point.x)}`}</title>}
                </circle>
              ))}
            </g>
          );
        })}

        {thresholds.map((threshold) => {
          const y = scaleY(threshold.value, effectiveYDomain, PLOT);
          return (
            <g key={threshold.id}>
              <line x1={PLOT.left} x2={PLOT.left + PLOT.width} y1={y} y2={y} stroke={threshold.color ?? 'var(--ds-color-error-text, #b91c1c)'} strokeDasharray="6 4">
                <title>{threshold.description ?? threshold.label}</title>
              </line>
              <text x={PLOT.left + PLOT.width - 4} y={y - 4} textAnchor="end" className="chart-annotation-label">{threshold.label}: {formatValue(threshold.value)}</text>
            </g>
          );
        })}

        {annotations.map((annotation) => {
          const x = scaleX(chartX(annotation.x), xDomain, PLOT);
          return (
            <g key={annotation.id}>
              <line x1={x} x2={x} y1={PLOT.top} y2={PLOT.top + PLOT.height} stroke={annotation.color ?? 'var(--ds-color-warning-text, #854d0e)'} strokeDasharray="3 3" />
              <text x={x + 4} y={PLOT.top + 12} className="chart-annotation-label">
                <title>{annotation.description ?? annotation.label}</title>
                {annotation.label}
              </text>
            </g>
          );
        })}

        {cursorX !== null && <line x1={cursorX} x2={cursorX} y1={PLOT.top} y2={PLOT.top + PLOT.height} className="chart-crosshair" />}
      </svg>

      {hoveredPoint && (
        <div className="chart-hover-tooltip" role="tooltip">
          <ChartTooltip point={hoveredPoint.point} seriesLabel={hoveredPoint.label} formatValue={formatValue} />
        </div>
      )}
      <div className="chart-interactions">
        <label>
          Zoom start
          <input type="range" min={0} max={lastIndex} value={brushStart} onChange={(event) => setBrushStart(Number(event.target.value))} />
        </label>
        <label>
          Zoom end
          <input
            type="range"
            min={0}
            max={lastIndex}
            value={brushEnd ?? lastIndex}
            onChange={(event) => setBrushEnd(Number(event.target.value))}
          />
        </label>
        <button type="button" onClick={() => { setBrushStart(0); setBrushEnd(null); }}>Reset zoom</button>
        {brushEnd !== null && (
          <>
            <button type="button" onClick={() => pan(-1)} disabled={rangeStart === 0}>Pan left</button>
            <button type="button" onClick={() => pan(1)} disabled={rangeEnd === lastIndex}>Pan right</button>
          </>
        )}
        {selectedRange && (
          <button type="button" onClick={() => { onRangeSelect?.(selectedRange); onDrillDown?.(selectedRange); }}>
            Drill into selected range
          </button>
        )}
      </div>
      {exportError && <p className="chart-export-error" role="alert">{exportError}</p>}
      <p className="chart-sr-only" aria-live="polite">
        {selectedPoint ? `${firstSource?.series.label}, ${selectedPoint.y} at ${formatX(selectedPoint.x)}. Use arrow keys to navigate points and Enter to select.` : 'No chart data.'}
      </p>

      {showDataTable && (
        <div className="chart-table-scroll">
          <table className="chart-data-table">
            <caption>{title} data</caption>
            <thead>
              <tr><th scope="col">X</th>{visibleSeries.map((item) => <th scope="col" key={item.id}>{item.label}</th>)}</tr>
            </thead>
            <tbody>
              {tableRows.map(([x, values]) => (
                <tr key={x}>
                  <th scope="row">{x}</th>
                  {visibleSeries.map((item) => <td key={item.id}>{values.get(item.id) ?? ''}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {visibleSeries.some((item) => item.data.length > 500) && <p>Showing first 500 points; export CSV for the complete data set.</p>}
        </div>
      )}
      <p className="chart-point-count">{allPoints.length.toLocaleString()} plotted points</p>
    </figure>
  );
}

export { DEFAULT_CHART_THEME };
