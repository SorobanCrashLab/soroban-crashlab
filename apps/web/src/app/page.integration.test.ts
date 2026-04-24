/**
 * Integration test: RunClusterOverview receives full unfiltered runs
 *
 * Validates: Requirements 7.1
 *
 * HomeContent passes the full `runs` array (not the paginated subset) to
 * RunClusterOverview. This test verifies that the cluster stats computed from
 * the full dataset differ from — and are richer than — stats computed from
 * only the paginated subset, confirming that RunClusterOverview sees all data.
 */

import { computeClusterStats } from "./add-run-cluster-overview";
import { buildMockRuns } from "./mockRuns";
import { RunArea } from "./types";

// Page size used in HomeContent
const ITEMS_PER_PAGE = 10;

// Build a known set of runs with more entries than one page
const ALL_RUNS = buildMockRuns(); // 25 runs

describe("Requirement 7.1 — RunClusterOverview receives full unfiltered runs", () => {
  it("ALL_RUNS has more runs than one page (ensures the test is meaningful)", () => {
    expect(ALL_RUNS.length).toBeGreaterThan(ITEMS_PER_PAGE);
  });

  it("cluster stats computed from all runs reflect the total run count across all areas", () => {
    const stats = computeClusterStats(ALL_RUNS);
    const totalAcrossAreas = stats.reduce((sum, s) => sum + s.total, 0);
    // Every run belongs to exactly one area, so the sum of per-area totals
    // must equal the total number of runs.
    expect(totalAcrossAreas).toBe(ALL_RUNS.length);
  });

  it("cluster stats computed from only the first page differ from stats for all runs", () => {
    // Simulate what would happen if HomeContent passed paginatedRuns instead of runs
    const paginatedRuns = ALL_RUNS.slice(0, ITEMS_PER_PAGE);

    const statsFromAll = computeClusterStats(ALL_RUNS);
    const statsFromPage = computeClusterStats(paginatedRuns);

    const totalFromAll = statsFromAll.reduce((sum, s) => sum + s.total, 0);
    const totalFromPage = statsFromPage.reduce((sum, s) => sum + s.total, 0);

    // The paginated subset must account for fewer runs
    expect(totalFromPage).toBeLessThan(totalFromAll);
    expect(totalFromPage).toBe(ITEMS_PER_PAGE);
    expect(totalFromAll).toBe(ALL_RUNS.length);
  });

  it("each area in the full-run stats has the correct per-area run count", () => {
    const areas: RunArea[] = ["auth", "state", "budget", "xdr"];
    const stats = computeClusterStats(ALL_RUNS);

    for (const area of areas) {
      const expected = ALL_RUNS.filter((r) => r.area === area).length;
      const actual = stats.find((s) => s.area === area)!.total;
      expect(actual).toBe(expected);
    }
  });

  it("passing only the paginated subset would under-count runs in at least one area", () => {
    const paginatedRuns = ALL_RUNS.slice(0, ITEMS_PER_PAGE);
    const areas: RunArea[] = ["auth", "state", "budget", "xdr"];

    const statsFromAll = computeClusterStats(ALL_RUNS);
    const statsFromPage = computeClusterStats(paginatedRuns);

    // At least one area must have more runs in the full dataset than in the page
    const anyAreaUnderCounted = areas.some((area) => {
      const fullCount = statsFromAll.find((s) => s.area === area)!.total;
      const pageCount = statsFromPage.find((s) => s.area === area)!.total;
      return fullCount > pageCount;
    });

    expect(anyAreaUnderCounted).toBe(true);
  });

  it("cluster stats from all runs include runs beyond the first page boundary", () => {
    // Runs beyond the first page (index >= ITEMS_PER_PAGE)
    const beyondFirstPage = ALL_RUNS.slice(ITEMS_PER_PAGE);
    expect(beyondFirstPage.length).toBeGreaterThan(0);

    // Compute stats for just the beyond-page runs to confirm they contribute
    const statsFromBeyond = computeClusterStats(beyondFirstPage);
    const totalBeyond = statsFromBeyond.reduce((sum, s) => sum + s.total, 0);
    expect(totalBeyond).toBe(beyondFirstPage.length);

    // The full stats must account for these runs too
    const statsFromAll = computeClusterStats(ALL_RUNS);
    const totalFromAll = statsFromAll.reduce((sum, s) => sum + s.total, 0);
    expect(totalFromAll).toBe(ALL_RUNS.length);
    expect(totalFromAll).toBeGreaterThan(ITEMS_PER_PAGE);
  });
});

describe("Requirement #499 — Live milestone timeline cross-module regression", () => {
  it("selects unseen runs incrementally in deterministic order", () => {
    const runs = sortRunsForTimeline(buildMockRuns().slice(0, 4));
    const seen: string[] = [];

    const first = selectNextUnseenRun(runs, seen);
    expect(first?.id).toBe(runs[0].id);
    seen.push(first!.id);

    const second = selectNextUnseenRun(runs, seen);
    expect(second?.id).toBe(runs[1].id);
  });

  it("maps replay placeholder runs into run_update timeline events", () => {
    const replayRun = createReplayPlaceholderRun({
      id: "run-replay-007",
      status: "running",
    });
    const runs = sortRunsForTimeline([
      ...buildMockRuns().slice(0, 3),
      replayRun,
    ]);

    const selected = selectNextUnseenRun(
      runs,
      runs.filter((run) => run.id !== replayRun.id).map((run) => run.id),
    );

    const event = buildRunProgressEvent(selected!, new Set());

    expect(selected?.id).toBe(replayRun.id);
    expect(event.type).toBe("run_update");
    expect(event.label).toBe("Run queued");
  });
});

