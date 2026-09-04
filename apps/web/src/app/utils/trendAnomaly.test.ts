import { describe, it, expect } from "vitest";
import { CrashTrendPoint } from "../types";
import {
  ANOMALY_WINDOW_DAYS,
  MAD_TO_SIGMA,
  MIN_ROBUST_DEVIATION,
  SENSITIVITY_K,
  SENSITIVITY_PRESETS,
  AnomalySensitivity,
  AnomalySeriesPoint,
  buildDailyRateSeries,
  detectAnomalies,
  explainAnomaly,
  formatDateLabel,
  indexFlagsByDate,
  median,
  medianAbsoluteDeviation,
  robustDeviation,
} from "./trendAnomaly";

/** Build a series of consecutive days starting 2026-01-01 from raw values. */
function seriesFrom(
  values: number[],
  start = "2026-01-01",
): AnomalySeriesPoint[] {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  return values.map((value, i) => ({
    date: new Date(startMs + i * 86_400_000).toISOString().slice(0, 10),
    value,
  }));
}

/** Textbook population stddev — used only to PROVE MAD is the better choice. */
function populationStdDev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

describe("constants are pinned", () => {
  it("uses a 14-observed-day rolling window", () => {
    // Pinned deliberately: two full weeks so weekday/weekend duty cycles are
    // balanced inside every window, and >= 13 so up to 6 contaminated days
    // still cannot drag the median out of the quiet cluster.
    expect(ANOMALY_WINDOW_DAYS).toBe(14);
  });

  it("maps sensitivity presets to documented k values", () => {
    expect(SENSITIVITY_K).toEqual({ low: 4, medium: 3.5, high: 3 });
    expect(SENSITIVITY_PRESETS).toEqual(["low", "medium", "high"]);
  });

  it("pins the MAD consistency constant and the deviation floor", () => {
    expect(MAD_TO_SIGMA).toBeCloseTo(1.4826, 4);
    expect(MIN_ROBUST_DEVIATION).toBe(1);
  });
});

describe("robust primitives", () => {
  const medianCases: Array<{
    name: string;
    input: number[];
    expected: number;
  }> = [
    {
      name: "odd length takes the middle order statistic",
      input: [3, 1, 2],
      expected: 2,
    },
    {
      name: "even length averages the two middles",
      input: [4, 1, 3, 2],
      expected: 2.5,
    },
    { name: "single element", input: [7], expected: 7 },
    { name: "empty list degrades to 0", input: [], expected: 0 },
    {
      name: "ignores extreme outliers",
      input: [5, 5, 5, 5, 9000],
      expected: 5,
    },
  ];

  it.each(medianCases)("median: $name", ({ input, expected }) => {
    expect(median(input)).toBe(expected);
  });

  const madCases: Array<{ name: string; input: number[]; expected: number }> = [
    { name: "flat window has zero spread", input: [5, 5, 5, 5], expected: 0 },
    { name: "alternating ±1 gives MAD 1", input: [4, 6, 4, 6], expected: 1 },
    {
      name: "one wild outlier does not move MAD",
      input: [5, 5, 5, 5, 5, 500],
      expected: 0,
    },
  ];

  it.each(madCases)("MAD: $name", ({ input, expected }) => {
    expect(medianAbsoluteDeviation(input)).toBe(expected);
  });

  it("robustDeviation rescales MAD and applies the floor", () => {
    expect(robustDeviation([4, 6, 4, 6])).toBeCloseTo(MAD_TO_SIGMA, 6);
    // Degenerate window: MAD 0 would divide by zero, floor keeps it usable.
    expect(robustDeviation([5, 5, 5, 5])).toBe(MIN_ROBUST_DEVIATION);
  });

  it("median does not mutate its input", () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe("detectAnomalies — core behaviour", () => {
  it("flat series produces no flags", () => {
    const result = detectAnomalies(seriesFrom(Array(60).fill(7)), {
      sensitivity: "high",
    });
    expect(result.flags).toEqual([]);
    expect(result.coldStart.active).toBe(false);
    expect(result.evaluatedCount).toBe(60 - ANOMALY_WINDOW_DAYS);
  });

  it("flat-at-zero series still catches a real spike", () => {
    // MAD is 0 here; the floor is what keeps this detectable.
    const result = detectAnomalies(seriesFrom([...Array(14).fill(0), 50]));
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0]).toMatchObject({
      index: 14,
      value: 50,
      baseline: 0,
      deviation: 1,
      score: 50,
      direction: "spike",
    });
  });

  it("returns {index, score, baseline, threshold} for each flag", () => {
    const result = detectAnomalies(seriesFrom([...Array(14).fill(5), 40]));
    const [flag] = result.flags;
    expect(flag.index).toBe(14);
    expect(flag.baseline).toBe(5);
    expect(flag.threshold).toBe(8.5); // 5 + 3.5 × 1
    expect(flag.score).toBe(35);
    expect(flag.date).toBe("2026-01-15");
  });

  it("detects drops below the baseline as well as spikes", () => {
    const result = detectAnomalies(seriesFrom([...Array(14).fill(40), 0]));
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0].direction).toBe("drop");
    expect(result.flags[0].score).toBeLessThan(0);
    expect(result.flags[0].threshold).toBe(36.5); // 40 − 3.5 × 1
  });

  it("never lets a point contaminate its own baseline", () => {
    // Two consecutive spikes: the second is still measured against the quiet
    // days, because the window is trailing and exclusive.
    const result = detectAnomalies(seriesFrom([...Array(14).fill(5), 40, 41]));
    expect(result.flags.map((f) => f.index)).toEqual([14, 15]);
    expect(result.flags[1].baseline).toBe(5);
  });
});

