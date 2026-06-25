/**
 * Pure pagination utility functions — no browser or React dependencies.
 */

export interface PaginationState {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
}

export function computeTotalPages(totalItems: number, pageSize: number): number {
  if (pageSize <= 0) throw new RangeError('pageSize must be > 0');
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function getPageSlice<T>(items: T[], page: number, pageSize: number): T[] {
  if (pageSize <= 0) throw new RangeError('pageSize must be > 0');
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), totalPages);
}

export function buildPaginationState(
  totalItems: number,
  currentPage: number,
  pageSize: number,
): PaginationState {
  const totalPages = computeTotalPages(totalItems, pageSize);
  return {
    totalItems,
    pageSize,
    totalPages,
    currentPage: clampPage(currentPage, totalPages),
  };
}
