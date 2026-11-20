/**
 * Shared types for the virtualized data grid (#2190).
 */

export type SortDirection = 'asc' | 'desc' | 'none';

export interface SortState<TField = string> {
  field: TField;
  direction: SortDirection;
}

export type FilterState = Record<string, unknown>;

export type Align = 'left' | 'right' | 'center';

export interface ColumnDef<T = unknown> {
  id: string;
  header: string;
  accessor: (row: T) => string | number;
  width?: number;
  align?: Align;
  sortable?: boolean;
  frozen?: boolean;
  cellRenderer?: (value: string | number, row: T) => React.ReactNode;
}

export interface VirtualizationConfig {
  rowHeight: number;
  overscan: number;
  columnOverscan: number;
  enableColumnVirtualization: boolean;
}

export interface VirtualWindowResult {
  firstIndex: number;
  lastIndex: number;
  count: number;
  totalHeight: number;
  offsetTop: number;
}

export interface ColumnVirtualWindowResult {
  firstIndex: number;
  lastIndex: number;
  visibleColumns: string[];
  totalWidth: number;
}

export interface DataGridProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  viewportHeight?: number;
  onRowClick?: (row: T) => void;
  sortState?: SortState | null;
  onSort?: (field: string) => void;
  selectedIds?: Set<string>;
  onToggleSelection?: (id: string) => void;
  getRowId: (row: T) => string;
  frozenColumnCount?: number;
  scrollResetKey?: string;
}
