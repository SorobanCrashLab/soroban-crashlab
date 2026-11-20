'use client';

import { memo, useState, useCallback, useRef, useEffect } from 'react';

interface ValueAutocompleteProps {
  value: string | number | boolean | string[];
  onChange: (value: string | number | boolean | string[]) => void;
  suggestions?: string[];
  disabled?: boolean;
}

function ValueAutocompleteBase({ value, onChange, suggestions = [], disabled }: ValueAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(String(value));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearch(String(value));
  }, [value]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const filtered = suggestions.filter((s) =>
    s.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSelect = useCallback(
    (s: string) => {
      onChange(s);
      setSearch(s);
      setIsOpen(false);
    },
    [onChange],
  );

  const showSuggestions = suggestions.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={search}
        disabled={disabled}
        onChange={(e) => {
          setSearch(e.target.value);
          onChange(e.target.value);
        }}
        onFocus={() => showSuggestions && setIsOpen(true)}
        placeholder="Value..."
        className="w-full px-2 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        aria-label="Filter value"
        role={showSuggestions ? 'combobox' : undefined}
        aria-expanded={showSuggestions ? isOpen : undefined}
        aria-autocomplete={showSuggestions ? 'list' : undefined}
      />
      {isOpen && showSuggestions && filtered.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md shadow-lg max-h-48 overflow-auto"
        >
          {filtered.map((s) => (
            <li
              key={s}
              role="option"
              aria-selected={s === value}
              onClick={() => handleSelect(s)}
              className="px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer"
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const ValueAutocomplete = memo(ValueAutocompleteBase);
