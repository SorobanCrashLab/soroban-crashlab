import {
  getHeatClassName,
  getSeverityFilter,
  formatDelta,
  getAnnouncement,
  getCellId,
  normalizeCell,
  HEATMAP_ROWS,
  METRICS,
  LEGEND_ITEMS,
  ContractHeatmapRow,
  SelectedCell,
  MetricKey,
  SeverityFilter,
} from "./add-heatmap-interactions";

// ---------------------------------------------------------------------------
// Unit tests — getHeatClassName
// ---------------------------------------------------------------------------
describe("getHeatClassName", () => {
  it("returns emerald class for negative values (improvements)", () => {
    expect(getHeatClassName(-10)).toContain("emerald");
    expect(getHeatClassName(-1)).toContain("emerald");
  });

  it("returns amber class for values 0 to 5 (stable)", () => {
    expect(getHeatClassName(0)).toContain("amber");
    expect(getHeatClassName(3)).toContain("amber");
    expect(getHeatClassName(5)).toContain("amber");
  });

  it("returns orange class for values 6 to 20 (regression)", () => {
    expect(getHeatClassName(6)).toContain("orange");
    expect(getHeatClassName(15)).toContain("orange");
    expect(getHeatClassName(20)).toContain("orange");
  });

  it("returns rose class for values above 20 (severe)", () => {
    expect(getHeatClassName(21)).toContain("rose");
    expect(getHeatClassName(100)).toContain("rose");
  });

  it("boundary: exactly 0 is stable (amber)", () => {
    expect(getHeatClassName(0)).toContain("amber");
  });

  it("boundary: exactly 5 is still stable", () => {
    expect(getHeatClassName(5)).toContain("amber");
  });

  it("boundary: exactly 20 is still regression (orange)", () => {
    expect(getHeatClassName(20)).toContain("orange");
  });
});

// ---------------------------------------------------------------------------
// Unit tests — getSeverityFilter
// ---------------------------------------------------------------------------
describe("getSeverityFilter", () => {
  it("returns improvements for negative values", () => {
    expect(getSeverityFilter(-5)).toBe("improvements");
    expect(getSeverityFilter(-1)).toBe("improvements");
  });

  it("returns stable for values 0 to 5", () => {
    expect(getSeverityFilter(0)).toBe("stable");
    expect(getSeverityFilter(5)).toBe("stable");
  });

  it("returns regressions for values 6 to 20", () => {
    expect(getSeverityFilter(6)).toBe("regressions");
    expect(getSeverityFilter(20)).toBe("regressions");
  });

  it("returns severe for values above 20", () => {
    expect(getSeverityFilter(21)).toBe("severe");
    expect(getSeverityFilter(50)).toBe("severe");
  });
});

// ---------------------------------------------------------------------------
// Unit tests — formatDelta
// ---------------------------------------------------------------------------
describe("formatDelta", () => {
  it("prepends + for positive values", () => {
    expect(formatDelta(12)).toBe("+12%");
  });

  it("does not prepend + for zero", () => {
    expect(formatDelta(0)).toBe("0%");
  });

  it("shows negative sign for negative values", () => {
    expect(formatDelta(-8)).toBe("-8%");
  });
});

// ---------------------------------------------------------------------------
// Unit tests — getAnnouncement
// ---------------------------------------------------------------------------
describe("getAnnouncement", () => {
  it("returns improvement message for negative values", () => {
    expect(getAnnouncement(-3)).toContain("improved");
  });

  it("returns stable message for values 0 to 5", () => {
    expect(getAnnouncement(0)).toContain("stable");
  });

  it("returns regression follow-up message for values 6 to 20", () => {
    expect(getAnnouncement(10)).toContain("regression");
  });

  it("returns severe message for values above 20", () => {
    expect(getAnnouncement(25)).toContain("Severe");
  });
});

// ---------------------------------------------------------------------------
// Unit tests — getCellId
// ---------------------------------------------------------------------------
describe("getCellId", () => {
  it("returns a string with row and run indices", () => {
    expect(getCellId(0, 2)).toBe("heatmap-cell-0-2");
  });

  it("handles large indices", () => {
    expect(getCellId(99, 50)).toBe("heatmap-cell-99-50");
  });
});

