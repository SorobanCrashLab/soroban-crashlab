import { safeStorage } from "../lib/local-storage";

export interface FilterPreset {
  id: string;
  name: string;
  description: string;
  filters: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export const PRESETS_STORAGE_KEY = 'crashlab:saved-filter-presets:v1';

export function readPresets(): FilterPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = safeStorage.getItem(PRESETS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FilterPreset[]) : [];
  } catch {
    return [];
  }
}

export function savePresets(presets: FilterPreset[]): boolean {
  try {
    safeStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
    return true;
  } catch {
    return false;
  }
}

export function generatePresetId(): string {
  return `preset-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function createPreset(
  name: string,
  description: string,
  filters: Record<string, string>,
): FilterPreset {
  const now = new Date().toISOString();
  return {
    id: generatePresetId(),
    name,
    description,
    filters,
    createdAt: now,
    updatedAt: now,
  };
}

export function serializeFiltersToUrl(filters: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    params.set(key, value);
  }
  return params.toString();
}

export function deserializeFiltersFromUrl(search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  const filters: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    filters[key] = value;
  }
  return filters;
}

export function buildShareUrl(filters: Record<string, string>): string {
  if (typeof window === 'undefined') return '';
  const base = `${window.location.origin}${window.location.pathname}`;
  const qs = serializeFiltersToUrl(filters);
  return qs ? `${base}?${qs}` : base;
}

export function exportPresetAsJson(preset: FilterPreset): string {
  return JSON.stringify(preset, null, 2);
}

export function importPresetFromJson(json: string): FilterPreset | null {
  try {
    const data = JSON.parse(json) as FilterPreset;
    if (
      typeof data.name === 'string' &&
      typeof data.filters === 'object' &&
      !Array.isArray(data.filters)
    ) {
      return {
        ...data,
        id: generatePresetId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}