describe("detectAnomalies — sensitivity presets", () => {
  // Window of fourteen 5s → baseline 5, MAD 0, floored deviation 1,
  // so score is simply (value − 5).
  const cases: Array<{
    value: number;
    score: number;
    flagged: Record<AnomalySensitivity, boolean>;
  }> = [
    { value: 5, score: 0, flagged: { low: false, medium: false, high: false } },
    { value: 7, score: 2, flagged: { low: false, medium: false, high: false } },
    { value: 8, score: 3, flagged: { low: false, medium: false, high: true } },
    {
      value: 8.5,
      score: 3.5,
      flagged: { low: false, medium: true, high: true },
    },
    { value: 9, score: 4, flagged: { low: true, medium: true, high: true } },
    { value: 99, score: 94, flagged: { low: true, medium: true, high: true } },
  ];

  it.each(cases)(
    "value $value (score $score) matches preset expectations",
    ({ value, score, flagged }) => {
      for (const sensitivity of SENSITIVITY_PRESETS) {
        const result = detectAnomalies(
          seriesFrom([...Array(14).fill(5), value]),
          {
            sensitivity,
          },
        );
        expect(result.k).toBe(SENSITIVITY_K[sensitivity]);
        expect(result.flags.length === 1).toBe(flagged[sensitivity]);
        if (flagged[sensitivity]) {
          expect(result.flags[0].score).toBeCloseTo(score, 6);
        }
      }
    },
  );

  it("defaults to the medium preset", () => {
    const result = detectAnomalies(seriesFrom(Array(20).fill(1)));
    expect(result.sensitivity).toBe("medium");
    expect(result.k).toBe(3.5);
  });

  it("scores against a rescaled MAD when the window is not degenerate", () => {
    // Window alternates 4/6 → median 5, MAD 1, deviation 1.4826.
    const window = Array.from({ length: 14 }, (_, i) => (i % 2 === 0 ? 4 : 6));
    const scoreOf = (v: number) => (v - 5) / MAD_TO_SIGMA;

    expect(scoreOf(10)).toBeCloseTo(3.3724, 3); // under 3.5, over 3
    expect(scoreOf(11)).toBeCloseTo(4.047, 3); // over every preset

    expect(
      detectAnomalies(seriesFrom([...window, 10]), { sensitivity: "medium" })
        .flags,
    ).toHaveLength(0);
    expect(
      detectAnomalies(seriesFrom([...window, 10]), { sensitivity: "high" })
        .flags,
    ).toHaveLength(1);
    expect(
      detectAnomalies(seriesFrom([...window, 11]), { sensitivity: "low" })
        .flags,
    ).toHaveLength(1);
  });
});