// ---------------------------------------------------------------------------
// Unit tests — normalizeCell
// ---------------------------------------------------------------------------
describe("normalizeCell", () => {
  it("returns { 0, 0 } for empty rows", () => {
    const result = normalizeCell(
      [],
      { rowIndex: 5, runIndex: 3 },
      "runtimeDelta",
      "all",
    );
    expect(result).toEqual({ rowIndex: 0, runIndex: 0 });
  });

  it("clamps rowIndex to the valid range", () => {
    const result = normalizeCell(
      HEATMAP_ROWS,
      { rowIndex: 999, runIndex: 0 },
      "runtimeDelta",
      "all",
    );
    expect(result.rowIndex).toBe(HEATMAP_ROWS.length - 1);
  });

  it("clamps runIndex to the valid range", () => {
    const result = normalizeCell(
      HEATMAP_ROWS,
      { rowIndex: 0, runIndex: 999 },
      "runtimeDelta",
      "all",
    );
    const maxRunIndex = HEATMAP_ROWS[0].runs.length - 1;
    expect(result.runIndex).toBe(maxRunIndex);
  });

  it("clamps negative rowIndex to 0", () => {
    const result = normalizeCell(
      HEATMAP_ROWS,
      { rowIndex: -5, runIndex: 0 },
      "runtimeDelta",
      "all",
    );
    expect(result.rowIndex).toBe(0);
  });

  it("returns the desired cell when severity filter is all", () => {
    const result = normalizeCell(
      HEATMAP_ROWS,
      { rowIndex: 1, runIndex: 2 },
      "runtimeDelta",
      "all",
    );
    expect(result).toEqual({ rowIndex: 1, runIndex: 2 });
  });

  it("falls back to first matching cell when desired cell does not match severity filter", () => {
    // Baseline runs have runtimeDelta 0, which is 'stable', not 'severe'.
    // All rows have baseline at runIndex 0 with delta 0 → stable.
    // Requesting 'severe' with cell (0,0) should fall back.
    const result = normalizeCell(
      HEATMAP_ROWS,
      { rowIndex: 0, runIndex: 0 },
      "runtimeDelta",
      "severe",
    );
    // Must land on a cell that is actually severe
    const run = HEATMAP_ROWS[result.rowIndex].runs[result.runIndex];
    expect(getSeverityFilter(run.runtimeDelta)).toBe("severe");
  });

  it("returns row 0, run 0 when no cell matches the severity filter", () => {
    // Create rows where all values are 0 (stable) then ask for 'severe'
    const stableRows: ContractHeatmapRow[] = [
      {
        contract: "test",
        suite: "suite",
        runs: [
          {
            id: "r1",
            label: "A",
            commit: "abc",
            runtimeDelta: 0,
            instructionDelta: 0,
            memoryDelta: 0,
          },
        ],
      },
    ];
    const result = normalizeCell(
      stableRows,
      { rowIndex: 0, runIndex: 0 },
      "runtimeDelta",
      "severe",
    );
    expect(result).toEqual({ rowIndex: 0, runIndex: 0 });
  });
});

// ---------------------------------------------------------------------------
// Unit tests — constants integrity
// ---------------------------------------------------------------------------
describe("HEATMAP_ROWS", () => {
  it("has at least one row", () => {
    expect(HEATMAP_ROWS.length).toBeGreaterThan(0);
  });

  it("each row has a non-empty contract name", () => {
    HEATMAP_ROWS.forEach((row) =>
      expect(row.contract.length).toBeGreaterThan(0),
    );
  });

  it("each row has at least one run", () => {
    HEATMAP_ROWS.forEach((row) => expect(row.runs.length).toBeGreaterThan(0));
  });

  it("all rows have the same number of runs (grid alignment)", () => {
    const counts = HEATMAP_ROWS.map((row) => row.runs.length);
    expect(new Set(counts).size).toBe(1);
  });
});

describe("METRICS", () => {
  it("contains three metrics", () => {
    expect(METRICS).toHaveLength(3);
  });

  it("each metric has key, label, unit, and description", () => {
    METRICS.forEach((m) => {
      expect(m.key).toBeDefined();
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.unit).toBe("%");
      expect(m.description.length).toBeGreaterThan(0);
    });
  });
});

describe("LEGEND_ITEMS", () => {
  it("covers all non-all severity filters", () => {
    const keys = LEGEND_ITEMS.map((item) => item.key);
    expect(keys).toContain("improvements");
    expect(keys).toContain("stable");
    expect(keys).toContain("regressions");
    expect(keys).toContain("severe");
  });
});

