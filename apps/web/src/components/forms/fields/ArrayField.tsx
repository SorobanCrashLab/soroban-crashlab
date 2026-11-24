// WIP scaffold for issue #2278. Reordering/drag-drop not implemented yet.
"use client";

import type { ReactNode } from "react";

export function ArrayField<T>({
  items,
  renderItem,
  onAdd,
  onRemove,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="array-field">
      {items.map((item, index) => (
        <div key={index} className="array-field__row">
          {renderItem(item, index)}
          <button type="button" onClick={() => onRemove(index)} aria-label={`Remove item ${index + 1}`}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={onAdd}>
        Add item
      </button>
    </div>
  );
}
