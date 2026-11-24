'use client';

/**
 * WCAG 2.2 AA tab pattern (#2259): roving tabindex, arrow-key navigation,
 * Home/End support, `aria-controls`/`aria-labelledby` pairing and a single tab
 * stop. Used by the run workspace and campaign console composites.
 */

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { nextRovingIndex } from '@/lib/a11y/wcag22';

export interface AccessibleTabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export interface AccessibleTabsProps {
  items: readonly AccessibleTabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  label: string;
}

export default function AccessibleTabs({ items, activeId, onSelect, label }: AccessibleTabsProps) {
  const baseId = useId();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeIndex = items.findIndex((item) => item.id === activeId);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'] as const;
    if (!keys.includes(event.key as (typeof keys)[number])) return;
    event.preventDefault();
    const next = nextRovingIndex(items.length, activeIndex, event.key as (typeof keys)[number]);
    if (next < 0) return;
    const id = items[next].id;
    onSelect(id);
    tabRefs.current[id]?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label={label} onKeyDown={handleKeyDown} className="flex flex-wrap gap-1">
        {items.map((item) => (
          <button
            key={item.id}
            ref={(element) => { tabRefs.current[item.id] = element; }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${item.id}`}
            aria-controls={`${baseId}-panel-${item.id}`}
            aria-selected={item.id === activeId}
            tabIndex={item.id === activeId ? 0 : -1}
            onClick={() => onSelect(item.id)}
            className="min-h-11 min-w-11 rounded px-3 py-2 text-sm data-[selected=true]:bg-blue-600"
            data-selected={item.id === activeId}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item) => (
        <section
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== activeId}
          tabIndex={0}
          className="mt-3"
        >
          {item.content}
        </section>
      ))}
    </div>
  );
}
