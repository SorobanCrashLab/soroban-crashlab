"use client";

export interface TooltipRow {
  id: string;
  label: string;
  color: string;
  value: string;
}

/** Tooltip card positioned by the parent chart (percent of chart width). */
export default function ChartTooltip({
  timestamp,
  rows,
  leftPct,
}: {
  timestamp: string;
  rows: TooltipRow[];
  leftPct: number;
}) {
  const flip = leftPct > 60;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-md border border-zinc-300 bg-white/95 p-2 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-100"
      style={flip ? { right: `${100 - leftPct + 2}%` } : { left: `${leftPct + 2}%` }}
    >
      <div className="mb-1 font-semibold">{timestamp}</div>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />
            {r.label}
          </span>
          <span className="font-mono">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
