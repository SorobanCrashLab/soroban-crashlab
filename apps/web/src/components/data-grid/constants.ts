/**
 * Configuration constants for the virtualized data grid (#2190).
 */

export const DEFAULT_ROW_HEIGHT = 57;
export const DEFAULT_OVERSCAN = 3;
export const DEFAULT_COLUMN_OVERSCAN = 2;
export const FROZEN_COLUMN_COUNT = 3;
export const MAX_VISIBLE_COLUMNS = 40;
export const DEFAULT_VIEWPORT_HEIGHT = 480;
export const COLUMN_RESIZE_STORAGE_KEY = 'crashlab:column-widths:v1';
export const MEMORY_LEAK_THRESHOLD = 5_000_000; // 5MB
export const WORKER_FALLBACK_THRESHOLD = 10_000; // rows above which Worker is preferred
