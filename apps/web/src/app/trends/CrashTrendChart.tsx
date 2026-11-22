"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceDot,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { CrashTrendPoint } from "../types";
import {
  AnomalyFlag,
  explainAnomaly,
  indexFlagsByDate,
} from "../utils/trendAnomaly";

/** Colour used for anomaly markers in both themes (rose-500). */
const ANOMALY_COLOR = "#f43f5e";

export interface CrashTrendChartProps {
  /** Chart data points (one per day with signature counts) */
  data: CrashTrendPoint[];
  /** Signatures to display as area series */
  selectedSignatures: string[];
  /** Optional loading state */
  isLoading?: boolean;
  /** Statistically flagged days to mark on the chart */
  anomalyFlags?: AnomalyFlag[];
}

/** Distinct colors for signature series. Based on Tailwind palette for consistency. */
const SIGNATURE_COLORS = [
  "#3b82f6", // blue-500
  "#ef4444", // red-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
  "#14b8a6", // teal-500
  "#6366f1", // indigo-500
];

/**
 * Get a consistent color for a signature.
 * Colors cycle through the palette if more than 10 signatures.
 */
function getSignatureColor(signature: string, index: number): string {
  return SIGNATURE_COLORS[index % SIGNATURE_COLORS.length];
}

/**
 * Area chart component displaying crash signature frequency trends over time.
 * Supports dark mode, responsive scaling, and interactive legends.
 */
