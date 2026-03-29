'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { CrashTrendPoint } from '../types';

export interface CrashTrendChartProps {
  /** Chart data points (one per day with signature counts) */
  data: CrashTrendPoint[];
  /** Signatures to display as area series */
  selectedSignatures: string[];
  /** Optional loading state */
  isLoading?: boolean;
}

/** Distinct colors for signature series. Based on Tailwind palette for consistency. */
const SIGNATURE_COLORS = [
  '#3b82f6', // blue-500
  '#ef4444', // red-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#14b8a6', // teal-500
  '#6366f1', // indigo-500
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
}: CrashTrendChartProps) {
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
            style={{ fontSize: '12px' }}
          />

          {/* Y-axis: frequency count */}
          <YAxis
            stroke="var(--axis-stroke, #6b7280)"
            className="dark:stroke-zinc-600"
            style={{ fontSize: '12px' }}
          />

          {/* Tooltip on hover */}
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--tooltip-bg, white)',
              border: '1px solid var(--tooltip-border, #e5e7eb)',
              borderRadius: '0.375rem',
              padding: '0.75rem',
            }}
            cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
          />

          {/* Legend: show which color = which signature */}
          <Legend wrapperStyle={{ paddingTop: '20px' }} />

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
        </AreaChart>
      </ResponsiveContainer>

      {/* Chart footer with helper text */}
      <div className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        <p>
          Showing {selectedSignatures.length} signature{selectedSignatures.length === 1 ? '' : 's'} across {data.length} day{data.length === 1 ? '' : 's'}
        </p>
      </div>
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
