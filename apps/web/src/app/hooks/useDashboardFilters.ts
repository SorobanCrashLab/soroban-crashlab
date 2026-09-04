/**
 * useDashboardFilters Hook
 *
 * Syncs dashboard filter state with URL query parameters for shareable filter states.
 * Provides a centralized way to manage complex dashboard filters with URL persistence.
 *
 * Issue: #645 - Sync dashboard filters to URL params
 */

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RunStatus, RunArea, RunSeverity } from "../types";
import { parseRunStatus } from "../../lib/run-status";

export interface DashboardFilters {
  status: RunStatus[];
  area: RunArea[];
  severity: RunSeverity[];
  dateRange: {
    start: string;
    end: string;
  };
  durationRange: {
    min: number;
    max: number;
  };
  resourceFeeRange: {
    min: number;
    max: number;
  };
  hasCrash: boolean | null;
}

const DEFAULT_FILTERS: DashboardFilters = {
  status: [],
  area: [],
  severity: [],
  dateRange: {
    start: "",
    end: "",
  },
  durationRange: {
    min: 0,
    max: 0,
  },
  resourceFeeRange: {
    min: 0,
    max: 0,
  },
  hasCrash: null,
};

/**
 * Parse URL search params into DashboardFilters
 */
function parseFiltersFromURL(searchParams: URLSearchParams): DashboardFilters {
  const filters: DashboardFilters = { ...DEFAULT_FILTERS };

  // Parse multi-select arrays
  const statusParam = searchParams.get("filter_status");
  if (statusParam) {
    filters.status = statusParam
      .split(",")
      .map(parseRunStatus)
      .filter((s): s is RunStatus => s !== null);
  }

  const areaParam = searchParams.get("filter_area");
  if (areaParam) {
    filters.area = areaParam
      .split(",")
      .filter((a) =>
        ["auth", "state", "budget", "xdr"].includes(a),
      ) as RunArea[];
  }

  const severityParam = searchParams.get("filter_severity");
  if (severityParam) {
    filters.severity = severityParam
      .split(",")
      .filter((s) =>
        ["low", "medium", "high", "critical"].includes(s),
      ) as RunSeverity[];
  }

  // Parse date range
  const dateStart = searchParams.get("filter_date_start");
  const dateEnd = searchParams.get("filter_date_end");
  if (dateStart) filters.dateRange.start = dateStart;
  if (dateEnd) filters.dateRange.end = dateEnd;

  // Parse duration range
  const durationMin = searchParams.get("filter_duration_min");
  const durationMax = searchParams.get("filter_duration_max");
  if (durationMin) {
    const parsed = Number.parseInt(durationMin, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      filters.durationRange.min = parsed;
    }
  }
  if (durationMax) {
    const parsed = Number.parseInt(durationMax, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      filters.durationRange.max = parsed;
    }
  }

  // Parse resource fee range
  const feeMin = searchParams.get("filter_fee_min");
  const feeMax = searchParams.get("filter_fee_max");
  if (feeMin) {
    const parsed = Number.parseInt(feeMin, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      filters.resourceFeeRange.min = parsed;
    }
  }
  if (feeMax) {
    const parsed = Number.parseInt(feeMax, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      filters.resourceFeeRange.max = parsed;
    }
  }

  // Parse hasCrash tri-state
  const hasCrashParam = searchParams.get("filter_has_crash");
  if (hasCrashParam === "true") {
    filters.hasCrash = true;
  } else if (hasCrashParam === "false") {
    filters.hasCrash = false;
  }

  return filters;
}

/**
 * Serialize DashboardFilters to URL search params
 */
function serializeFiltersToURL(
  filters: DashboardFilters,
): Record<string, string | null> {
  const params: Record<string, string | null> = {};

  // Serialize multi-select arrays
  if (filters.status.length > 0) {
    params.filter_status = filters.status.join(",");
  } else {
    params.filter_status = null;
  }

  if (filters.area.length > 0) {
    params.filter_area = filters.area.join(",");
  } else {
    params.filter_area = null;
  }

  if (filters.severity.length > 0) {
    params.filter_severity = filters.severity.join(",");
  } else {
    params.filter_severity = null;
  }

  // Serialize date range
  params.filter_date_start = filters.dateRange.start || null;
  params.filter_date_end = filters.dateRange.end || null;

  // Serialize duration range
  params.filter_duration_min =
    filters.durationRange.min > 0 ? String(filters.durationRange.min) : null;
  params.filter_duration_max =
    filters.durationRange.max > 0 ? String(filters.durationRange.max) : null;

  // Serialize resource fee range
  params.filter_fee_min =
    filters.resourceFeeRange.min > 0
      ? String(filters.resourceFeeRange.min)
      : null;
  params.filter_fee_max =
    filters.resourceFeeRange.max > 0
      ? String(filters.resourceFeeRange.max)
      : null;

  // Serialize hasCrash tri-state
  if (filters.hasCrash === true) {
    params.filter_has_crash = "true";
  } else if (filters.hasCrash === false) {
    params.filter_has_crash = "false";
  } else {
    params.filter_has_crash = null;
  }

  return params;
}

/**
 * Hook to manage dashboard filters with URL synchronization
 */
export function useDashboardFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Parse current filters from URL
  const filters = useMemo(() => {
    return parseFiltersFromURL(searchParams);
  }, [searchParams]);

  // Update filters and sync to URL
  const setFilters = useCallback(
    (updates: Partial<DashboardFilters>) => {
      const currentFilters = parseFiltersFromURL(searchParams);
      const newFilters = { ...currentFilters, ...updates };
      const serialized = serializeFiltersToURL(newFilters);

      const nextParams = new URLSearchParams(searchParams.toString());

      // Apply all filter updates
      Object.entries(serialized).forEach(([key, value]) => {
        if (value === null) {
          nextParams.delete(key);
        } else {
          nextParams.set(key, value);
        }
      });

      // Build new URL
      const query = nextParams.toString();
      const nextUrl = query ? `${pathname}?${query}` : pathname;

      router.replace(nextUrl, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Reset all filters
  const resetFilters = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams.toString());

    // Remove all filter params
    const filterKeys = [
      "filter_status",
      "filter_area",
      "filter_severity",
      "filter_date_start",
      "filter_date_end",
      "filter_duration_min",
      "filter_duration_max",
      "filter_fee_min",
      "filter_fee_max",
      "filter_has_crash",
    ];

    filterKeys.forEach((key) => nextParams.delete(key));

    const query = nextParams.toString();
    const nextUrl = query ? `${pathname}?${query}` : pathname;

    router.replace(nextUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      filters.status.length > 0 ||
      filters.area.length > 0 ||
      filters.severity.length > 0 ||
      filters.dateRange.start !== "" ||
      filters.dateRange.end !== "" ||
      filters.durationRange.min > 0 ||
      filters.durationRange.max > 0 ||
      filters.resourceFeeRange.min > 0 ||
      filters.resourceFeeRange.max > 0 ||
      filters.hasCrash !== null
    );
  }, [filters]);

  return {
    filters,
    setFilters,
    resetFilters,
    hasActiveFilters,
  };
}
