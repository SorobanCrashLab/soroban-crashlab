// WIP scaffold for issue #2279. Cursor-based paging UI only covers next/prev, no page jump.
"use client";

export function DataTablePagination({
  hasNext,
  hasPrevious,
  onNext,
  onPrevious,
}: {
  hasNext: boolean;
  hasPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
}) {
  return (
    <div aria-label="Table pagination" className="data-table-pagination">
      <button type="button" disabled={!hasPrevious} onClick={onPrevious}>
        Previous
      </button>
      <button type="button" disabled={!hasNext} onClick={onNext}>
        Next
      </button>
    </div>
  );
}