export function CrashTrendChart({
  data,
  selectedSignatures,
  isLoading = false,
  anomalyFlags = [],
}: CrashTrendChartProps) {
  const flagsByDate = indexFlagsByDate(anomalyFlags);
  if (isLoading) {
    return (
      <div className="w-full h-96 flex items-center justify-center bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg">
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          Loading chart data...
        </div>
      </div>
    );
  }

  if (data.length === 0 || selectedSignatures.length === 0) {
    return (
      <div className="w-full h-96 flex items-center justify-center bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg">
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            No data to display
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Select at least one signature to display trends
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
      <ResponsiveContainer width="100%" height={400}>
        <AreaChart
          data={data}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <defs>
            {/* Gradient definitions for each area series */}
            {selectedSignatures.map((sig, idx) => {
              const color = getSignatureColor(sig, idx);
              return (
                <linearGradient
                  key={`gradient-${sig}`}
                  id={`gradient-${sig}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor={color} stopOpacity={0.7} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.1} />
                </linearGradient>
              );
            })}
          </defs>

          {/* Grid */}
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--grid-stroke, #e5e7eb)"
            className="dark:stroke-zinc-800"
          />

          {/* X-axis: dates */}
          <XAxis
            dataKey="date"
            stroke="var(--axis-stroke, #6b7280)"
            className="dark:stroke-zinc-600"
            style={{ fontSize: "12px" }}
          />

          {/* Y-axis: frequency count */}
          <YAxis
            stroke="var(--axis-stroke, #6b7280)"
            className="dark:stroke-zinc-600"
            style={{ fontSize: "12px" }}
          />

          {/* Tooltip on hover — extended with the anomaly explanation card */}
          <Tooltip
            position={{ x: -120, y: 10 }}
            content={<TrendTooltip flagsByDate={flagsByDate} />}
            cursor={{ fill: "rgba(0, 0, 0, 0.05)" }}
          />

          {/* Legend: show which color = which signature */}
          <Legend wrapperStyle={{ paddingTop: "20px" }} />

          {/* Area series for each selected signature */}
          {selectedSignatures.map((sig, idx) => {
            const color = getSignatureColor(sig, idx);
            return (
              <Area
                key={sig}
                type="monotone"
                dataKey={sig}
                stroke={color}
                fill={`url(#gradient-${sig})`}
                name={truncateSignature(sig, 20)}
                isAnimationActive={false}
              />
            );
          })}

          {/* Anomaly marker layer: statistically flagged days.
              Markers are anchored at the day's tallest plotted series so they
              sit on the data, while the statistics themselves are computed on
              the day's total crash rate (see the hover card). */}
          {anomalyFlags.map((flag) => {
            const markerY = markerYForDate(data, flag.date, selectedSignatures);
            if (markerY === null) return null;
            return (
              <ReferenceDot
                key={`anomaly-${flag.date}`}
                x={flag.date}
                y={markerY}
                r={6}
                fill={ANOMALY_COLOR}
                stroke="#ffffff"
                strokeWidth={2}
                ifOverflow="extendDomain"
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>

      {/* Chart footer with helper text */}
      <div className="mt-4 space-y-2 text-xs text-zinc-500 dark:text-zinc-400">
        <p>
          Showing {selectedSignatures.length} signature
          {selectedSignatures.length === 1 ? "" : "s"} across {data.length} day
          {data.length === 1 ? "" : "s"}
        </p>

        {/* Anomaly legend entry — the marker layer is not part of the
            series legend, so it is labelled explicitly here. */}
        {anomalyFlags.length > 0 && (
          <p className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-zinc-950"
              style={{ backgroundColor: ANOMALY_COLOR }}
            />
            <span>
              Anomaly — day exceeded {anomalyFlags[0].k}× the robust deviation
              of its trailing {anomalyFlags[0].windowSize}-day baseline. Hover a
              marked day for the full explanation.
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Y position for a day's anomaly marker: the tallest plotted signature value
 * for that date. Returns null when the date is not present in the data.
 */
function markerYForDate(
  data: CrashTrendPoint[],
  date: string,
  selectedSignatures: string[],
): number | null {
  const point = data.find((p) => p.date === date);
  if (!point) return null;

  let max = 0;
  for (const sig of selectedSignatures) {
    const value = point[sig];
    if (typeof value === "number" && value > max) {
      max = value;
    }
  }
  return max;
}

interface TooltipEntry {
  name?: string | number;
  value?: string | number;
  color?: string;
}

interface TrendTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  flagsByDate: Map<string, AnomalyFlag>;
}

/**
 * Hover card for the trend chart.
 *
 * Shows the per-signature counts for the hovered day and, when that day was
 * flagged, a plain-language sentence generated from the detector's numbers
 * (baseline, deviation and z-like score).
 */
function TrendTooltip({
  active,
  payload,
  label,
  flagsByDate,
}: TrendTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const date = String(label ?? "");
  const flag = flagsByDate.get(date);

  return (
    <div className="max-w-xs rounded-md border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      <p className="mb-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
        {date}
      </p>

      <ul className="space-y-0.5">
        {payload.map((entry, idx) => (
          <li
            key={`${entry.name}-${idx}`}
            className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300"
          >
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-sm"
              style={{ backgroundColor: entry.color }}
            />
            <span className="truncate">{entry.name}</span>
            <span className="ml-auto font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
              {entry.value}
            </span>
          </li>
        ))}
      </ul>

      {flag && (
        <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
          <p
            className="mb-1 text-xs font-semibold"
            style={{ color: ANOMALY_COLOR }}
          >
            {flag.direction === "spike" ? "Anomalous spike" : "Anomalous drop"}
          </p>
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
            {explainAnomaly(flag)}
          </p>
          <dl className="mt-1.5 grid grid-cols-3 gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            <div>
              <dt className="uppercase tracking-wide">Baseline</dt>
              <dd className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                {flag.baseline}
              </dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide">Deviation</dt>
              <dd className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                ±{flag.deviation}
              </dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide">Score</dt>
              <dd className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                {flag.score}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

/**
 * Truncate signature display for readability in legend.
 * Shows beginning and end with ellipsis in middle if too long.
 */
function truncateSignature(sig: string, maxLen: number): string {
  if (sig.length <= maxLen) return sig;
  const start = sig.substring(0, maxLen / 2 - 1);
  const end = sig.substring(sig.length - maxLen / 2);
  return `${start}…${end}`;
}