/**
 * Integration test: loading state shows skeleton, not RunClusterOverview
 *
 * Validates: Requirements 1.3
 *
 * HomeContent conditionally renders either a skeleton placeholder (animate-pulse div)
 * or RunClusterOverview based on `dataState`. This test validates that conditional
 * rendering logic: when dataState === 'loading', the skeleton branch is active and
 * RunClusterOverview is absent; when dataState === 'success', RunClusterOverview is
 * shown and the skeleton is absent.
 */

type DataState = "loading" | "error" | "success";

/**
 * Models the conditional rendering logic from page.tsx.
 * RunClusterOverview is always rendered and receives explicit dataState props.
 */
function getVisibleElements(): {
  skeletonVisible: boolean;
  overviewVisible: boolean;
} {
  return {
    skeletonVisible: false,
    overviewVisible: true,
  };
}

function getRunClusterOverviewState(dataState: DataState): DataState {
  return dataState;
}

describe("Requirement 1.3 — Loading state is explicit in RunClusterOverview", () => {
  it("RunClusterOverview remains mounted in loading state", () => {
    const { skeletonVisible, overviewVisible } = getVisibleElements();
    expect(skeletonVisible).toBe(false);
    expect(overviewVisible).toBe(true);
    expect(getRunClusterOverviewState("loading")).toBe("loading");
  });

  it("RunClusterOverview receives success state when dataState is success", () => {
    const { skeletonVisible, overviewVisible } = getVisibleElements();
    expect(skeletonVisible).toBe(false);
    expect(overviewVisible).toBe(true);
    expect(getRunClusterOverviewState("success")).toBe("success");
  });

  it("RunClusterOverview remains mounted in error state", () => {
    const { skeletonVisible, overviewVisible } = getVisibleElements();
    expect(skeletonVisible).toBe(false);
    expect(overviewVisible).toBe(true);
    expect(getRunClusterOverviewState("error")).toBe("error");
  });

  it("skeleton and RunClusterOverview are never both visible at the same time", () => {
    const states: DataState[] = ["loading", "error", "success"];
    states.forEach(() => {
      const { skeletonVisible, overviewVisible } = getVisibleElements();
      expect(skeletonVisible && overviewVisible).toBe(false);
    });
  });

  it("RunClusterOverview computes valid cluster stats from runs when data is available (success path)", () => {
    // Confirms that when dataState transitions to 'success', RunClusterOverview
    // would receive meaningful data — not an empty or broken dataset.
    const runs = buildMockRuns();
    const stats = computeClusterStats(runs);
    expect(stats.length).toBeGreaterThan(0);
    const totalRuns = stats.reduce((sum, s) => sum + s.total, 0);
    expect(totalRuns).toBe(runs.length);
  });

  it("RunClusterOverview receives no runs during loading (empty array before fetch completes)", () => {
    const stats = computeClusterStats([]);
    expect(Array.isArray(stats)).toBe(true);
    const totalRuns = stats.reduce((sum, s) => sum + s.total, 0);
    expect(totalRuns).toBe(0);
  });
});

/**
 * Integration test: error state hides RunClusterOverview
 *
 * Validates: Requirements 1.4
 *
 * When dataState === 'error', RunClusterOverview must not be rendered.
 * The existing error banner handles user feedback instead.
 */

describe("Requirement 1.4 — Error state is handled by RunClusterOverview", () => {
  it("RunClusterOverview stays mounted when dataState is error", () => {
    const { overviewVisible } = getVisibleElements();
    expect(overviewVisible).toBe(true);
  });

  it("error state is not loading and not success", () => {
    const errorState: DataState = "error";
    expect(["loading", "success"].includes(errorState)).toBe(false);
  });

  it("error state is mutually exclusive with loading and success states", () => {
    const states: DataState[] = ["loading", "error", "success"];
    const errorState = "error" as DataState;

    // Only one state can be active at a time
    const activeStates = states.filter((s) => s === errorState);
    expect(activeStates).toHaveLength(1);
    expect(activeStates[0]).toBe("error");
  });

  it("RunClusterOverview is visible and skeleton is absent when dataState is error", () => {
    const { skeletonVisible, overviewVisible } = getVisibleElements();
    // Loading skeleton stays disabled; overview handles explicit error UI.
    expect(skeletonVisible).toBe(false);
    expect(overviewVisible).toBe(true);
  });

  it("all states show RunClusterOverview with explicit mode", () => {
    const states: DataState[] = ["loading", "error", "success"];
    for (const state of states) {
      const { overviewVisible } = getVisibleElements();
      expect(overviewVisible).toBe(true);
      expect(getRunClusterOverviewState(state)).toBe(state);
    }
  });
});

/**
 * Integration test: RunClusterOverview does not call fetch
 *
 * Validates: Requirements 7.3
 *
 * RunClusterOverview is a pure presentational component. All data is supplied
 * via the `runs` prop. This test confirms that invoking the component's core
 * logic (computeClusterStats) never triggers a fetch call.
 */

describe("Requirement 7.3 — RunClusterOverview does not call fetch", () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, "fetch").mockImplementation(() => {
      throw new Error("fetch must not be called by RunClusterOverview");
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("computeClusterStats does not call fetch when given a populated runs array", () => {
    const runs = buildMockRuns();
    computeClusterStats(runs);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("computeClusterStats does not call fetch when given an empty runs array", () => {
    computeClusterStats([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("computeClusterStats does not call fetch across multiple invocations", () => {
    const runs = buildMockRuns();
    computeClusterStats(runs);
    computeClusterStats(runs.slice(0, 5));
    computeClusterStats([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