// ---------------------------------------------------------------------------
// Integration / regression — cross-module: getHeatClassName ↔ getSeverityFilter
// consistency and normalizeCell boundary behavior across metric types
// ---------------------------------------------------------------------------
describe("Integration: heat class and severity filter consistency", () => {
  it("getHeatClassName and getSeverityFilter agree on severity boundaries", () => {
    const testValues = [-100, -1, 0, 1, 5, 6, 10, 20, 21, 50, 100];

    testValues.forEach((value) => {
      const severity = getSeverityFilter(value);
      const className = getHeatClassName(value);

      switch (severity) {
        case "improvements":
          expect(className).toContain("emerald");
          break;
        case "stable":
          expect(className).toContain("amber");
          break;
        case "regressions":
          expect(className).toContain("orange");
          break;
        case "severe":
          expect(className).toContain("rose");
          break;
      }
    });
  });

  it("LEGEND_ITEMS class names match getHeatClassName output for their severity", () => {
    const severityToSampleValue: Record<string, number> = {
      improvements: -5,
      stable: 2,
      regressions: 10,
      severe: 30,
    };

    LEGEND_ITEMS.forEach((item) => {
      const sampleValue = severityToSampleValue[item.key];
      if (sampleValue !== undefined) {
        const heatClass = getHeatClassName(sampleValue);
        // Both should reference the same color family
        const legendColors = item.className.match(
          /(emerald|amber|orange|rose)/,
        )?.[0];
        const heatColors = heatClass.match(/(emerald|amber|orange|rose)/)?.[0];
        expect(heatColors).toBe(legendColors);
      }
    });
  });
});

describe("Integration: normalizeCell across all metric types", () => {
  const metrics: MetricKey[] = [
    "runtimeDelta",
    "instructionDelta",
    "memoryDelta",
  ];

  metrics.forEach((metricKey) => {
    it(`normalizeCell returns valid indices for metric=${metricKey} with filter=all`, () => {
      const cell = normalizeCell(
        HEATMAP_ROWS,
        { rowIndex: 2, runIndex: 1 },
        metricKey,
        "all",
      );
      expect(cell.rowIndex).toBeGreaterThanOrEqual(0);
      expect(cell.rowIndex).toBeLessThan(HEATMAP_ROWS.length);
      expect(cell.runIndex).toBeGreaterThanOrEqual(0);
      expect(cell.runIndex).toBeLessThan(
        HEATMAP_ROWS[cell.rowIndex].runs.length,
      );
    });

    it(`normalizeCell returns valid indices for metric=${metricKey} with filter=severe`, () => {
      const cell = normalizeCell(
        HEATMAP_ROWS,
        { rowIndex: 0, runIndex: 0 },
        metricKey,
        "severe",
      );
      expect(cell.rowIndex).toBeGreaterThanOrEqual(0);
      expect(cell.runIndex).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("Integration: heatmap data state rendering logic", () => {
  type DataState = "loading" | "error" | "success";

  function getVisibleElements(dataState: DataState) {
    return {
      skeletonVisible: dataState === "loading",
      errorVisible: dataState === "error",
      heatmapVisible: dataState === "success",
      summaryVisible: dataState === "success",
    };
  }

  it("loading state shows skeleton, hides heatmap and error", () => {
    const { skeletonVisible, errorVisible, heatmapVisible } =
      getVisibleElements("loading");
    expect(skeletonVisible).toBe(true);
    expect(errorVisible).toBe(false);
    expect(heatmapVisible).toBe(false);
  });

  it("error state shows error panel, hides skeleton and heatmap", () => {
    const { skeletonVisible, errorVisible, heatmapVisible } =
      getVisibleElements("error");
    expect(skeletonVisible).toBe(false);
    expect(errorVisible).toBe(true);
    expect(heatmapVisible).toBe(false);
  });

  it("success state shows heatmap and summary, hides skeleton and error", () => {
    const { skeletonVisible, errorVisible, heatmapVisible, summaryVisible } =
      getVisibleElements("success");
    expect(skeletonVisible).toBe(false);
    expect(errorVisible).toBe(false);
    expect(heatmapVisible).toBe(true);
    expect(summaryVisible).toBe(true);
  });

  it("only one branch is ever active at a time", () => {
    const states: DataState[] = ["loading", "error", "success"];
    for (const state of states) {
      const { skeletonVisible, errorVisible, heatmapVisible } =
        getVisibleElements(state);
      const activeCount = [
        skeletonVisible,
        errorVisible,
        heatmapVisible,
      ].filter(Boolean).length;
      expect(activeCount).toBe(1);
    }
  });
});
