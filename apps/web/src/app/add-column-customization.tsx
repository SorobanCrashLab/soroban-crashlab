'use client';

import { useState, useEffect } from 'react';

export type ColumnId = 'id' | 'status' | 'duration' | 'seedCount' | 'report';

interface ColumnCustomizationProps {
  visibleColumns: ColumnId[];
  onChange: (columns: ColumnId[]) => void;
}

const ALL_COLUMNS: { id: ColumnId; label: string }[] = [
  { id: 'id', label: 'Run ID' },
  { id: 'status', label: 'Status' },
  { id: 'duration', label: 'Duration' },
  { id: 'seedCount', label: 'Seed Count' },
  { id: 'report', label: 'Report Link' },
];

const STORAGE_KEY = 'crashlab:column-settings:v1';

export default function ColumnCustomization({ visibleColumns, onChange }: ColumnCustomizationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const columnRefs = useRef<(HTMLLabelElement | null)[]>([]);

  // Load initial settings from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ColumnId[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          onChange(parsed);
        }
      } catch (e) {
        console.error('Failed to parse column settings', e);
      }
    }
  }, [onChange]);

  const toggleColumn = async (id: ColumnId) => {
    setIsLoading(true);
    let next: ColumnId[];
    if (visibleColumns.includes(id)) {
      if (visibleColumns.length > 1) {
        next = visibleColumns.filter((c) => c !== id);
      } else {
        setIsLoading(false);
        return; // Prevent hiding all columns
      }
    } else {
      // Keep order consistent with ALL_COLUMNS
      next = ALL_COLUMNS.filter(c => visibleColumns.includes(c.id) || c.id === id).map(c => c.id);
    }
    
    // Simulate save delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    onChange(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (index + 1) % ALL_COLUMNS.length;
      columnRefs.current[nextIndex]?.querySelector('input')?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (index - 1 + ALL_COLUMNS.length) % ALL_COLUMNS.length;
      columnRefs.current[prevIndex]?.querySelector('input')?.focus();
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 transition shadow-sm active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
        {isLoading ? 'Saving...' : 'Customize Columns'}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-20 p-3 animate-in fade-in zoom-in duration-150">
            <div className="text-[10px] font-bold text-zinc-400 px-3 py-2 uppercase tracking-[0.2em]">Table Configuration</div>
            <div className="mt-1 space-y-1">
              {ALL_COLUMNS.map((col, index) => (
                <label
                  key={col.id}
                  ref={el => { columnRefs.current[index] = el; }}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  className="flex items-center justify-between px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl cursor-pointer group transition-colors focus-within:bg-zinc-50 dark:focus-within:bg-zinc-800"
                >
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-100">{col.label}</span>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes(col.id)}
                    onChange={() => toggleColumn(col.id)}
                    disabled={isLoading}
                    className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 text-blue-600 focus:ring-blue-500 dark:bg-zinc-950 transition-all cursor-pointer disabled:opacity-50"
                  />
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}