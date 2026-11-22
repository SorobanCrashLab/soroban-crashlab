"use client";

export interface LegendItem {
  id: string;
  label: string;
  color: string;
  unit?: string;
  hidden?: boolean;
}

/** Accessible legend: each entry is a toggle button (aria-pressed). */
export default function ChartLegend({
  items,
  onToggle,
}: {
  items: LegendItem[];
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Chart series">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            aria-pressed={!item.hidden}
            onClick={() => onToggle(item.id)}
            className="flex items-center gap-2 rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: item.hidden ? 'transparent' : item.color, border: `2px solid ${item.color}` }}
            />
            <span className={item.hidden ? 'line-through opacity-60' : ''}>
              {item.label}
              {item.unit ? ` (${item.unit})` : ''}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
