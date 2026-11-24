export function snapToGrid(value: number, gridSize = 16): number {
  return Math.round(value / gridSize) * gridSize;
}

export function toggleSelection(selectedIds: string[], id: string, multi: boolean): string[] {
  if (!multi) return [id];
  return selectedIds.includes(id)
    ? selectedIds.filter((item) => item !== id)
    : [...selectedIds, id];
}
