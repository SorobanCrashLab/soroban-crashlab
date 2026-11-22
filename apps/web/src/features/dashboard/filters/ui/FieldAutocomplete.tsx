'use client';

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { FILTER_FIELDS, type FilterField } from '../ast/FilterAST';

interface FieldAutocompleteProps {
  value: string;
  onChange: (field: string) => void;
  disabled?: boolean;
}

function FieldAutocompleteBase({ value, onChange, disabled }: FieldAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in this hook
    setSearch(value);
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

  const filtered = FILTER_FIELDS.filter((f) =>
    f.label.toLowerCase().includes(search.toLowerCase()) ||
    f.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSelect = useCallback(
    (field: FilterField) => {
      onChange(field.name);
      setSearch(field.label);
      setIsOpen(false);
    },
    [onChange],
  );

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={search}
        disabled={disabled}
        onChange={(e) => {
          setSearch(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="Field name..."
        className="w-full px-2 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        aria-label="Filter field"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
      />
      {isOpen && filtered.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md shadow-lg max-h-48 overflow-auto"
        >
          {filtered.map((field) => (
            <li
              key={field.name}
              role="option"
              aria-selected={field.name === value}
              onClick={() => handleSelect(field)}
              className="px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer"
            >
              {field.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const FieldAutocomplete = memo(FieldAutocompleteBase);