describe("detectAnomalies — cold start", () => {
  const coldCases: Array<{ days: number; active: boolean; more: number }> = [
    { days: 0, active: true, more: 14 },
    { days: 1, active: true, more: 13 },
    { days: 13, active: true, more: 1 },
    { days: 14, active: true, more: 0 }, // window full, but nothing after it yet
    { days: 15, active: false, more: 0 },
  ];

  it.each(coldCases)(
    "$days observed days → coldStart.active=$active",
    ({ days, active, more }) => {
      const result = detectAnomalies(seriesFrom(Array(days).fill(3)));
      expect(result.coldStart.active).toBe(active);
      expect(result.coldStart.moreDaysNeeded).toBe(more);
      expect(result.coldStart.observedDays).toBe(days);
      expect(result.coldStart.requiredDays).toBe(ANOMALY_WINDOW_DAYS);
    },
  );

  it("evaluates nothing and explains why while short of a full window", () => {
    // A huge value inside the cold-start prefix must NOT be flagged.
    const result = detectAnomalies(seriesFrom([1, 1, 900, 1, 1]));
    expect(result.flags).toEqual([]);
    expect(result.evaluatedCount).toBe(0);
    expect(result.firstEvaluatedIndex).toBe(-1);
    expect(result.coldStart.message).toBe(
      "Collecting baseline (9 more days) — 5 of 14 observed days recorded. " +
        "No anomalies are evaluated until the window is full.",
    );
  });

  it("uses singular copy for the final missing day", () => {
    const result = detectAnomalies(seriesFrom(Array(13).fill(2)));
    expect(result.coldStart.message).toContain("(1 more day)");
  });

  it("reports readiness once the window is satisfied", () => {
    const result = detectAnomalies(seriesFrom(Array(15).fill(2)));
    expect(result.coldStart.message).toBe(
      "Baseline ready: using the trailing 14 observed days.",
    );
    expect(result.firstEvaluatedIndex).toBe(14);
  });

  it("handles an empty series without throwing", () => {
    const result = detectAnomalies([]);
    expect(result.flags).toEqual([]);
    expect(result.coldStart.active).toBe(true);
    expect(result.coldStart.observedDays).toBe(0);
  });
});

describe("detectAnomalies — MAD robustness proof", () => {
  it("stays sensitive when the training window is outlier-heavy", () => {
    // Thirteen quiet days of 5 plus one contaminated 100-crash deploy day.
    const window = [...Array(13).fill(5), 100];
    const nextDay = 40;

    // Mean/stddev detector: the outlier inflates the spread and hides the spike.
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const sd = populationStdDev(window);
    const zScore = (nextDay - mean) / sd;
    expect(mean).toBeCloseTo(11.7857, 3);
    expect(sd).toBeCloseTo(24.4663, 3);
    expect(zScore).toBeLessThan(3); // MISSED by every preset
    expect(zScore).toBeCloseTo(1.153, 2);

    // Median/MAD detector: unmoved by the contamination, catches the spike.
    const result = detectAnomalies(seriesFrom([...window, nextDay]));
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0].baseline).toBe(5);
    expect(result.flags[0].score).toBe(35);
  });

  it("tolerates contamination up to but not beyond the breakdown point", () => {
    // 6 of 14 days contaminated: median still sits in the quiet cluster.
    const sixBad = [...Array(8).fill(5), ...Array(6).fill(500)];
    expect(median(sixBad)).toBe(5);
    expect(detectAnomalies(seriesFrom([...sixBad, 40])).flags).toHaveLength(1);
  });
});

describe("detectAnomalies — gaps in the series", () => {
  it("skips missing calendar days instead of imputing zeros", () => {
    // 14 observed days spread over ~a month, then a spike.
    const values = [...Array(14).fill(5), 40];
    const dates = [
      "2026-03-01",
      "2026-03-03",
      "2026-03-04",
      "2026-03-08",
      "2026-03-09",
      "2026-03-11",
      "2026-03-15",
      "2026-03-16",
      "2026-03-18",
      "2026-03-22",
      "2026-03-23",
      "2026-03-25",
      "2026-03-29",
      "2026-03-30",
      "2026-04-02",
    ];
    const series = dates.map((date, i) => ({ date, value: values[i] }));

    const result = detectAnomalies(series);
    expect(result.coldStart.active).toBe(false);
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0].date).toBe("2026-04-02");
    // Baseline is 5 — proof that the ~17 absent calendar days were not
    // silently counted as zero-crash days (that would have pulled it down).
    expect(result.flags[0].baseline).toBe(5);
  });
});

describe("detectAnomalies — performance", () => {
  it("processes a 365-day series effectively instantly", () => {
    const values = Array.from({ length: 365 }, (_, i) =>
      i % 29 === 0 ? 80 : 4 + (i % 3),
    );
    const series = seriesFrom(values);

    const started = performance.now();
    const result = detectAnomalies(series);
    const elapsed = performance.now() - started;

    expect(result.evaluatedCount).toBe(365 - ANOMALY_WINDOW_DAYS);
    expect(result.flags.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(50);
  });
});

describe("explainAnomaly", () => {
  it("generates a plain-language sentence from the numbers", () => {
    const result = detectAnomalies(
      seriesFrom([...Array(14).fill(5), 40], "2026-07-29"),
    );
    expect(explainAnomaly(result.flags[0])).toBe(
      "12 Aug 2026 recorded 40 crashes, against a 14-day baseline of 5 " +
        "(typical day-to-day spread ±1). That is 35.0 robust deviations above " +
        "the baseline, past the 3.5× threshold of 8.5 above which a day counts as unusual.",
    );
  });

  it("phrases drops in the other direction", () => {
    const result = detectAnomalies(seriesFrom([...Array(14).fill(40), 0]));
    const sentence = explainAnomaly(result.flags[0]);
    expect(sentence).toContain("robust deviations below the baseline");
    expect(sentence).toContain("below which a day counts as unusual");
  });

  it("uses singular copy for a one-crash day", () => {
    const result = detectAnomalies(seriesFrom([...Array(14).fill(20), 1]));
    expect(explainAnomaly(result.flags[0])).toContain("recorded 1 crash,");
  });
});

describe("formatDateLabel", () => {
  const cases: Array<[string, string]> = [
    ["2026-08-12", "12 Aug 2026"],
    ["2026-01-01", "1 Jan 2026"],
    ["2026-12-31", "31 Dec 2026"],
    ["not-a-date", "not-a-date"],
  ];

  it.each(cases)("%s → %s", (input, expected) => {
    expect(formatDateLabel(input)).toBe(expected);
  });
});

describe("buildDailyRateSeries", () => {
  const chartData: CrashTrendPoint[] = [
    { date: "2026-02-02", sigB: 1 },
    { date: "2026-02-01", sigA: 3, sigB: 2 },
    { date: "2026-02-04", sigA: 5 },
  ];

  it("sums every signature by default and sorts ascending by date", () => {
    expect(buildDailyRateSeries(chartData)).toEqual([
      { date: "2026-02-01", value: 5 },
      { date: "2026-02-02", value: 1 },
      { date: "2026-02-04", value: 5 },
    ]);
  });

  it("restricts the total to the selected signatures", () => {
    expect(buildDailyRateSeries(chartData, ["sigA"])).toEqual([
      { date: "2026-02-01", value: 3 },
      { date: "2026-02-02", value: 0 },
      { date: "2026-02-04", value: 5 },
    ]);
  });

  it("leaves calendar gaps as gaps (2026-02-03 is absent, not zero)", () => {
    expect(buildDailyRateSeries(chartData).map((p) => p.date)).not.toContain(
      "2026-02-03",
    );
  });

  it("returns an empty series for empty input", () => {
    expect(buildDailyRateSeries([])).toEqual([]);
  });
});

describe("indexFlagsByDate", () => {
  it("keys flags by their date for O(1) chart lookups", () => {
    const { flags } = detectAnomalies(seriesFrom([...Array(14).fill(5), 40]));
    const byDate = indexFlagsByDate(flags);
    expect(byDate.get("2026-01-15")?.score).toBe(35);
    expect(byDate.has("2026-01-01")).toBe(false);
  });
});
